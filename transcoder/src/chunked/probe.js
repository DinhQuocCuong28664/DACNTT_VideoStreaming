const { spawn } = require('child_process');
const { displaySize } = require('../transcoder');
const { parseRational, estimateFrameCount, frameSeconds } = require('./plan');
const { httpInputOptions } = require('./ffmpegArgs');

/**
 * Đọc và đánh giá nguồn TRƯỚC khi quyết định có chia đoạn hay không.
 *
 * ffprobe đọc thẳng qua HTTP (~3 MiB, E5) nên bước này không tải tệp nguồn về.
 */

const number = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/**
 * Rút gọn đầu ra JSON của ffprobe thành đúng các trường pipeline chia đoạn cần.
 *
 * Luồng hình là luồng hình ĐẦU TIÊN không phải ảnh bìa (`attached_pic`): MP4 có ảnh bìa
 * khai nó như một luồng video. Luồng âm thanh là luồng nhiều kênh nhất (đầu tiên khi
 * hoà), đúng quy tắc mặc định của ffmpeg, để đường chia đoạn nghe cùng thứ với đường
 * một-job.
 */
const summarizeProbe = (info) => {
  const streams = (info && info.streams) || [];
  const format = (info && info.format) || {};

  const videoStream = streams.find((s) => s.codec_type === 'video' && !(s.disposition && s.disposition.attached_pic));
  const audioStream = streams
    .filter((s) => s.codec_type === 'audio')
    .reduce((best, s) => (!best || (number(s.channels) || 0) > (number(best.channels) || 0) ? s : best), null);

  const formatStart = number(format.start_time) || 0;

  return {
    formatDuration: number(format.duration),
    formatStart,
    video: videoStream
      ? {
          index: videoStream.index,
          codec: videoStream.codec_name,
          fps: parseRational(videoStream.avg_frame_rate),
          // r_frame_rate là "tốc độ cơ sở": bằng avg ở nguồn CFR, vênh xa ở nguồn VFR
          // (điện thoại hay khai 1000/1 hoặc 90000/1).
          baseFps: parseRational(videoStream.r_frame_rate),
          nbFrames: number(videoStream.nb_frames),
          duration: number(videoStream.duration),
          start: number(videoStream.start_time),
          size: displaySize(videoStream),
        }
      : null,
    audio: audioStream
      ? {
          index: audioStream.index,
          codec: audioStream.codec_name,
          channels: number(audioStream.channels),
          start: number(audioStream.start_time),
          duration: number(audioStream.duration),
        }
      : null,
  };
};

/** Khoảng framerate được coi là thật (cùng ý nghĩa với MIN/MAX_PLAUSIBLE_FPS ở transcoder.js). */
const MIN_FPS = 10;
const MAX_FPS = 120;
/** Hình và tiếng được phép lệch điểm bắt đầu tối đa chừng này giây mà không cần hiệu chỉnh. */
const MAX_AV_START_SKEW_SECONDS = 0.25;
/** avg và r_frame_rate được phép lệch nhau tối đa chừng này (tỉ lệ) mà vẫn coi là tốc độ không đổi. */
const MAX_FPS_DISAGREEMENT = 0.01;

/**
 * Nguồn có chia đoạn được an toàn không. Nếu không, trả lý do để ghi log và lùi về đường
 * một-job (quyết định 4 của tài liệu thiết kế): lùi lại có thể chậm hoặc bị rào chắn thời
 * gian chặn, nhưng không bao giờ sinh ra một video sai.
 *
 * Chia đoạn cần biết khung hình thứ n nằm ở đâu: chỉ đúng khi tốc độ khung hình không đổi.
 */
const evaluateEligibility = (summary) => {
  const { video, audio } = summary;
  if (!video) return { ok: false, reason: 'không có luồng hình' };
  if (!video.fps) return { ok: false, reason: 'không đọc được framerate' };

  const fps = video.fps.num / video.fps.den;
  if (fps < MIN_FPS || fps > MAX_FPS) return { ok: false, reason: `framerate ${fps.toFixed(2)} ngoài khoảng tin cậy` };

  if (video.baseFps) {
    const base = video.baseFps.num / video.baseFps.den;
    if (Math.abs(fps - base) / base > MAX_FPS_DISAGREEMENT) {
      return { ok: false, reason: `tốc độ khung hình thay đổi (VFR): avg ${fps.toFixed(3)} khác r ${base.toFixed(3)}` };
    }
  }

  if (estimateFrameCount(frameSources(summary), video.fps) <= 0) {
    return { ok: false, reason: 'không biết thời lượng luồng hình' };
  }

  if (audio) {
    const skew = Math.abs((audio.start || 0) - (video.start || 0));
    if (skew > MAX_AV_START_SKEW_SECONDS) {
      return { ok: false, reason: `hình và tiếng bắt đầu lệch nhau ${skew.toFixed(2)} s` };
    }
  }

  return { ok: true };
};

const frameSources = (summary) => ({
  nbFrames: summary.video && summary.video.nbFrames,
  videoDuration: summary.video && summary.video.duration,
  formatDuration: summary.formatDuration,
});

/** Thông số mà planner cần từ bản tóm tắt: số khung hình, độ lệch điểm bắt đầu của hình. */
const planningInputs = (summary) => {
  const { video } = summary;
  const frames = estimateFrameCount(frameSources(summary), video.fps);
  return {
    fps: video.fps,
    frameCount: frames,
    // start_time của luồng hình tính từ đầu tệp (xem chú thích `seek` ở buildChunkPlan).
    videoStartOffset: Math.max(0, (video.start || 0) - summary.formatStart),
    // Thời lượng để hiển thị/lưu: ưu tiên của luồng hình, vì đó là thứ người xem thấy.
    duration: video.duration || summary.formatDuration || frames * frameSeconds(video.fps),
  };
};

/**
 * Chạy ffprobe trên `source` (URL http(s) hoặc đường dẫn) và trả về bản tóm tắt.
 * Có thời hạn cứng: nguồn treo không được giữ job chờ vô hạn trước cả khi đường chia đoạn bắt đầu.
 */
const probeSource = (source, { timeoutMs = 120000 } = {}) =>
  new Promise((resolve, reject) => {
    const args = [
      '-v', 'error',
      '-print_format', 'json',
      '-show_format',
      '-show_streams',
      ...httpInputOptions(source),
      source,
    ];

    const proc = spawn('ffprobe', args);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`ffprobe không trả lời sau ${Math.round(timeoutMs / 1000)} s`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => { stdout += chunk; });
    proc.stderr.on('data', (chunk) => { stderr += chunk; });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`ffprobe thất bại (mã ${code}): ${stderr.trim().slice(0, 300)}`));
        return;
      }
      try {
        resolve(summarizeProbe(JSON.parse(stdout)));
      } catch (e) {
        reject(new Error(`Không đọc được đầu ra ffprobe: ${e.message}`));
      }
    });
  });

module.exports = {
  summarizeProbe,
  evaluateEligibility,
  planningInputs,
  probeSource,
  MAX_AV_START_SKEW_SECONDS,
};
