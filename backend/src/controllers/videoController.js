const videoService = require('../services/videoService');

const createVideo = async (req, res, next) => {
  try {
    const { title, description, tags, visibility, fileSize, mimeType, filename } = req.body;
    const userId = req.user._id;

    const result = await videoService.createVideoRecord(userId, {
      title,
      description,
      tags,
      visibility,
      fileSize,
      mimeType,
      filename: filename || 'video.mp4',
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

const confirmUpload = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const video = await videoService.confirmVideoUpload(id, userId);

    res.json({
      success: true,
      data: video,
    });
  } catch (error) {
    next(error);
  }
};

const getAllVideos = async (req, res, next) => {
  try {
    const { page, limit, search } = req.query;
    const result = await videoService.getAllReadyVideos({ page, limit, search });

    res.json({
      success: true,
      data: result.videos,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

const getVideoById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const video = await videoService.getVideoById(id);

    res.json({
      success: true,
      data: video,
    });
  } catch (error) {
    next(error);
  }
};

const getUserVideos = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { page, limit } = req.query;
    const result = await videoService.getVideosByUser(userId, { page, limit });

    res.json({
      success: true,
      data: result.videos,
      pagination: result.pagination,
    });
  } catch (error) {
    next(error);
  }
};

const updateVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const updatedVideo = await videoService.updateVideo(id, userId, req.body);

    res.json({
      success: true,
      data: updatedVideo,
    });
  } catch (error) {
    next(error);
  }
};

const deleteVideo = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const result = await videoService.deleteVideo(id, userId);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createVideo,
  confirmUpload,
  getAllVideos,
  getVideoById,
  getUserVideos,
  updateVideo,
  deleteVideo,
};
