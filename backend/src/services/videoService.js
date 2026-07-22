const Video = require('../models/Video');
const { generatePresignedUploadUrl, deleteS3Object } = require('./s3Service');
const crypto = require('crypto');

const createVideoRecord = async (userId, { title, description, tags, visibility, fileSize, mimeType, filename }) => {
  const fileExt = filename.split('.').pop() || 'mp4';
  const uniqueId = crypto.randomBytes(16).toString('hex');
  const rawS3Key = `uploads/${userId}/${uniqueId}.${fileExt}`;

  const uploadUrl = await generatePresignedUploadUrl(rawS3Key, mimeType || 'video/mp4');

  const video = await Video.create({
    title,
    description: description || '',
    tags: tags || [],
    visibility: visibility || 'public',
    user: userId,
    status: 'UPLOADING',
    rawS3Key,
    fileSize: fileSize || 0,
    mimeType: mimeType || 'video/mp4',
  });

  return {
    video,
    uploadUrl,
    rawS3Key,
  };
};

const confirmVideoUpload = async (videoId, userId) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or unauthorized');
    error.statusCode = 404;
    throw error;
  }

  if (video.status !== 'UPLOADING') {
    const error = new Error(`Video is already in status ${video.status}`);
    error.statusCode = 400;
    throw error;
  }

  video.status = 'PROCESSING';
  await video.save();

  return video;
};

const getAllReadyVideos = async ({ page = 1, limit = 12, search = '' }) => {
  const query = {
    status: 'READY',
    visibility: 'public',
  };

  if (search) {
    query.title = { $regex: search, $options: 'i' };
  }

  const skip = (page - 1) * limit;

  const [videos, total] = await Promise.all([
    Video.find(query)
      .populate('user', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Video.countDocuments(query),
  ]);

  return {
    videos,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

const getVideoById = async (videoId) => {
  const video = await Video.findById(videoId).populate('user', 'username displayName avatar channelDescription subscribers');

  if (!video) {
    const error = new Error('Video not found');
    error.statusCode = 404;
    throw error;
  }

  // Increment views
  video.views += 1;
  await video.save();

  return video;
};

const getVideosByUser = async (userId, { page = 1, limit = 12 }) => {
  const skip = (page - 1) * limit;

  const [videos, total] = await Promise.all([
    Video.find({ user: userId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Video.countDocuments({ user: userId }),
  ]);

  return {
    videos,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

const updateVideo = async (videoId, userId, updateFields) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or unauthorized');
    error.statusCode = 404;
    throw error;
  }

  const allowedUpdates = ['title', 'description', 'tags', 'visibility'];
  allowedUpdates.forEach((field) => {
    if (updateFields[field] !== undefined) {
      video[field] = updateFields[field];
    }
  });

  await video.save();
  return video;
};

const deleteVideo = async (videoId, userId) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or unauthorized');
    error.statusCode = 404;
    throw error;
  }

  // Attempt S3 cleanup if rawS3Key exists
  if (video.rawS3Key) {
    try {
      await deleteS3Object(process.env.S3_RAW_BUCKET_NAME || 'vidshare-raw-bucket', video.rawS3Key);
    } catch (err) {
      console.warn(`[S3 Cleanup Warning] Could not delete raw video key ${video.rawS3Key}:`, err.message);
    }
  }

  await video.deleteOne();
  return { message: 'Video deleted successfully' };
};

module.exports = {
  createVideoRecord,
  confirmVideoUpload,
  getAllReadyVideos,
  getVideoById,
  getVideosByUser,
  updateVideo,
  deleteVideo,
};
