const videoService = require('../services/videoService');
const cloudfrontService = require('../services/cloudfrontService');

/**
 * @route   POST /api/videos/initiate-upload
 * @desc    Creates DB record first (status: UPLOADING) to obtain videoId (_id)
 *          and generates Pre-signed S3 upload URL.
 * @access  Private
 */
const initiateUpload = async (req, res, next) => {
  try {
    const { title, description, category, filename, mimetype, fileSize, tags, visibility } = req.body;

    const result = await videoService.initiateUpload(req.user._id, {
      title,
      description,
      category,
      filename,
      mimeType: mimetype,
      fileSize,
      tags,
      visibility,
    });

    res.status(201).json({
      success: true,
      message: 'Upload initiated — DB record created and Pre-signed URL generated',
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/videos/:id/confirm-upload
 * @desc    Confirm upload complete — transition UPLOADING → PROCESSING
 * @access  Private
 */
const confirmUpload = async (req, res, next) => {
  try {
    const video = await videoService.confirmUpload(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Upload confirmed — video is now being processed',
      data: { video },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/videos
 * @desc    Get all public READY videos (Home page with optional category & search)
 * @access  Public
 */
const getAllVideos = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;
    const category = req.query.category || null;
    const searchQuery = req.query.q || null;

    const result = await videoService.getAllVideos(page, limit, category, searchQuery);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/videos/:id
 * @desc    Get single video by ID
 * @access  Public (Enforces visibility & READY status checks for non-owners)
 *
 * Lưu ý: endpoint này KHÔNG còn tăng lượt xem. Việc đếm lượt xem được tách sang
 * `POST /api/videos/:id/view`, do trình phát gọi sau khi video thực sự bắt đầu
 * phát, nhằm tránh tình trạng mỗi lần tải lại trang lại cộng thêm một lượt.
 */
const getVideoById = async (req, res, next) => {
  try {
    const video = await videoService.getVideoById(req.params.id, req.user);

    res.status(200).json({
      success: true,
      data: { video },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/videos/:id/playback-auth
 * @desc    Cấp CloudFront Signed Cookie cho phép phát video
 * @access  Public cho video công khai; video riêng tư chỉ chủ sở hữu được cấp
 *
 * Quyền truy cập được kiểm tra bằng chính `videoService.getVideoById`, tức là
 * dùng lại đúng một nguồn quy tắc với endpoint xem chi tiết video. Nhờ vậy sẽ
 * không xảy ra tình trạng API chặn nhưng CDN vẫn cho phép tải nội dung.
 */
const getPlaybackAuth = async (req, res, next) => {
  try {
    // Ném lỗi 404 nếu video riêng tư và người gọi không phải chủ sở hữu
    await videoService.getVideoById(req.params.id, req.user);

    if (!cloudfrontService.isSigningEnabled()) {
      // Môi trường chưa bật cơ chế ký (ví dụ khi phát triển cục bộ):
      // báo cho trình phát biết để tiếp tục phát bình thường.
      return res.status(200).json({
        success: true,
        data: { signingEnabled: false },
      });
    }

    const { expiresAt } = cloudfrontService.attachPlaybackCookies(res, req.params.id);

    res.status(200).json({
      success: true,
      data: {
        signingEnabled: true,
        expiresAt,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/videos/:id/view
 * @desc    Ghi nhận một lượt xem hợp lệ (có chống đếm trùng)
 * @access  Public (nhận diện người dùng đăng nhập nếu có token)
 */
const registerView = async (req, res, next) => {
  try {
    const result = await videoService.registerView(req.params.id, req.user, req.ip);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/videos/:id/like
 * @desc    Toggle like on video
 * @access  Private
 */
const toggleLike = async (req, res, next) => {
  try {
    const result = await videoService.toggleLike(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/videos/:id/dislike
 * @desc    Toggle dislike on video
 * @access  Private
 */
const toggleDislike = async (req, res, next) => {
  try {
    const result = await videoService.toggleDislike(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/videos/:id/comments
 * @desc    Get comments for video
 * @access  Public
 */
const getComments = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;

    const result = await videoService.getComments(req.params.id, page, limit, req.user);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/videos/:id/comments
 * @desc    Add a comment to video
 * @access  Private
 */
const addComment = async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Content is required' });
    }

    const comment = await videoService.addComment(req.params.id, req.user._id, content);

    res.status(201).json({
      success: true,
      data: { comment },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/videos/comments/:commentId
 * @desc    Delete a comment
 * @access  Private
 */
const deleteComment = async (req, res, next) => {
  try {
    await videoService.deleteComment(req.params.commentId, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Comment deleted',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/videos/user/:userId
 * @desc    Get videos by a specific user (Channel page)
 * @access  Public
 */
const getUserVideos = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;

    const requesterId = req.user ? req.user._id : null;

    const result = await videoService.getVideosByUser(
      req.params.userId,
      page,
      limit,
      requesterId
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PUT /api/videos/:id
 * @desc    Update video metadata (title, description, tags, visibility)
 * @access  Private (Owner only)
 */
const updateVideo = async (req, res, next) => {
  try {
    const video = await videoService.updateVideo(
      req.params.id,
      req.user._id,
      req.body
    );

    res.status(200).json({
      success: true,
      message: 'Video updated',
      data: { video },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   DELETE /api/videos/:id
 * @desc    Delete video (remove DB record + S3 raw & processed objects)
 * @access  Private (Owner only)
 */
const deleteVideo = async (req, res, next) => {
  try {
    await videoService.deleteVideo(req.params.id, req.user._id);

    res.status(200).json({
      success: true,
      message: 'Video deleted',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  initiateUpload,
  confirmUpload,
  getAllVideos,
  getVideoById,
  getPlaybackAuth,
  registerView,
  getUserVideos,
  toggleLike,
  toggleDislike,
  getComments,
  addComment,
  deleteComment,
  updateVideo,
  deleteVideo,
};
