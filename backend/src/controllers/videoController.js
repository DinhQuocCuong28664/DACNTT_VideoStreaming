const videoService = require('../services/videoService');

/**
 * @route   POST /api/videos/upload-url
 * @desc    Get Pre-signed URL for direct S3 upload
 * @access  Private
 */
const getUploadUrl = async (req, res, next) => {
  try {
    const { filename, mimetype } = req.body;

    const { uploadUrl, s3Key } = await videoService.getUploadUrl(
      req.user._id,
      filename,
      mimetype
    );

    res.status(200).json({
      success: true,
      data: { uploadUrl, s3Key },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   POST /api/videos
 * @desc    Create a new video record in database
 * @access  Private
 */
const createVideo = async (req, res, next) => {
  try {
    const video = await videoService.createVideo(req.user._id, req.body);

    res.status(201).json({
      success: true,
      message: 'Video record created',
      data: { video },
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
 * @desc    Get all public READY videos (Home page)
 * @access  Public
 */
const getAllVideos = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 12;

    const result = await videoService.getAllVideos(page, limit);

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
 * @desc    Get single video by ID (and increment views)
 * @access  Public
 */
const getVideoById = async (req, res, next) => {
  try {
    const video = await videoService.getVideoById(req.params.id);

    // Increment views asynchronously (fire-and-forget)
    videoService.incrementViews(req.params.id).catch(() => {});

    res.status(200).json({
      success: true,
      data: { video },
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

    // Pass requester ID so owner can see all their videos
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
 * @desc    Delete video (remove DB record + S3 objects)
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
  getUploadUrl,
  createVideo,
  confirmUpload,
  getAllVideos,
  getVideoById,
  getUserVideos,
  updateVideo,
  deleteVideo,
};
