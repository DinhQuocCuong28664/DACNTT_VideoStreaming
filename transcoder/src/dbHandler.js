const mongoose = require('mongoose');
const config = require('./config');

// Video schema (same as backend — minimal fields needed for transcoder)
const videoSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    user: mongoose.Schema.Types.ObjectId,
    status: {
      type: String,
      enum: ['UPLOADING', 'PROCESSING', 'READY', 'ERROR'],
    },
    rawS3Key: String,
    hlsUrl: String,
    thumbnailUrl: String,
    duration: Number,
    fileSize: Number,
    mimeType: String,
    views: Number,
    tags: [String],
    visibility: String,
  },
  { timestamps: true }
);

const Video = mongoose.model('Video', videoSchema);

/**
 * Connect to MongoDB Atlas
 */
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return; // Already connected
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(config.mongodbUri);
  console.log('✅ MongoDB Connected');
};

/**
 * Disconnect from MongoDB
 */
const disconnectDB = async () => {
  await mongoose.disconnect();
  console.log('🔌 MongoDB Disconnected');
};

/**
 * Update video status after transcoding completes
 */
const updateVideoReady = async (videoId, { hlsUrl, thumbnailUrl, duration }) => {
  const video = await Video.findById(videoId);
  if (!video) {
    throw new Error(`Video not found: ${videoId}`);
  }

  video.status = 'READY';
  video.hlsUrl = hlsUrl;
  if (thumbnailUrl) video.thumbnailUrl = thumbnailUrl;
  if (duration) video.duration = duration;
  await video.save();

  console.log(`✅ Video ${videoId} status → READY`);
  return video;
};

/**
 * Mark video as ERROR
 */
const updateVideoError = async (videoId, errorMessage) => {
  const video = await Video.findById(videoId);
  if (!video) {
    console.error(`Video not found: ${videoId}`);
    return;
  }

  video.status = 'ERROR';
  await video.save();

  console.error(`❌ Video ${videoId} status → ERROR: ${errorMessage}`);
  return video;
};

/**
 * Get video by ID
 */
const getVideo = async (videoId) => {
  return Video.findById(videoId);
};

module.exports = {
  connectDB,
  disconnectDB,
  updateVideoReady,
  updateVideoError,
  getVideo,
};
