const Video = require('../models/Video');
const s3Service = require('./s3Service');

/**
 * Request a Pre-signed URL for uploading video to S3
 */
const getUploadUrl = async (userId, filename, mimetype) => {
  const s3Key = s3Service.generateS3Key(userId, filename);
  const uploadUrl = await s3Service.generatePresignedUploadUrl(s3Key, mimetype);

  return { uploadUrl, s3Key };
};

/**
 * Create a new video record in database
 */
const createVideo = async (userId, videoData) => {
  const video = await Video.create({
    title: videoData.title,
    description: videoData.description || '',
    user: userId,
    rawS3Key: videoData.rawS3Key,
    mimeType: videoData.mimeType,
    fileSize: videoData.fileSize || 0,
    tags: videoData.tags || [],
    visibility: videoData.visibility || 'public',
    status: 'UPLOADING',
  });

  return video;
};

/**
 * Confirm upload complete — transition status UPLOADING → PROCESSING
 */
const confirmUpload = async (videoId, userId) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  if (video.status !== 'UPLOADING') {
    const error = new Error(
      `Cannot confirm upload — video status is ${video.status}, expected UPLOADING`
    );
    error.statusCode = 400;
    throw error;
  }

  video.status = 'PROCESSING';
  await video.save();

  return video;
};

/**
 * Get a single video by ID (with user info populated)
 */
const getVideoById = async (videoId) => {
  const video = await Video.findById(videoId).populate(
    'user',
    'username displayName avatar'
  );

  if (!video) {
    const error = new Error('Video not found');
    error.statusCode = 404;
    throw error;
  }

  return video;
};

/**
 * Get all public READY videos (for Home page) with pagination
 */
const getAllVideos = async (page = 1, limit = 12) => {
  const skip = (page - 1) * limit;

  const [videos, total] = await Promise.all([
    Video.find({ visibility: 'public', status: 'READY' })
      .populate('user', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Video.countDocuments({ visibility: 'public', status: 'READY' }),
  ]);

  return {
    videos,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get videos by a specific user (for Channel page) with pagination
 */
const getVideosByUser = async (userId, page = 1, limit = 12, requesterId = null) => {
  const skip = (page - 1) * limit;

  // If requester is the owner, show all videos; otherwise only public + READY
  const filter = { user: userId };
  if (requesterId && requesterId.toString() === userId.toString()) {
    // Owner sees all their videos (any status/visibility)
  } else {
    filter.visibility = 'public';
    filter.status = 'READY';
  }

  const [videos, total] = await Promise.all([
    Video.find(filter)
      .populate('user', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Video.countDocuments(filter),
  ]);

  return {
    videos,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Update video metadata (title, description, tags, visibility)
 */
const updateVideo = async (videoId, userId, updateData) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  // Only allow updating certain fields
  const allowedFields = ['title', 'description', 'tags', 'visibility'];
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      video[field] = updateData[field];
    }
  }

  await video.save();
  return video;
};

/**
 * Delete video (remove from DB + optionally delete S3 objects)
 */
const deleteVideo = async (videoId, userId) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  // Delete raw video from S3 (best effort — don't fail if S3 delete fails)
  if (video.rawS3Key) {
    try {
      await s3Service.deleteObject(process.env.S3_RAW_BUCKET_NAME, video.rawS3Key);
    } catch (err) {
      console.warn(`⚠️ Failed to delete S3 object: ${video.rawS3Key}`, err.message);
    }
  }

  await Video.findByIdAndDelete(videoId);
  return video;
};

/**
 * Increment view count by 1
 */
const incrementViews = async (videoId) => {
  await Video.findByIdAndUpdate(videoId, { $inc: { views: 1 } });
};

module.exports = {
  getUploadUrl,
  createVideo,
  confirmUpload,
  getVideoById,
  getAllVideos,
  getVideosByUser,
  updateVideo,
  deleteVideo,
  incrementViews,
};
