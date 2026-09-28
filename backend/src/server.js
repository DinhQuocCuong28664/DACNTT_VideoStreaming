require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const validateEnv = require('./config/validateEnv');
const { TRUSTED_PROXIES } = require('./config/trustedProxies');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const { verifyEmailTransport } = require('./services/emailService');
const { startVideoReconciler } = require('./services/videoReconciler');
const { healthCheck } = require('./controllers/healthController');

// Route imports
const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videoRoutes');
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { translate, DEFAULT_LANGUAGE } = require('./config/i18n');

// Dừng sớm nếu thiếu cấu hình bắt buộc, trước khi mở cổng lắng nghe
validateEnv();

const app = express();

// Chạy sau Cloudflare và nginx: chỉ tin X-Forwarded-For do hai lớp đó ghi, để
// req.ip là IP người dùng chứ không phải IP máy Cloudflare (xem
// config/trustedProxies.js — `trust proxy` bằng 1 từng cho ra đúng IP đó).
app.set('trust proxy', TRUSTED_PROXIES);

// Connect to MongoDB Atlas-dqc
connectDB();

// Security headers (CSP tắt vì API chỉ trả JSON, không phục vụ HTML)
app.use(helmet({ contentSecurityPolicy: false }));

/**
 * CORS theo danh sách trắng.
 * Origin được cấu hình qua biến CORS_ORIGINS (phân tách bằng dấu phẩy).
 * `credentials: true` là bắt buộc để trình duyệt gửi kèm CloudFront Signed Cookie.
 */
const allowedOrigins = (
  process.env.CORS_ORIGINS ||
  'https://zelostech.site,https://www.zelostech.site,http://localhost:5173,http://localhost:3000'
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Cho phép request không có Origin (Postman, curl, health check nội bộ)
      if (!origin || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error(translate(DEFAULT_LANGUAGE, 'cors.forbiddenOrigin', { origin })));
    },
    credentials: true,
  })
);

// 100 kB (mặc định của body-parser) thay vì 10 MB: payload JSON hợp lệ lớn
// nhất là mô tả video tối đa 5.000 ký tự (~15 kB kể cả chữ có dấu), còn video
// và ảnh đi thẳng lên S3. 10 MB chỉ để một người gửi hàng trăm khối JSON khổng
// lồ bắt máy 1 GB RAM parse (OWASP API4:2023, Unrestricted Resource Consumption).
app.use(express.json({ limit: '100kb' }));
app.use(morgan('dev'));
app.use('/api', apiLimiter);

// Health check (readiness, gồm cả kết nối MongoDB — xem healthController.js)
app.get('/', healthCheck);

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Global error handler (must be AFTER routes)
app.use(errorHandler);

// Chỉ mở cổng lắng nghe khi tệp được chạy trực tiếp.
// Khi được `require` từ bộ test (supertest), chỉ xuất ra `app` để tránh
// treo tiến trình test vì cổng vẫn mở.
if (require.main === module) {
  const PORT = process.env.PORT || 5000;

  app.listen(PORT, () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    // Chạy nền, không chặn việc nhận request; chỉ để lỗi cấu hình mail hiện
    // ngay trong log thay vì im lặng tới khi có người dùng thử quên mật khẩu.
    verifyEmailTransport();
    // Dọn video kẹt ở PROCESSING/UPLOADING (xem services/videoReconciler.js).
    startVideoReconciler();
  });
}

module.exports = app;
