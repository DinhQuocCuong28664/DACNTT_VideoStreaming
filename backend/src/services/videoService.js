const mongoose = require('mongoose');
const Video = require('../models/Video');
const Comment = require('../models/Comment');
const s3Service = require('./s3Service');

/**
 * Initiate upload flow:
 * 1. Create DB record FIRST (status: UPLOADING) to get Mongo _id (videoId)
 * 2. Generate S3 key using Mongo _id: videos/{userId}/{videoId}/{filename}
 * 3. Generate Pre-signed PUT URL for client
 * 4. Return video record + uploadUrl + s3Key
 */
const initiateUpload = async (userId, videoData) => {
  const video = await Video.create({
    title: videoData.title || 'Untitled Video',
    description: videoData.description || '',
    user: userId,
    category: videoData.category || 'Công nghệ',
    mimeType: videoData.mimeType,
    fileSize: videoData.fileSize || 0,
    tags: videoData.tags || [],
    visibility: videoData.visibility || 'public',
    status: 'UPLOADING',
  });

  const s3Key = s3Service.generateS3Key(userId, video._id.toString(), videoData.filename);
  video.rawS3Key = s3Key;
  await video.save();

  const uploadUrl = await s3Service.generatePresignedUploadUrl(s3Key, videoData.mimeType);

  return { video, uploadUrl, s3Key };
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
    return video;
  }

  video.status = 'PROCESSING';
  await video.save();

  return video;
};

/**
 * Get a single video by ID with visibility & status security checks
 */
const getVideoById = async (videoId, requesterUser = null) => {
  if (!mongoose.Types.ObjectId.isValid(videoId)) {
    const error = new Error('Invalid video ID');
    error.statusCode = 400;
    throw error;
  }

  const video = await Video.findById(videoId).populate(
    'user',
    'username displayName avatar'
  );

  if (!video) {
    const error = new Error('Video not found');
    error.statusCode = 404;
    throw error;
  }

  const isOwner =
    requesterUser && requesterUser._id && requesterUser._id.toString() === video.user._id.toString();

  if (!isOwner) {
    if (video.visibility === 'private') {
      const error = new Error('Video not found');
      error.statusCode = 404;
      throw error;
    }

    if (video.status !== 'READY') {
      const error = new Error('Video is still processing');
      error.statusCode = 400;
      throw error;
    }
  }

  return video;
};

/**
 * Get all public READY videos (with optional Category & Search filtering)
 */
