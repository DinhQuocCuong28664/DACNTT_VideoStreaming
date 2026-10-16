const crypto = require('crypto');

/**
 * Giới hạn số thư gửi tới MỘT địa chỉ nhận trong một giờ, bất kể ai yêu cầu.
 *
 * Các bộ giới hạn khác đếm theo máy khách (IP) hoặc theo tài khoản đang đăng
 * nhập. Đăng ký và "Quên mật khẩu" không cần đăng nhập, nên kẻ đổi IP liên tục
 * vẫn bắt được máy chủ gửi thư tới cùng một địa chỉ nạn nhân, và đó là thư gửi
 * từ hộp Gmail của dự án: nạn nhân bị dội thư, còn Google có thể khoá hộp gửi
 * vì spam, kéo theo thư đặt lại mật khẩu của mọi người cùng hỏng. Đếm theo địa
 * chỉ nhận chặn đúng kịch bản đó.
 *
 * Một nhóm đếm chung cho thư xác minh (đăng ký và gửi lại) và thư đặt lại mật
 * khẩu. Khi vượt giới hạn thư bị bỏ qua chứ không báo lỗi, ở nơi nào lỗi sẽ để
 * lộ địa chỉ có tài khoản hay không (xem forgotPassword).
 *
 * Trạng thái giữ trong bộ nhớ tiến trình, như các bộ giới hạn khác: đúng với
 * một máy chủ, và sẽ phải chuyển sang kho dùng chung khi có nhiều máy. Khoá là
 * SHA-256 của địa chỉ đã chuẩn hoá nên bộ nhớ không giữ địa chỉ email.
 */

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_MAX_KEYS = 10000;

const normalise = (email) => String(email || '').trim().toLowerCase();
const keyOf = (email) => crypto.createHash('sha256').update(normalise(email)).digest('hex');

const createRecipientMailThrottle = ({
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
  maxKeys = DEFAULT_MAX_KEYS,
  now = Date.now,
} = {}) => {
  const sent = new Map(); // khoá -> các mốc thời gian đã gửi, tăng dần

  const dropExpired = (timestamps, t) => {
    while (timestamps.length > 0 && timestamps[0] <= t - windowMs) timestamps.shift();
  };

  const makeRoom = (t) => {
    for (const [key, timestamps] of sent) {
      dropExpired(timestamps, t);
      if (timestamps.length === 0) sent.delete(key);
    }
    // Vẫn đầy sau khi dọn: bỏ khoá cũ nhất để bộ nhớ có trần.
    if (sent.size >= maxKeys) sent.delete(sent.keys().next().value);
  };

  /** Ghi nhận một thư sắp gửi tới `email`; false nếu đã đủ giới hạn trong cửa sổ. */
  const allow = (email) => {
    const t = now();
    const key = keyOf(email);
    let timestamps = sent.get(key);

    if (timestamps) dropExpired(timestamps, t);
    if (timestamps && timestamps.length >= limit) return false;

    if (!timestamps) {
      if (sent.size >= maxKeys) makeRoom(t);
      timestamps = [];
      sent.set(key, timestamps);
    }
    timestamps.push(t);
    return true;
  };

  return { allow, size: () => sent.size };
};

const shared = createRecipientMailThrottle({
  limit: Number(process.env.MAIL_PER_RECIPIENT_LIMIT) || DEFAULT_LIMIT,
});

/** Tắt trong test (như các bộ giới hạn khác) và bằng MAIL_RECIPIENT_THROTTLE=false. */
const isActive = (env = process.env) => env.NODE_ENV !== 'test' && env.MAIL_RECIPIENT_THROTTLE !== 'false';

/** Điểm vào cho controller: true nếu được phép gửi thêm một thư tới `email`. */
const allowMail = (email) => !isActive() || shared.allow(email);

module.exports = { createRecipientMailThrottle, allowMail, isActive, DEFAULT_LIMIT, DEFAULT_WINDOW_MS };
