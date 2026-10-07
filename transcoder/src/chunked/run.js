const { spawn } = require('child_process');

/**
 * Chạy ffmpeg cho các job con của pipeline chia đoạn.
 *
 * Không dùng `runFFmpeg` của đường một-job: nó đọc `time=` làm vị trí trong video để tính
 * phần trăm và dự báo thời gian, nhưng ở đây `time=` còn cộng cả `-output_ts_offset` (hàng
 * trăm giây ở đoạn xa), nên cả hai con số đều sai. Rào chắn thời gian cũng không cần: một
 * đoạn chỉ vài phút, còn timeout của Batch vẫn là chặn cuối.
 *
 * Giữ lại phần đuôi stderr để lỗi nói rõ ffmpeg phàn nàn điều gì thay vì chỉ "mã thoát 1".
 */

const STDERR_TAIL_CHARS = 4000;

/**
 * @param {object} p
 * @param {string[]} p.args
 * @param {string} p.label - để ghi log
 * @param {Function} [p.spawnFn] - tiêm vào khi kiểm thử
 * @param {number} [p.logEveryMs]
 * @returns {Promise<{seconds: number}>}
 */
const runFfmpegProcess = ({ args, label, spawnFn = spawn, logEveryMs = 60000 }) =>
  new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let tail = '';
    let lastLogAt = startedAt;
    let lastTime = '';

    const proc = spawnFn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      tail = (tail + text).slice(-STDERR_TAIL_CHARS);

      // -stats ghi dòng tiến độ kết thúc bằng \r; lấy mốc thời gian mới nhất trong khối này.
      const times = text.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/g);
      if (times) lastTime = times[times.length - 1].slice(5);

      const now = Date.now();
      if (lastTime && now - lastLogAt >= logEveryMs) {
        lastLogAt = now;
        console.log(`   ⏳ ${label}: ${lastTime} sau ${Math.round((now - startedAt) / 1000)}s`);
      }
    });

    proc.on('error', (err) => reject(new Error(`${label}: không chạy được ffmpeg: ${err.message}`)));
    proc.on('close', (code, signal) => {
      const seconds = (Date.now() - startedAt) / 1000;
      if (code === 0) {
        console.log(`✅ ${label}: ffmpeg xong sau ${seconds.toFixed(1)}s`);
        resolve({ seconds });
        return;
      }
      const reason = signal ? `bị dừng bởi ${signal}` : `mã thoát ${code}`;
      reject(new Error(`${label}: ffmpeg ${reason}\n${tail.trim()}`));
    });
  });

/**
 * Chạy `attempt()` tối đa `attempts` lần, dừng ở lần thành công đầu tiên.
 *
 * Mỗi lần thử gọi lại `attempt` từ đầu, nên nơi gọi ký lại URL ngay trong đó: URL ký sẵn có thể
 * đã hết hạn, còn S3 chập chờn thì thử lại là hết. Chạy lại một đoạn vô hại vì đầu ra ghi đè cùng
 * khoá. Lỗi sau cùng được ném nguyên vẹn.
 */
const withAttempts = async (attempts, label, attempt) => {
  let lastError;
  for (let n = 1; n <= attempts; n += 1) {
    try {
      return await attempt(n);
    } catch (err) {
      lastError = err;
      if (n < attempts) {
        console.warn(`⚠️  ${label}: lần ${n}/${attempts} thất bại, thử lại: ${String(err.message).split('\n')[0]}`);
      }
    }
  }
  throw lastError;
};

module.exports = { runFfmpegProcess, withAttempts, STDERR_TAIL_CHARS };
