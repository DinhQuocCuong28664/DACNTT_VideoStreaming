const mongoose = require('mongoose');
const User = require('../models/User');
const s3Service = require('../services/s3Service');
const { MAX_AVATAR_SIZE_BYTES } = require('../middleware/validateRequest');

/**
 * @route   GET /api/users/:id
 * @desc    Get a user's public profile (Channel page header)
 *          Works even if the user has zero videos, unlike deriving the
 *          channel owner info from the first video's populated `user` field.
 * @access  Public
 */
const getPublicProfile = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      const error = new Error('Invalid user ID');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findById(id).select(
      'username displayName avatar channelDescription createdAt'
    );

    if (!user) {
      const error = new Error('User not found');
      error.statusCode = 404;
      throw error;
    }

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/users/avatar/presign
 * @desc    Get a pre-signed POST (url + fields) to upload a new avatar image
 * @access  Private
 *
 * S3 chỉ nhận tệp khớp đúng key, đúng Content-Type ảnh đã kiểm tra và không
 * quá MAX_AVATAR_SIZE_BYTES (xem s3Service.createUploadPost).
 */
const presignAvatarUpload = async (req, res, next) => {
  try {
    const { mimetype } = req.body;

    const key = s3Service.generateAvatarKey(req.user._id.toString(), mimetype);
    const upload = await s3Service.generateAvatarUploadPost(key, mimetype, MAX_AVATAR_SIZE_BYTES);
    const publicUrl = s3Service.getAvatarPublicUrl(key);

    res.status(200).json({
      success: true,
      data: { upload, key, publicUrl },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/users/avatar
 * @desc    Save the avatar URL after the client finishes uploading to S3
 * @access  Private
 */
const updateAvatar = async (req, res, next) => {
  try {
    const { key } = req.body;

    // Chỉ chấp nhận key nằm đúng trong "thư mục" của chính người dùng đang
    // đăng nhập — chặn việc client gửi key tùy ý trỏ vào ảnh của người khác
    // hoặc file bất kỳ khác trong bucket tĩnh dùng chung — và đúng dạng
    // {timestamp}.{jpg|png|webp} mà presignAvatarUpload sinh ra.
    if (!s3Service.isAvatarKeyOf(req.user._id.toString(), key)) {
      const error = new Error('Invalid avatar key');
      error.statusCode = 400;
      throw error;
    }

    const publicUrl = s3Service.getAvatarPublicUrl(key);

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { avatar: publicUrl },
      { new: true }
    );

    res.status(200).json({
      success: true,
      data: { user },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { getPublicProfile, presignAvatarUpload, updateAvatar };