const getAllVideos = async (page = 1, limit = 12, category = null, searchQuery = null) => {
  const skip = (page - 1) * limit;

  const filter = { visibility: 'public', status: 'READY' };

  if (category && category !== 'Tất cả') {
    filter.category = category;
  }

  if (searchQuery && searchQuery.trim() !== '') {
    const escapedQuery = searchQuery.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escapedQuery, 'i');
    filter.$or = [{ title: regex }, { description: regex }, { tags: regex }];
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
 * Get videos by a specific user (for Channel page) with pagination
 */
const getVideosByUser = async (userId, page = 1, limit = 12, requesterId = null) => {
  const skip = (page - 1) * limit;

  const filter = { user: userId };
  if (requesterId && requesterId.toString() === userId.toString()) {
    // Owner sees all their videos
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
 * Toggle Like on video (enforces visibility & READY status checks)
 */
const toggleLike = async (videoId, userId) => {
  const video = await getVideoById(videoId, { _id: userId });

  const userObjId = new mongoose.Types.ObjectId(userId);

  // Remove from dislikes if present
  video.dislikes = video.dislikes.filter((id) => !id.equals(userObjId));

  const hasLiked = video.likes.some((id) => id.equals(userObjId));
  if (hasLiked) {
    video.likes = video.likes.filter((id) => !id.equals(userObjId));
  } else {
    video.likes.push(userObjId);
  }

  await video.save();
  return { likesCount: video.likes.length, dislikesCount: video.dislikes.length, hasLiked: !hasLiked };
};

/**
 * Toggle Dislike on video (enforces visibility & READY status checks)
 */
const toggleDislike = async (videoId, userId) => {
  const video = await getVideoById(videoId, { _id: userId });

  const userObjId = new mongoose.Types.ObjectId(userId);

  // Remove from likes if present
  video.likes = video.likes.filter((id) => !id.equals(userObjId));

  const hasDisliked = video.dislikes.some((id) => id.equals(userObjId));
  if (hasDisliked) {
    video.dislikes = video.dislikes.filter((id) => !id.equals(userObjId));
  } else {
    video.dislikes.push(userObjId);
  }

  await video.save();
  return { likesCount: video.likes.length, dislikesCount: video.dislikes.length, hasDisliked: !hasDisliked };
};

/**
 * Get comments for a video (enforces visibility & READY status checks)
 */
const getComments = async (videoId, page = 1, limit = 20, requesterUser = null) => {
  await getVideoById(videoId, requesterUser);

  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    Comment.find({ video: videoId })
      .populate('user', 'username displayName avatar')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Comment.countDocuments({ video: videoId }),
  ]);

  return { comments, total };
};

/**
 * Add a new comment (enforces visibility & READY status checks)
 */
const addComment = async (videoId, userId, content) => {
  await getVideoById(videoId, { _id: userId });

  const comment = await Comment.create({
    video: videoId,
    user: userId,
    content,
  });

  return await comment.populate('user', 'username displayName avatar');
};

/**
 * Delete a comment (Author of comment OR Video owner can delete)
 */
const deleteComment = async (commentId, userId) => {
  const comment = await Comment.findById(commentId).populate('video', 'user');
  if (!comment) {
    const error = new Error('Comment not found');
    error.statusCode = 404;
    throw error;
  }

  const isCommentOwner = comment.user.toString() === userId.toString();
  const isVideoOwner = comment.video && comment.video.user.toString() === userId.toString();

  if (!isCommentOwner && !isVideoOwner) {
    const error = new Error('Not authorized to delete this comment');
    error.statusCode = 403;
    throw error;
  }

  await Comment.findByIdAndDelete(commentId);
  return comment;
};

/**
 * Update video metadata (title, description, category, tags, visibility)
 */
const updateVideo = async (videoId, userId, updateData) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  const allowedFields = ['title', 'description', 'category', 'tags', 'visibility'];
  for (const field of allowedFields) {
    if (updateData[field] !== undefined) {
      video[field] = updateData[field];
    }
  }

  await video.save();
  return video;
};

/**
 * Delete video (remove from DB + delete both raw & processed HLS S3 objects + comments)
 */
const deleteVideo = async (videoId, userId) => {
  const video = await Video.findOne({ _id: videoId, user: userId });

  if (!video) {
    const error = new Error('Video not found or not owned by user');
    error.statusCode = 404;
    throw error;
  }

  // 1. Delete raw video from S3 Raw Bucket
  if (video.rawS3Key) {
    try {
      await s3Service.deleteObject(process.env.S3_RAW_BUCKET_NAME, video.rawS3Key);
    } catch (err) {
      console.warn(`⚠️ Failed to delete S3 raw object: ${video.rawS3Key}`, err.message);
    }
  }

  // 2. Delete processed HLS directory from S3 Processed Bucket
  try {
    await s3Service.deleteDirectory(process.env.S3_PROCESSED_BUCKET_NAME, `videos/${videoId}/`);
  } catch (err) {
    console.warn(`⚠️ Failed to delete S3 processed directory videos/${videoId}/:`, err.message);
  }

  // 3. Delete comments
  await Comment.deleteMany({ video: videoId });

  // 4. Delete DB record
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
  initiateUpload,
  confirmUpload,
  getVideoById,
  getAllVideos,
  getVideosByUser,
  toggleLike,
  toggleDislike,
  getComments,
  addComment,
  deleteComment,
  updateVideo,
  deleteVideo,
  incrementViews,
};
