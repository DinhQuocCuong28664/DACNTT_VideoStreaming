const { translate } = require('../config/i18n');

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

/**
 * Như httpError, nhưng thông điệp là một khoá trong config/i18n.js.
 *
 * Tầng service không có request nên không biết người dùng đọc tiếng gì;
 * errorHandler dịch `messageKey` theo Accept-Language lúc trả lời. `message`
 * giữ bản tiếng Anh cho log phía server.
 */
httpError.localized = (statusCode, messageKey, errorCode) => {
  const error = httpError(statusCode, translate('en', messageKey), errorCode);
  error.messageKey = messageKey;
  return error;
};

module.exports = httpError;
