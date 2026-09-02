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
    category: {
      type: String,
      default: 'Công nghệ',
      enum: ['Tất cả', 'Công nghệ', 'Giáo dục', 'Giải trí', 'Âm nhạc', 'Game', 'Khác'],
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
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    dislikes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
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
videoSchema.index({ user: 1, createdAt: -1 });
videoSchema.index({ status: 1 });
videoSchema.index({ category: 1 });
videoSchema.index({ tags: 1 });
videoSchema.index({ visibility: 1, status: 1, createdAt: -1 });

// Ghi chu: truoc day o day co mot text index { title: 'text', description: 'text' }.
// No da duoc go bo vi khong truy van nao dung den — getAllVideos() tim kiem bang
// bieu thuc chinh quy khong neo dau chuoi (xem videoService.js), va MongoDB khong
// the dung index cho dang regex do, nen moi lan tim kiem van la mot lan quet toan
// bo collection. Giu lai text index chi ton them dung luong va lam cham moi thao
// tac ghi ma khong doi lai loi ich nao.
//
// Van con la lua chon mo: chuyen sang $text se dung duoc index, nhung se doi ca
// hanh vi tim kiem — regex hien tai khop duoc chuoi con o giua tu va khop ca
// truong tags, hai dieu ma $text khong lam duoc.

// Remove __v from JSON output
videoSchema.methods.toJSON = function () {
  const video = this.toObject();
  delete video.__v;
  return video;
};

module.exports = mongoose.model('Video', videoSchema);
