/**
 * Tạo lỗi mang mã HTTP cho errorHandler.
 *
 * `errorCode` là mã máy đọc được (vd. VIDEO_REMOVED) để giao diện chọn đúng
 * màn hình thông báo mà không phải so chuỗi thông điệp. Dùng thuộc tính riêng
 * thay vì `code` vì Node và driver Mongo đã dùng `code` cho mã lỗi của chúng.
 */
const httpError = (statusCode, message, errorCode) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (errorCode) error.errorCode = errorCode;
  return error;
};

module.exports = httpError;
