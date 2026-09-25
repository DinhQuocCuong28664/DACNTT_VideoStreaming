const mongoose = require('mongoose');
const { MODERATION_STATUSES, MAX_MODERATION_NOTE } = require('../utils/moderation');

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

    /**
     * Kiểm duyệt nội dung.
     *
     * `status` do transcoder ghi khi chuyển mã xong (xem transcoder/src/
     * moderation.js), hoặc do quản trị viên đặt lại ở trang rà soát:
     * - thiếu hẳn: video tải lên trước khi có tính năng này, coi như hợp lệ;
     * - `approved`: đã qua kiểm duyệt tự động hoặc được quản trị viên giữ lại;
     * - `flagged`: chờ rà soát, ẩn khỏi mọi người trừ chủ video và quản trị viên;
     * - `blocked`: đã bị gỡ, không ai ngoài quản trị viên phát được.
     *
     * `openReports` là bộ đếm báo cáo chưa xử lý, giữ ngay trên video để hàng
     * rà soát lọc và sắp xếp được bằng một truy vấn có phân trang.
     */
    moderation: {
      status: { type: String, enum: MODERATION_STATUSES },
      source: { type: String, enum: ['auto', 'admin'] },
      labels: [
        {
          _id: false,
          name: String,
          parentName: String,
          action: String,
          confidence: Number,
          timestamp: Number,
          frames: Number,
        },
      ],
      maxConfidence: Number,
      framesAnalyzed: Number,
      framesPlanned: Number,
      modelVersion: String,
      error: String,
      checkedAt: Date,
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: Date,
      note: {
        type: String,
        maxlength: [MAX_MODERATION_NOTE, `Moderation note cannot exceed ${MAX_MODERATION_NOTE} characters`],
      },
      openReports: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for query performance
videoSchema.index({ user: 1, createdAt: -1 });
// Phục vụ sắp xếp "Phổ biến" trên trang kênh (xem USER_VIDEO_SORTS trong
// videoService.js): lọc theo user rồi sắp theo lượt xem giảm dần.
videoSchema.index({ user: 1, views: -1, createdAt: -1 });
videoSchema.index({ status: 1 });
videoSchema.index({ category: 1 });
videoSchema.index({ tags: 1 });
videoSchema.index({ visibility: 1, status: 1, createdAt: -1 });
// Hàng rà soát của quản trị viên (xem moderationService.listQueue).
videoSchema.index({ 'moderation.status': 1, updatedAt: -1 });
videoSchema.index({ 'moderation.openReports': -1, createdAt: -1 });

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

/**
 * Chỉ để lộ trạng thái kiểm duyệt ra ngoài, không để lộ chi tiết.
 *
 * Nhãn, độ tin cậy và số báo cáo chỉ dành cho quản trị viên: công bố chúng cho
 * người tải lên là chỉ cho kẻ vi phạm có chủ đích biết cần chỉnh video ở đâu
 * để lọt bộ lọc. Trang quản trị đọc bằng truy vấn `.lean()`, vốn không đi qua
 * hàm này, nên vẫn thấy đầy đủ.
 */
videoSchema.methods.toJSON = function () {
  const video = this.toObject();
  delete video.__v;
  if (video.moderation) {
    video.moderation = video.moderation.status
      ? { status: video.moderation.status, note: video.moderation.note }
      : undefined;
  }
  return video;
};

module.exports = mongoose.model('Video', videoSchema);
