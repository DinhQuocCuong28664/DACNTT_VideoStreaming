/**
 * Rate Limiting Middleware
 *
 * Bảo vệ các endpoint nhạy cảm khỏi tấn công brute-force và lạm dụng tài nguyên.
 * Sử dụng bộ nhớ tiến trình (in-memory store) — phù hợp với mô hình triển khai
 * một tiến trình pm2 hiện tại. Khi mở rộng ra nhiều instance, cần thay bằng
 * store dùng chung (Redis) để giới hạn có hiệu lực trên toàn cụm.
 */

const rateLimit = require('express-rate-limit');
const { t } = require('../config/i18n');

// Bỏ qua giới hạn khi chạy test để không làm hỏng các bộ test tự động
const skipInTest = () => process.env.NODE_ENV === 'test';

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
 * bản ghi rác trong cơ sở dữ liệu và spam URL upload.
 */
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: (req) => ({ success: false, message: t(req, 'rate.tooManyUploads') }),
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

module.exports = { authLimiter, uploadLimiter, apiLimiter };
