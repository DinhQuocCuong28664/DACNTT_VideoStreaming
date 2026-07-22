const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Video title is required'],
      trim: true,
      maxlength: [100, 'Title cannot exceed 100 characters'],
    },
    description: {
      type: String,
      default: '',
      maxlength: [5000, 'Description cannot exceed 5000 characters'],
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Video must belong to a user'],
    },
    status: {
      type: String,
      enum: ['UPLOADING', 'PROCESSING', 'READY', 'ERROR'],
      default: 'UPLOADING',
    },

    // S3 Paths
    rawS3Key: {
      type: String,
    },
    hlsUrl: {
      type: String, // CloudFront URL to master.m3u8
    },
    thumbnailUrl: {
      type: String, // CloudFront URL to thumbnail
    },

    // Video Info (populated after transcoding by Fargate Container)
    duration: {
      type: Number,
      default: 0, // Duration in seconds
    },
    fileSize: {
      type: Number,
      default: 0, // File size in bytes
    },
    mimeType: {
      type: String,
    },

    // Engagement
    views: {
      type: Number,
      default: 0,
    },
    tags: {
      type: [String],
      default: [],
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'unlisted'],
      default: 'public',
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for query performance
videoSchema.index({ user: 1, createdAt: -1 }); // Channel page: user's videos sorted by newest
videoSchema.index({ status: 1 }); // Transcoder queries videos by status
videoSchema.index({ tags: 1 }); // Search by tags
videoSchema.index({ visibility: 1, status: 1, createdAt: -1 }); // Home page: public + READY, sorted by newest

// Remove __v from JSON output
videoSchema.methods.toJSON = function () {
  const video = this.toObject();
  delete video.__v;
  return video;
};

module.exports = mongoose.model('Video', videoSchema);
