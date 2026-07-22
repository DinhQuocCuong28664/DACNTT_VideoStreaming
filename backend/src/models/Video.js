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
      required: true,
    },
    status: {
      type: String,
      enum: ['UPLOADING', 'PROCESSING', 'READY', 'ERROR'],
      default: 'UPLOADING',
    },
    // S3 Paths & CloudFront Delivery
    rawS3Key: {
      type: String,
      default: '',
    },
    hlsUrl: {
      type: String,
      default: '',
    },
    thumbnailUrl: {
      type: String,
      default: '',
    },
    // Video Properties
    duration: {
      type: Number,
      default: 0,
    },
    fileSize: {
      type: Number,
      default: 0,
    },
    mimeType: {
      type: String,
      default: '',
    },
    // Metadata & Engagement
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

// Indexes
videoSchema.index({ user: 1, createdAt: -1 });
videoSchema.index({ status: 1 });
videoSchema.index({ tags: 1 });

const Video = mongoose.model('Video', videoSchema);

module.exports = Video;
