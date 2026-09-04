const { t } = require('../config/i18n');
/**
 * Global Error Handler Middleware
 * Catches all errors thrown in route handlers and services.
 * Standardizes error response format.
 */
const errorHandler = (err, req, res, _next) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = 'Resource not found — invalid ID format';
  }

  // Mongoose duplicate key error (e.g., duplicate email/username)
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value: ${field} already exists`;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const messages = Object.values(err.errors).map((val) => val.message);
    message = messages.join('. ');
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token has expired';
  }

  // Log day du truoc khi che bot, de phia server khong mat thong tin nao.
  console.error(`❌ [${statusCode}] ${message}`, {
    path: req.originalUrl,
    method: req.method,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });

  /**
   * Loi >= 500 la loi ngoai du kien, khong phai loi da duoc dat thong diep
   * co chu dich nhu cac nhanh o tren. `err.message` khi do la van ban do
   * thu vien ben duoi sinh ra — driver Mongo, AWS SDK, loi he thong tap
   * tin — va co the chua ten host, duong dan noi bo hay chi tiet cau hinh.
   * Nguoi dung cung khong lam gi duoc voi noi dung do, nen production tra
   * ve thong diep chung; ban day du van nam trong log ben tren.
   */
  const isUnexpected = statusCode >= 500;
  const clientMessage =
    isUnexpected && process.env.NODE_ENV === 'production'
      ? t(req, 'error.unexpected')
      : message;

  res.status(statusCode).json({
    success: false,
    message: clientMessage,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

module.exports = errorHandler;
