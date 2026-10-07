const fs = require('fs');
const path = require('path');
const { parseMediaPlaylist } = require('../transcoder');

/**
 * Ghép kết quả của các đoạn thành playlist hoàn chỉnh (hàm thuần, trừ readChunkRendition).
 *
 * Mỗi đoạn tự ghi playlist riêng cho segment của mình; ở đây chỉ nối các dòng
 * `#EXTINF` + tên segment lại theo thứ tự đoạn (đã kiểm chứng ở E1/E2: ghép như vậy
 * giống hệt một lần mã hoá liền khi timestamp liên tục).
 */

/**
 * Đọc segment của một mức trong thư mục đầu ra của một đoạn, kèm kích thước tệp.
 * Thiếu tệp segment mà playlist nhắc tới thì ném lỗi: đoạn đó không được coi là xong.
 */
const readChunkRendition = (renditionDir) => {
  const playlistPath = path.join(renditionDir, 'playlist.m3u8');
  if (!fs.existsSync(playlistPath)) return [];

  return parseMediaPlaylist(fs.readFileSync(playlistPath, 'utf-8')).map(({ file, duration }) => ({
    file,
    duration,
    bytes: fs.statSync(path.join(renditionDir, file)).size,
  }));
};

/** Media playlist VOD từ danh sách segment, cùng định dạng với playlist ffmpeg tự ghi. */
const buildMediaPlaylist = (segments) => {
  // ffmpeg ghi TARGETDURATION là độ dài segment dài nhất làm tròn; RFC 8216 §4.3.3.1 yêu
  // cầu EXTINF làm tròn không vượt quá giá trị này.
  const target = Math.max(1, ...segments.map((s) => Math.round(s.duration)));

  let content = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:${target}\n#EXT-X-MEDIA-SEQUENCE:0\n`;
  for (const { file, duration } of segments) {
    content += `#EXTINF:${duration.toFixed(6)},\n${file}\n`;
  }
  return `${content}#EXT-X-ENDLIST\n`;
};

/** Segment của một mức, nối theo thứ tự đoạn. `results` đã được sắp theo chỉ số đoạn. */
const collectSegments = (results, renditionName) =>
  results.flatMap((result) => (result.renditions[renditionName] || {}).segments || []);

/**
 * Bitrate đỉnh và trung bình của một mức từ các segment đã đo, cùng quy tắc với
 * `measureVariantBitrates` ở đường một-job (đỉnh làm tròn LÊN, vì BANDWIDTH là cận trên).
 * Trả về null khi không đo được.
 */
const renditionStats = (segments) => {
  let totalBytes = 0;
  let totalSeconds = 0;
  let peak = 0;
  let counted = 0;

  for (const { duration, bytes } of segments) {
    if (!(duration > 0) || !(bytes > 0)) continue;
    totalBytes += bytes;
    totalSeconds += duration;
    peak = Math.max(peak, (bytes * 8) / duration);
    counted += 1;
  }

  if (counted === 0 || totalSeconds <= 0) return null;
  return {
    peak: Math.ceil(peak),
    average: Math.round((totalBytes * 8) / totalSeconds),
    segments: counted,
  };
};

const sumSeconds = (segments) => segments.reduce((total, s) => total + s.duration, 0);

/** Lệch thời lượng (giây) giữa kế hoạch và thực tế của một đoạn: cảnh báo / coi là lỗi. */
const WARN_DRIFT_SECONDS = 0.05;
const FAIL_DRIFT_SECONDS = 0.25;

/**
 * Kiểm tra tính nhất quán của các đoạn trước khi công bố playlist.
 *
 * Chạy ở bước ghép vì đó là nơi duy nhất thấy toàn bộ. Mã hoá xong rồi mới phát hiện đoạn
 * sai thì tiếc, nhưng công bố một timeline lệch thì người xem thấy hình đứng hoặc lệch tiếng:
 *
 *  - đoạn thiếu hoặc không có segment (trừ đoạn cuối, có thể rỗng nếu ước lượng khung hình cao)
 *  - các mức của cùng một đoạn không cùng số segment/độ dài: ranh giới ABR lệch (RFC 8216 §6.2.4)
 *  - thời lượng đoạn lệch kế hoạch: pts đoạn sau được đặt theo kế hoạch, nên lệch ở đây là
 *    khe hở hoặc chồng lấn thật ở ranh giới
 *
 * @returns {{errors: string[], warnings: string[]}}
 */
const validateChunkResults = ({ plan, results, renditionNames }) => {
  const errors = [];
  const warnings = [];

  plan.chunks.forEach((chunk, k) => {
    const result = results[k];
    if (!result) {
      errors.push(`đoạn ${k}: không có kết quả`);
      return;
    }

    const perRendition = renditionNames.map((name) => ({
      name,
      segments: (result.renditions[name] || {}).segments || [],
    }));

    const reference = perRendition[0];
    for (const other of perRendition.slice(1)) {
      const sameCount = other.segments.length === reference.segments.length;
      const sameLengths =
        sameCount && other.segments.every((s, i) => Math.abs(s.duration - reference.segments[i].duration) < 0.01);
      if (!sameLengths) {
        errors.push(`đoạn ${k}: mức ${other.name} và ${reference.name} không cùng ranh giới segment`);
      }
    }

    const isLast = k === plan.chunks.length - 1;
    if (reference.segments.length === 0) {
      if (!isLast) errors.push(`đoạn ${k}: không sinh ra segment nào`);
      return;
    }
    if (isLast) return;

    const actual = sumSeconds(reference.segments);
    const drift = Math.abs(actual - chunk.expectedSeconds);
    if (drift > FAIL_DRIFT_SECONDS) {
      errors.push(`đoạn ${k}: dài ${actual.toFixed(3)} s, kế hoạch ${chunk.expectedSeconds} s (lệch ${drift.toFixed(3)} s)`);
    } else if (drift > WARN_DRIFT_SECONDS) {
      warnings.push(`đoạn ${k}: lệch ${drift.toFixed(3)} s so với kế hoạch`);
    }
    if (reference.segments.length !== chunk.expectedSegments) {
      warnings.push(`đoạn ${k}: ${reference.segments.length} segment, kế hoạch ${chunk.expectedSegments}`);
    }
  });

  return { errors, warnings };
};

module.exports = {
  readChunkRendition,
  buildMediaPlaylist,
  collectSegments,
  renditionStats,
  validateChunkResults,
  sumSeconds,
  WARN_DRIFT_SECONDS,
  FAIL_DRIFT_SECONDS,
};
