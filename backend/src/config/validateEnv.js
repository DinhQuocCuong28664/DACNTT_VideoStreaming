/**
 * Kiểm tra biến môi trường bắt buộc ngay khi khởi động tiến trình.
 *
 * Nếu thiếu `JWT_SECRET`, toàn bộ cơ chế xác thực sẽ hỏng ở thời điểm chạy
 * thay vì báo lỗi ngay lúc khởi động — đây là kiểu lỗi khó phát hiện và nguy hiểm.
 * Việc dừng tiến trình sớm giúp lỗi cấu hình lộ ra ngay khi triển khai.
 */

const REQUIRED_VARS = ['MONGODB_URI', 'JWT_SECRET'];

/** Độ dài tối thiểu của JWT_SECRET để chống tấn công dò khóa */
const MIN_JWT_SECRET_LENGTH = 32;

const validateEnv = () => {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    console.error(
      `❌ Thiếu biến môi trường bắt buộc: ${missing.join(', ')}\n` +
        '   Vui lòng tham khảo backend/.env.example và bổ sung vào tệp .env'
    );
    process.exit(1);
  }

  if (process.env.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    const message =
      `JWT_SECRET quá ngắn (${process.env.JWT_SECRET.length} ký tự), ` +
      `khuyến nghị tối thiểu ${MIN_JWT_SECRET_LENGTH} ký tự.`;

    // Ở môi trường production, khóa yếu là lỗi nghiêm trọng nên phải dừng hẳn
    if (process.env.NODE_ENV === 'production') {
      console.error(`❌ ${message}`);
      process.exit(1);
    }

    console.warn(`⚠️  ${message}`);
  }
};

module.exports = validateEnv;
