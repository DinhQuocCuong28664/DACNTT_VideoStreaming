const mongoose = require('mongoose');
const { REPORT_REASONS, MAX_REPORT_DETAILS } = require('../utils/moderation');

/**
 * Báo cáo vi phạm do người xem gửi.
 *
 * Mỗi người chỉ có tối đa MỘT báo cáo đang mở cho mỗi video (chỉ mục duy nhất
 * một phần bên dưới) — bấm báo cáo mười lần không làm video nhảy lên đầu hàng
 * rà soát. Sau khi quản trị viên xử lý, báo cáo chuyển sang `dismissed` hoặc
 * `actioned` và người đó báo cáo lại được nếu video tiếp tục có vấn đề.
 */
const reportSchema = new mongoose.Schema(
  {
    video: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Video',
      required: true,
      index: true,
    },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    reason: {
      type: String,
      enum: REPORT_REASONS,
      required: [true, 'Report reason is required'],
    },
    details: {
      type: String,
      trim: true,
      default: '',
      maxlength: [MAX_REPORT_DETAILS, `Report details cannot exceed ${MAX_REPORT_DETAILS} characters`],
    },
    status: {
      type: String,
      enum: ['open', 'dismissed', 'actioned'],
      default: 'open',
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    resolvedAt: Date,
  },
  {
    timestamps: true,
  }
);

reportSchema.index(
  { video: 1, reporter: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);
reportSchema.index({ status: 1, createdAt: -1 });

reportSchema.methods.toJSON = function () {
  const report = this.toObject();
  delete report.__v;
  return report;
};

module.exports = mongoose.model('Report', reportSchema);
