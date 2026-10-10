/**
 * Kế hoạch chia video thành các đoạn để mã hoá song song (docs/CHUNKED_TRANSCODING_DESIGN.md).
 *
 * Toàn bộ là hàm thuần, không đụng ffmpeg hay AWS, để kiểm thử được bằng số học.
 * Mọi quyết định ở đây đều dựa trên các phép đo E1-E5 trong tài liệu thiết kế:
 *
 * - Ranh giới đoạn phải là bội của GOP tính bằng KHUNG HÌNH, không phải giây tròn:
 *   ở 29,97 fps một GOP 180 khung dài 6,006 s, nên đoạn 18 s sinh thêm một segment
 *   0,033 s (E1).
 * - Mọi đoạn, kể cả đoạn 0, dùng cùng một offset nền cho `-output_ts_offset` (E2).
 */

/** Ước chung lớn nhất của hai số nguyên dương. */
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));

/**
 * Đọc framerate thành phân số nguyên tối giản `{ num, den }`.
 *
 * Giữ nguyên dạng phân số (30000/1001) thay vì đổi sang số thực 29,97: ranh giới
 * đoạn được tính bằng số nguyên nên không tích luỹ sai số dấu phẩy động qua hàng
 * nghìn khung hình. Nhận chuỗi "30000/1001", "25/1", số "25", hoặc `{num, den}`.
 * Trả về `null` khi không đọc được (gồm "0/0" mà ffprobe dùng cho "không rõ").
 */
const parseRational = (value) => {
  let num;
  let den;

  if (value && typeof value === 'object') {
    ({ num, den } = value);
  } else if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Số thực thường là tạo tác của phép chia; nhân 1001 chỉ để bắt các tốc độ NTSC.
    for (const candidate of [1, 1001]) {
      const scaled = value * candidate;
      if (Math.abs(scaled - Math.round(scaled)) < 1e-6) {
        num = Math.round(scaled);
        den = candidate;
        break;
      }
    }
    if (!num) return null;
  } else if (typeof value === 'string') {
    const match = /^\s*(\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(value);
    if (!match) return null;
    num = Number(match[1]);
    den = match[2] === undefined ? 1 : Number(match[2]);
  } else {
    return null;
  }

  if (!Number.isInteger(num) || !Number.isInteger(den) || num <= 0 || den <= 0) return null;
  const divisor = gcd(num, den);
  return { num: num / divisor, den: den / divisor };
};

/** Thời lượng của một khung hình, giây. */
const frameSeconds = (fps) => fps.den / fps.num;

/**
 * Số khung hình mỗi GOP = số khung hình mỗi segment.
 *
 * Làm tròn LÊN (khác `computeGopSize` của đường một-job, làm tròn xuống): để mỗi
 * keyframe tới đúng lúc bộ cắt HLS cần một segment mới, GOP quy ra giây phải
 * >= độ dài segment. Khi đó mỗi GOP là đúng một segment, nên số segment của một
 * đoạn bằng số GOP của nó. Tính bằng số nguyên: ceil(6 * num / den).
 *
 *   25 fps → 150 (6,000 s)   29,97 fps → 180 (6,006 s)   23,976 fps → 144 (6,006 s)
 */
const gopFramesFor = (fps, segmentSeconds) =>
  Math.max(1, Math.floor((segmentSeconds * fps.num + fps.den - 1) / fps.den));

const toFixedSeconds = (value) => Math.round(value * 1e6) / 1e6;

/**
 * Số GOP mỗi đoạn, chọn theo công suất song song thực có thay vì một con số cố định.
 *
 * Vì sao: với đoạn dài cố định 5 phút, video 25 phút chỉ ra 5 đoạn nên chỉ dùng 5 trong 8 vCPU, và
 * thời gian cả video bằng đoạn CHẬM NHẤT. Đo trên production, 5 đoạn cùng khối lượng chạy 18,2 /
 * 18,4 / 21,1 / 28,3 / 32,6 phút (Fargate Spot lệch tới 1,8 lần giữa các máy), tức 89% thời gian
 * nằm ở đoạn chậm nhất. Nhiều đoạn nhỏ hơn số chỗ chạy thì máy nhanh nhận thêm việc khi xong sớm
 * (xếp lịch động) và đoạn chậm nhất chỉ còn là một phần nhỏ của tổng việc.
 *
 * `targetChunks` = số đoạn mong muốn (thường là số chỗ chạy x vài đoạn mỗi chỗ). Kết quả bị chặn
 * giữa `minGops` (mỗi đoạn tốn chừng 30-40 giây khởi động container và mở nguồn nên không đáng
 * nhỏ hơn) và `maxGops` (hành vi cũ: 50 GOP, ~5 phút; video đủ dài vẫn ra các đoạn 5 phút).
 * `targetChunks` < 2 nghĩa là tắt: trả `maxGops`.
 */
