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

const toFixedSeconds = (value) => Number(value.toFixed(6));

/**
 * Chia `frameCount` khung hình thành các đoạn.
 *
 * Mỗi đoạn (trừ đoạn cuối) dài đúng `gopsPerChunk` GOP. Đoạn cuối mở: không có
 * `-t`, đọc tới hết tệp, nên số khung hình ước lượng sai vài khung cũng không làm
 * mất hay thừa hình. Phần dư ngắn hơn một GOP được gộp vào đoạn liền trước thay vì
 * thành một đoạn riêng chỉ vài khung (và có thể rỗng nếu ước lượng cao hơn thật).
 *
 * Bộ ba (seek, duration, tsOffset) của mỗi đoạn:
 *
 *   seek     = vị trí `-ss` TRƯỚC `-i`, lùi nửa khung so với khung đầu của đoạn. Nửa
 *              khung là biên an toàn: `-ss` giữ khung có pts >= vị trí, nên đúng
 *              khung đầu và không dính khung trước dù timestamp lệch vài ms; tính
 *              theo `videoStartOffset` (start_time của luồng hình so với tệp) vì
 *              khung n nằm ở `videoStartOffset + n/fps` chứ không phải `n/fps`.
 *   duration = `-t`, cửa sổ đọc tới nửa khung trước khung đầu của đoạn kế.
 *   tsOffset = `-output_ts_offset`, đặt sao cho pts đầu ra = vị trí trong tệp + hằng
 *              số chung mọi đoạn. Đoạn 0 có `seek` bị chặn ở 0 (không có `-ss` âm)
 *              nên bù phần chênh vào offset, để đoạn 0 vẫn thẳng hàng với các đoạn sau.
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
    const windowStart = videoStartOffset + (startFrame - 0.5) * d;
    const seek = Math.max(0, windowStart);

    chunks.push({
      index,
      startFrame,
      frames: isLast ? null : chunkFrames,
      seekSeconds: toFixedSeconds(seek),
      durationSeconds: isLast ? null : toFixedSeconds(windowStart + chunkFrames * d - seek),
      tsOffsetSeconds: toFixedSeconds(startFrame * d + tsOffsetBase + (seek - windowStart)),
      // Đoạn cuối không biết trước số segment (đọc tới hết tệp): null.
      expectedSegments: isLast ? null : gopsPerChunk,
      expectedSeconds: isLast ? null : toFixedSeconds(chunkFrames * d),
    });
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
  buildChunkPlan,
  estimateFrameCount,
  audioBitrateFor,
  audioBitratesFor,
  AUDIO_GROUPS,
};
