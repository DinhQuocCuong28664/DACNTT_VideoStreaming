const { spawnSync } = require('child_process');

/**
 * Phân tích gói tin của một playlist HLS bằng ffprobe, dùng chung cho các script kiểm chứng.
 */

/** Gói tin (pts, độ dài) của một luồng, theo thứ tự trong tệp. */
const packets = (playlist, stream) => {
  const out = spawnSync(
    'ffprobe',
    [
      '-v', 'error',
      '-protocol_whitelist', 'file,crypto,data',
      '-allowed_extensions', 'ALL',
      '-select_streams', stream,
      '-show_entries', 'packet=pts_time,duration_time',
      '-of', 'json',
      playlist,
    ],
    { encoding: 'utf-8', maxBuffer: 1 << 28 }
  );
  return JSON.parse(out.stdout)
    .packets.filter((p) => p.pts_time !== undefined)
    .map((p) => ({ pts: Number(p.pts_time), dur: Number(p.duration_time) }));
};

/**
 * Khe hở (> 0) và chồng lấn (< 0) giữa các gói liền nhau, tính bằng ms, chỉ những chỗ vượt
 * `tolerance` giây. Sắp theo pts nên B-frame không gây báo động giả.
 */
const gaps = (list, tolerance) => {
  const sorted = [...list].sort((a, b) => a.pts - b.pts);
  const found = [];
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const gap = sorted[i + 1].pts - (sorted[i].pts + sorted[i].dur);
    if (Math.abs(gap) > tolerance) found.push({ at: Number(sorted[i + 1].pts.toFixed(4)), ms: Number((gap * 1000).toFixed(2)) });
  }
  return found;
};

/** Độ dài một khung AAC ở 44,1 kHz: gói trùng ở ranh giới chồng đúng chừng này. */
const AAC_FRAME_MS = 23.22;

module.exports = { packets, gaps, AAC_FRAME_MS };