const chooseGopsPerChunk = ({ frameCount, fps, segmentSeconds = 6, maxGops = 50, minGops = 10, targetChunks = 0 }) => {
  const ceiling = Math.max(1, Math.floor(maxGops));
  if (!(targetChunks >= 2) || !fps || !(frameCount > 0)) return ceiling;
  const floor = Math.min(ceiling, Math.max(1, Math.floor(minGops)));
  const totalGops = Math.max(1, Math.floor(frameCount / gopFramesFor(fps, segmentSeconds)));
  return Math.min(ceiling, Math.max(floor, Math.ceil(totalGops / Math.floor(targetChunks))));
};

/**
 * Chia `frameCount` khung hình thành các đoạn.
 *
 * Mỗi đoạn (trừ đoạn cuối) dài đúng `gopsPerChunk` GOP. Đoạn cuối mở: không có
 * `-t`, đọc tới hết tệp, nên số khung hình ước lượng sai vài khung cũng không làm
 * mất hay thừa hình. Phần dư ngắn hơn một GOP được gộp vào đoạn liền trước thay vì
 * thành một đoạn riêng chỉ vài khung (và có thể rỗng nếu ước lượng cao hơn thật).
 *
 * Quy tắc duy nhất giữ cho mọi đoạn thẳng hàng: MỌI THỨ nằm ở vị trí T trong tệp nguồn
 * có pts đầu ra = T + tsOffsetBase (+ 1,4 s độ trễ cố định của muxer, E2). Khung n nằm ở
 * `T_n = videoStartOffset + n/fps` (không phải `n/fps`: luồng hình có thể bắt đầu muộn
 * hơn tệp). Gọi T_f là vị trí khung đầu của đoạn:
 *
 *   hình     `-ss` = T_f − nửa khung, `-t` kéo tới nửa khung trước khung đầu đoạn kế. Nửa
 *            khung là biên an toàn: `-ss` giữ khung có pts >= vị trí, nên trúng khung đầu
 *            và không dính khung trước dù timestamp lệch vài ms. Bộ lọc `setpts=PTS-STARTPTS`
 *            (xem buildChunkArgs) đặt khung đầu ra ĐÚNG pts 0 nên nửa khung đó biến mất khỏi
 *            đầu ra, và:
 *   offset   `-output_ts_offset` = T_f + tsOffsetBase. Đo thực tế (scripts/verify-chunked.js)
 *            chỉ ra rằng bù nửa khung ở đây làm đoạn 0 chồng lên đoạn 1 16,7 ms.
 *   tiếng    `-ss` = ĐÚNG T_f, không lùi nửa khung: tiếng được sao chép nguyên timestamp nên
 *            không đi qua bộ lọc setpts như hình, và pts = T − T_f + offset = T + tsOffsetBase,
 *            cùng hằng số với hình. Lùi nửa khung sẽ làm tiếng trễ 16,7 ms so với hình.
 *
 * `-ss` không bao giờ âm: đoạn 0 có `seek` hình bị chặn ở 0, vẫn đúng vì khung đầu của nó
 * (T_f = videoStartOffset, thường ~0) cũng được setpts đưa về pts 0.
 *
 * @param {object} p
 * @param {number} p.frameCount - số khung hình (ước lượng) của luồng hình
 * @param {{num:number, den:number}} p.fps
 * @param {number} [p.videoStartOffset=0] - start_time luồng hình trừ start_time tệp, giây
 * @param {number} [p.segmentSeconds=6]
 * @param {number} [p.gopsPerChunk=50]
 * @param {number} [p.tsOffsetBase=1] - hằng số chung của `-output_ts_offset`, giây (>= 0,1: E2)
 */
