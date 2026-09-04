/**
 * Dịch thông điệp trả về cho trình duyệt theo ngôn ngữ của người gửi yêu cầu.
 *
 * Backend không dùng thư viện i18n đầy đủ vì số chuỗi cần dịch rất nhỏ và
 * chúng chỉ xuất hiện ở tầng trả lời HTTP. Ngôn ngữ được lấy từ tiêu đề
 * Accept-Language mà axios ở phía frontend gắn theo lựa chọn hiện tại của
 * người dùng; khi không có tiêu đề, hoặc giá trị không nằm trong hai ngôn ngữ
 * được hỗ trợ, hệ thống dùng tiếng Việt vì đó là ngôn ngữ gốc của sản phẩm.
 *
 * Lưu ý: các giá trị enum như danh mục video KHÔNG đi qua đây. Chúng được lưu
 * trong cơ sở dữ liệu bằng tiếng Việt và phải giữ nguyên, phần dịch nhãn hiển
 * thị nằm ở frontend (src/i18n/categories.js).
 */

const DEFAULT_LANGUAGE = 'vi';
const SUPPORTED = ['vi', 'en'];

const MESSAGES = {
  vi: {
    'cors.forbiddenOrigin': 'Origin không được phép bởi chính sách CORS: {origin}',
    'auth.loggedOut': 'Đã đăng xuất',
    'auth.resetLinkSent':
      'Nếu email này có tài khoản, liên kết đặt lại mật khẩu đã được gửi tới hộp thư của bạn.',
    'error.unexpected': 'Đã xảy ra lỗi từ phía máy chủ. Vui lòng thử lại sau.',
    'rate.tooManyAttempts': 'Quá nhiều lần thử. Vui lòng đợi 15 phút rồi thử lại.',
    'rate.tooManyUploads':
      'Bạn đã tải lên quá nhiều video trong một giờ. Vui lòng thử lại sau.',
    'rate.tooManyRequests': 'Quá nhiều yêu cầu từ địa chỉ IP này. Vui lòng thử lại sau.',
    'upload.badVideoType': 'Định dạng tệp không được hỗ trợ. Chỉ chấp nhận: {types}',
    'upload.badSize': 'Dung lượng tệp không hợp lệ',
    'upload.videoTooLarge': 'Tệp vượt quá dung lượng tối đa cho phép ({limit} GB)',
    'upload.badAvatarType': 'Định dạng ảnh không được hỗ trợ. Chỉ chấp nhận: {types}',
    'upload.avatarTooLarge': 'Ảnh vượt quá dung lượng tối đa cho phép ({limit} MB)',
    'cloudfront.notConfigured': 'CloudFront signing chưa được cấu hình trên máy chủ',
  },
  en: {
    'cors.forbiddenOrigin': 'Origin not allowed by the CORS policy: {origin}',
    'auth.loggedOut': 'Signed out',
    'auth.resetLinkSent':
      'If an account exists for this email, a password reset link has been sent to it.',
    'error.unexpected': 'A server error occurred. Please try again later.',
    'rate.tooManyAttempts': 'Too many attempts. Please wait 15 minutes and try again.',
    'rate.tooManyUploads':
      'You have uploaded too many videos in the past hour. Please try again later.',
    'rate.tooManyRequests': 'Too many requests from this IP address. Please try again later.',
    'upload.badVideoType': 'Unsupported file type. Accepted types: {types}',
    'upload.badSize': 'Invalid file size',
    'upload.videoTooLarge': 'The file exceeds the maximum allowed size ({limit} GB)',
    'upload.badAvatarType': 'Unsupported image type. Accepted types: {types}',
    'upload.avatarTooLarge': 'The image exceeds the maximum allowed size ({limit} MB)',
    'cloudfront.notConfigured': 'CloudFront signing is not configured on the server',
  },
};

/**
 * Đọc ngôn ngữ ưu tiên từ một request Express. Chỉ xét thẻ ngôn ngữ đầu tiên
 * và bỏ phần vùng (ví dụ "en-GB" thành "en"), đủ dùng cho hai ngôn ngữ.
 */
function languageOf(req) {
  const header = req && req.headers && req.headers['accept-language'];
  if (!header) return DEFAULT_LANGUAGE;

  const first = String(header).split(',')[0].trim().toLowerCase();
  const base = first.split('-')[0];
  return SUPPORTED.includes(base) ? base : DEFAULT_LANGUAGE;
}

/**
 * Trả về thông điệp đã dịch. `params` thay các chỗ giữ chỗ dạng {name}.
 * Khoá không tồn tại được trả về nguyên trạng để lỗi lộ ra rõ ràng khi phát
 * triển thay vì âm thầm thành chuỗi rỗng.
 */
function translate(language, key, params) {
  const table = MESSAGES[SUPPORTED.includes(language) ? language : DEFAULT_LANGUAGE];
  let text = (table && table[key]) || (MESSAGES[DEFAULT_LANGUAGE] && MESSAGES[DEFAULT_LANGUAGE][key]);
  if (!text) return key;

  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

/** Dịch theo ngôn ngữ của request. */
function t(req, key, params) {
  return translate(languageOf(req), key, params);
}

module.exports = { t, translate, languageOf, DEFAULT_LANGUAGE, SUPPORTED };
