const path = require('path');
const { videoEncodeArgs } = require('../transcoder');
const { audioBitrateFor } = require('./plan');

/**
 * Lệnh ffmpeg cho đường chia đoạn. Hàm thuần: chỉ trả về mảng đối số, không chạy gì.
 *
 * Cờ mã hoá hình lấy từ `videoEncodeArgs` của đường một-job nên hai đường không thể
 * lệch tham số. Chỉ phần GOP/keyframe, âm thanh và timestamp là riêng của đường này.
 */

const isHttp = (url) => /^https?:\/\//i.test(url);

/**
 * Cờ đọc qua HTTP: nguồn nằm trên S3 và được đọc bằng Range request, không tải về.
 * Tự nối lại khi S3 hoặc mạng ngắt giữa chừng, vì một đoạn chạy hàng chục phút và
 * chỉ cần một lần ngắt là mất cả đoạn. Chỉ áp cho URL http(s): nguồn cục bộ (kiểm
 * thử) không nhận các cờ này.
 */
const HTTP_INPUT_OPTIONS = [
  '-reconnect', '1',
  '-reconnect_streamed', '1',
  '-reconnect_on_network_error', '1',
  '-reconnect_delay_max', '10',
  // 60 s không đọc được byte nào thì coi là treo, thay vì chờ tới khi job bị dừng.
  '-rw_timeout', '60000000',
];

const httpInputOptions = (url) => (isHttp(url) ? HTTP_INPUT_OPTIONS : []);

const seconds = (value) => Number(value).toFixed(6);

/** Số thứ tự đoạn có đệm số 0, để tên segment của mọi đoạn khác nhau và xếp đúng thứ tự. */
const chunkLabel = (index) => String(index).padStart(4, '0');

/**
 * Mã hoá MỘT LẦN toàn bộ âm thanh của nguồn ở một bitrate (E4 trong tài liệu thiết kế).
 *
 * Không chọn luồng bằng `-map 0:a:0` mà dùng chỉ số tuyệt đối do planner đọc từ ffprobe,
 * để chọn đúng luồng mà đường một-job sẽ chọn (ffmpeg ưu tiên luồng nhiều kênh nhất).
 * `+faststart` đưa moov lên đầu để các job đoạn đọc một dải qua HTTP không phải dò
 * tới cuối tệp.
 */
const buildAudioArgs = ({ inputUrl, streamIndex, bitrate, outputPath }) => [
  '-hide_banner',
  '-loglevel', 'warning',
  '-stats',
  '-y',
  ...httpInputOptions(inputUrl),
  '-i', inputUrl,
  '-map', `0:${streamIndex}`,
  '-c:a', 'aac',
  '-b:a', bitrate,
  '-ar', '44100',
  '-ac', '2',
  '-movflags', '+faststart',
  outputPath,
];

/** Cửa sổ đọc của một đoạn: `-ss` và `-t` đặt TRƯỚC `-i` để tua ở đầu vào, không giải mã từ đầu tệp. */
const windowArgs = (chunk) => [
  ...(chunk.seekSeconds > 0 ? ['-ss', seconds(chunk.seekSeconds)] : []),
  ...(chunk.durationSeconds === null || chunk.durationSeconds === undefined ? [] : ['-t', seconds(chunk.durationSeconds)]),
];

/**
 * Mã hoá MỘT đoạn của mọi mức trong một tiến trình ffmpeg.
 *
 * - Hình: đọc qua HTTP đúng cửa sổ của đoạn.
 * - Âm thanh: KHÔNG mã hoá lại (E3: mỗi encoder AAC mới chèn khung khởi động và rớt ~23 ms
 *   tại ranh giới) mà sao chép (`-c:a copy`) dải khung của đoạn từ tệp âm thanh đã mã hoá
 *   một lần. Mỗi ranh giới còn đúng một khung AAC trùng lặp giống hệt (E4).
 * - GOP cố định `G` khung, không dùng `-force_key_frames` theo giây: biểu thức theo giây
 *   lệch dần một khung mỗi ~5,5 segment ở 29,97 fps và để lại segment cụt cuối đoạn.
 *   Bộ cắt HLS cắt tại mỗi keyframe vì GOP quy ra giây >= độ dài segment (plan.gopFramesFor).
 * - `-output_ts_offset` đặt theo kế hoạch, giống nhau cho mọi mức của đoạn.
 * - Tên segment chứa số thứ tự đoạn (`segment_c0042_000.ts`) và đánh số lại từ 0 trong mỗi
 *   đoạn: tên của các đoạn không bao giờ trùng nhau dù một đoạn ra nhiều hay ít segment
 *   hơn kế hoạch, nên không đoạn nào ghi đè nhầm lên đoạn khác.
 *
 * @param {object} p
 * @param {string} p.videoUrl - URL (hoặc đường dẫn) của nguồn
 * @param {number} p.videoStreamIndex
 * @param {{bitrate: string, url: string}[]} p.audio - các tệp âm thanh đã mã hoá, rỗng nếu nguồn không có tiếng
 * @param {object[]} p.renditions - đã qua planRenditions
 * @param {object} p.chunk - một phần tử của buildChunkPlan().chunks
 * @param {number} p.gopFrames
 * @param {number} p.segmentSeconds
 * @param {string} p.outputDir
 */
const buildChunkArgs = ({ videoUrl, videoStreamIndex, audio = [], renditions, chunk, gopFrames, segmentSeconds, outputDir }) => {
  const args = ['-hide_banner', '-loglevel', 'warning', '-stats', '-y'];

  args.push(...httpInputOptions(videoUrl), ...windowArgs(chunk), '-i', videoUrl);
  for (const track of audio) {
    args.push(...httpInputOptions(track.url), ...windowArgs(chunk), '-i', track.url);
  }

  for (const r of renditions) {
    args.push('-map', `0:${videoStreamIndex}`);

    // Tệp âm thanh có đúng một luồng âm thanh; đầu vào 0 là nguồn nên tệp đầu tiên là đầu vào 1.
    const audioInput = audio.findIndex((a) => a.bitrate === audioBitrateFor(r.name));
    if (audioInput >= 0) args.push('-map', `${audioInput + 1}:a:0`);

    args.push(
      ...videoEncodeArgs(r),
      '-g', String(gopFrames),
      '-keyint_min', String(gopFrames),
      // Tắt scene detection: để encoder tự chèn keyframe theo cảnh thì các mức có thể
      // cắt lệch nhau, vi phạm RFC 8216 §6.2.4.
      '-sc_threshold', '0'
    );
    if (audioInput >= 0) args.push('-c:a', 'copy');

    args.push(
      '-output_ts_offset', seconds(chunk.tsOffsetSeconds),
      '-f', 'hls',
      '-hls_time', String(segmentSeconds),
      '-hls_list_size', '0',
      '-start_number', '0',
      '-hls_segment_filename', path.join(outputDir, r.name, `segment_c${chunkLabel(chunk.index)}_%03d.ts`),
      path.join(outputDir, r.name, 'playlist.m3u8')
    );
  }

  return args;
};

module.exports = {
  buildAudioArgs,
  buildChunkArgs,
  httpInputOptions,
  chunkLabel,
  HTTP_INPUT_OPTIONS,
};