const buildChunkPlan = ({
  frameCount,
  fps,
  videoStartOffset = 0,
  segmentSeconds = 6,
  gopsPerChunk = 50,
  tsOffsetBase = 1,
}) => {
  if (!fps || !(frameCount > 0)) {
    throw new Error('buildChunkPlan: cần framerate và số khung hình dương');
  }
  if (!Number.isInteger(gopsPerChunk) || gopsPerChunk < 1) {
    throw new Error('buildChunkPlan: gopsPerChunk phải là số nguyên dương');
  }

  const d = frameSeconds(fps);
  const gop = gopFramesFor(fps, segmentSeconds);
  const chunkFrames = gop * gopsPerChunk;

  let count = Math.ceil(frameCount / chunkFrames);
  const remainder = frameCount - (count - 1) * chunkFrames;
  if (count > 1 && remainder < gop) count -= 1;

  const chunks = [];
  for (let index = 0; index < count; index += 1) {
    const isLast = index === count - 1;
    const startFrame = index * chunkFrames;
    const firstFrameAt = videoStartOffset + startFrame * d;
    const videoWindowStart = firstFrameAt - 0.5 * d;
    const videoSeek = Math.max(0, videoWindowStart);

    chunks.push({
      index,
      startFrame,
      frames: isLast ? null : chunkFrames,
      // Hình
      seekSeconds: toFixedSeconds(videoSeek),
      durationSeconds: isLast ? null : toFixedSeconds(videoWindowStart + chunkFrames * d - videoSeek),
      // Tiếng: cửa sổ bắt đầu đúng tại khung đầu. Độ dài điền ở dưới.
      audioSeekSeconds: toFixedSeconds(firstFrameAt),
      audioDurationSeconds: null,
      tsOffsetSeconds: toFixedSeconds(firstFrameAt + tsOffsetBase),
      // Đoạn cuối không biết trước số segment (đọc tới hết tệp): null.
      expectedSegments: isLast ? null : gopsPerChunk,
      expectedSeconds: isLast ? null : toFixedSeconds(chunkFrames * d),
    });
  }

  // Cửa sổ tiếng của đoạn k kết thúc ĐÚNG chỗ cửa sổ đoạn k+1 bắt đầu: độ dài là hiệu của hai
  // mốc đã làm tròn, không làm tròn riêng. Làm tròn riêng có thể lệch 1 µs; ffmpeg chọn gói
  // AAC theo pts so với `-ss` và `-ss + -t`, nên một gói nằm trong 1 µs đó sẽ bị lặp hoặc mất.
  for (let k = 0; k < chunks.length - 1; k += 1) {
    chunks[k].audioDurationSeconds = toFixedSeconds(chunks[k + 1].audioSeekSeconds - chunks[k].audioSeekSeconds);
  }

  return {
    fps,
    gopFrames: gop,
    gopSeconds: toFixedSeconds(gop * d),
    segmentSeconds,
    gopsPerChunk,
    chunkFrames,
    chunkSeconds: toFixedSeconds(chunkFrames * d),
    frameCount,
    chunks,
  };
};

/**
 * Số khung hình của luồng hình, ước lượng từ những gì ffprobe trả về.
 *
 * Ưu tiên `nb_frames` (MP4 ghi đúng), rồi thời lượng RIÊNG của luồng hình, cuối cùng
 * mới là thời lượng cả tệp, vốn là max của mọi luồng nên có thể dài hơn hình khi
 * âm thanh dài hơn. Đoạn cuối mở nên sai số này chỉ ảnh hưởng số đoạn, không ảnh
 * hưởng nội dung.
 */
const estimateFrameCount = ({ nbFrames, videoDuration, formatDuration }, fps) => {
  if (Number.isFinite(nbFrames) && nbFrames > 0) return Math.floor(nbFrames);
  const seconds = [videoDuration, formatDuration].find((s) => Number.isFinite(s) && s > 0);
  return seconds ? Math.max(1, Math.round((seconds * fps.num) / fps.den)) : 0;
};

/**
 * Nhóm bitrate âm thanh cho video dài: chỉ hai thay vì năm mức.
 *
 * Mỗi bitrate là một lượt mã hoá riêng của toàn bộ âm thanh (E4), nên số bitrate
 * nhân thẳng vào thời gian của bước âm thanh. 64k đủ cho các mức nhỏ (<= 480p),
 * 128k cho 720p/1080p. Quyết định theo tên mức ("480p") chứ không theo kích thước
 * đầu ra, vì video dọc đảo chiều chiều cao và chiều rộng.
 */
const AUDIO_GROUPS = [
  { bitrate: '64k', maxLine: 480 },
  { bitrate: '128k', maxLine: Infinity },
];

const audioBitrateFor = (renditionName) => {
  const line = parseInt(renditionName, 10);
  const group = AUDIO_GROUPS.find((g) => line <= g.maxLine) || AUDIO_GROUPS[AUDIO_GROUPS.length - 1];
  return group.bitrate;
};

/** Danh sách bitrate âm thanh thực sự cần mã hoá cho các mức đã chọn, theo thứ tự cố định. */
const audioBitratesFor = (renditions) => [...new Set(renditions.map((r) => audioBitrateFor(r.name)))];

module.exports = {
  parseRational,
  frameSeconds,
  gopFramesFor,
  chooseGopsPerChunk,
  buildChunkPlan,
  estimateFrameCount,
  audioBitrateFor,
  audioBitratesFor,
  AUDIO_GROUPS,
};
