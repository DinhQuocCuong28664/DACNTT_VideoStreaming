/**
 * Rate Limiting Middleware
 *
 * Bảo vệ các endpoint nhạy cảm khỏi tấn công brute-force và lạm dụng tài nguyên.
 * Sử dụng bộ nhớ tiến trình (in-memory store) — phù hợp với mô hình triển khai
 * một tiến trình pm2 hiện tại. Khi mở rộng ra nhiều instance, cần thay bằng
 * store dùng chung (Redis) để giới hạn có hiệu lực trên toàn cụm.
 */

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { t } = require('../config/i18n');

// Bỏ qua giới hạn khi chạy test để không làm hỏng các bộ test tự động
const skipInTest = () => process.env.NODE_ENV === 'test';

/**
 * Khoá giới hạn theo tài khoản cho các endpoint đã qua `auth`.
 *
 * Giới hạn theo IP phạt nhầm người khi nhiều thuê bao dùng chung một IP công
 * khai — mạng di động dùng Carrier-Grade NAT (RFC 6888) là trường hợp phổ biến
 * nhất: một người tải lên 30 video là cả nhà mạng hết lượt. Với endpoint bắt
 * buộc đăng nhập, danh tính đáng tin nhất là chính tài khoản.
 *
 * Nhánh dự phòng theo IP chỉ chạy nếu limiter lỡ bị đặt trước `auth`; khi đó
 * dùng `ipKeyGenerator` để gộp cả dải /56 IPv6 của một người vào một khoá, như
 * express-rate-limit khuyến nghị.
 */
const accountOrIpKey = (req) => (req.user ? `user:${req.user._id}` : ipKeyGenerator(req.ip));

/**
 * Số lượt tải lên mỗi tài khoản mỗi giờ. Đọc từ biến môi trường để có thể nới
 * tạm khi chạy kịch bản chịu tải (scripts/k6-load-test.js nộp 100 video bằng
 * một tài khoản), không phải sửa code rồi deploy lại.
 */
const UPLOAD_LIMIT_PER_HOUR = (() => {
  const n = parseInt(process.env.UPLOAD_LIMIT_PER_HOUR, 10);
  return Number.isFinite(n) && n > 0 ? n : 30;
})();

/**
 * Giới hạn nghiêm ngặt cho các endpoint xác thực (login, register, forgot-password).
 * Đây là các endpoint dễ bị dò mật khẩu nhất.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: (req) => ({ success: false, message: t(req, 'rate.tooManyAttempts') }),
});

/**
 * Giới hạn cho endpoint cấp Pre-signed URL — ngăn việc tạo hàng loạt
 * bản ghi rác trong cơ sở dữ liệu và spam URL upload. Tính theo tài khoản.
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: UPLOAD_LIMIT_PER_HOUR,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: accountOrIpKey,
  skip: skipInTest,
  message: (req) => ({ success: false, message: t(req, 'rate.tooManyUploads') }),
});

/**
 * Giới hạn gửi báo cáo vi phạm. Mỗi người chỉ có một báo cáo mở cho mỗi video
 * (chỉ mục duy nhất trong models/Report.js), giới hạn này chặn thêm việc một
 * tài khoản rải báo cáo lên hàng loạt video để làm ngập hàng rà soát. Tính theo
 * tài khoản, đúng với mối lo "một tài khoản rải báo cáo".
 */
const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: accountOrIpKey,
  skip: skipInTest,
  message: (req) => ({ success: false, message: t(req, 'rate.tooManyReports') }),
});

/**
 * Giới hạn chung cho toàn bộ API, đủ rộng để không ảnh hưởng người dùng thật.
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: (req) => ({ success: false, message: t(req, 'rate.tooManyRequests') }),
});

module.exports = {
  authLimiter,
  uploadLimiter,
  reportLimiter,
  apiLimiter,
  accountOrIpKey,
  UPLOAD_LIMIT_PER_HOUR,
};
