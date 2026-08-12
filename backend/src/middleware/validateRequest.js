/**
 * Request Validation Middleware Factory
 * Lightweight validation without external libraries (Joi, etc.)
 *
 * Usage:
 *   const { validateRequest } = require('../middleware/validateRequest');
 *   router.post('/register', validateRequest(['username', 'email', 'password']), controller);
 */

/**
 * Validate that required fields exist in request body
 * @param {string[]} requiredFields - Array of required field names
 */
const validateRequest = (requiredFields) => {
  return (req, res, next) => {
    const missing = [];

    for (const field of requiredFields) {
      if (
        req.body[field] === undefined ||
        req.body[field] === null ||
        req.body[field] === ''
      ) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missing.join(', ')}`,
      });
    }

    next();
  };
};

/**
 * Validate email format
 */
const validateEmail = (req, res, next) => {
  if (req.body.email) {
    const emailRegex = /^\S+@\S+\.\S+$/;
    if (!emailRegex.test(req.body.email)) {
      return res.status(400).json({
        success: false,
        message: 'Please enter a valid email address',
      });
    }
  }
  next();
};

/**
 * Danh sách định dạng video được chấp nhận khi cấp Pre-signed URL.
 * Việc kiểm tra ở phía máy chủ là bắt buộc: nếu chỉ kiểm tra ở trình duyệt,
 * người dùng có thể gọi thẳng API để lấy URL và tải lên tệp bất kỳ.
 */
const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-matroska',
  'video/webm',
  'video/x-msvideo',
  'video/mpeg',
];

/** Dung lượng tối đa mỗi tệp video: 2 GB */
const MAX_VIDEO_SIZE_BYTES = 2 * 1024 * 1024 * 1024;

/**
 * Kiểm tra metadata của video trước khi cấp Pre-signed URL.
 * Chặn sớm các tệp sai định dạng hoặc vượt dung lượng, tránh tạo bản ghi rác
 * trong cơ sở dữ liệu và tránh lãng phí dung lượng lưu trữ trên Amazon S3.
 */
const validateUploadMetadata = (req, res, next) => {
  const { fileSize } = req.body;
  // Client gửi lên khóa `mimetype`; chấp nhận cả `mimeType` để phòng sai lệch
  const mimeType = req.body.mimetype || req.body.mimeType;

  if (!ALLOWED_VIDEO_MIME_TYPES.includes(mimeType)) {
    return res.status(400).json({
      success: false,
      message: `Định dạng tệp không được hỗ trợ. Chỉ chấp nhận: ${ALLOWED_VIDEO_MIME_TYPES.join(', ')}`,
    });
  }

  if (fileSize !== undefined && fileSize !== null) {
    const size = Number(fileSize);

    if (!Number.isFinite(size) || size <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Dung lượng tệp không hợp lệ',
      });
    }

    if (size > MAX_VIDEO_SIZE_BYTES) {
      return res.status(400).json({
        success: false,
        message: `Tệp vượt quá dung lượng tối đa cho phép (${MAX_VIDEO_SIZE_BYTES / (1024 * 1024 * 1024)} GB)`,
      });
    }
  }

  next();
};

module.exports = {
  validateRequest,
  validateEmail,
  validateUploadMetadata,
  ALLOWED_VIDEO_MIME_TYPES,
  MAX_VIDEO_SIZE_BYTES,
};
