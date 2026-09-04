require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/db');
const validateEnv = require('./config/validateEnv');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');

// Route imports
const authRoutes = require('./routes/authRoutes');
const videoRoutes = require('./routes/videoRoutes');
const userRoutes = require('./routes/userRoutes');
const { translate, DEFAULT_LANGUAGE } = require('./config/i18n');

// Dừng sớm nếu thiếu cấu hình bắt buộc, trước khi mở cổng lắng nghe
validateEnv();

const app = express();

// Chạy sau reverse proxy (Nginx/ALB) nên cần tin cậy X-Forwarded-For,
// nếu không rate limiter sẽ nhìn mọi request đến từ cùng một IP của proxy.
app.set('trust proxy', 1);

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

app.use(express.json({ limit: '10mb' }));
app.use(morgan('dev'));
app.use('/api', apiLimiter);

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'DACNTT Video Streaming API is running...',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/users', userRoutes);

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
  });
}

module.exports = app;
