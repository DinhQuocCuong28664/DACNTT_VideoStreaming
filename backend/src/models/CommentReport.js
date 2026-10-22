const mongoose = require('mongoose');
const { REPORT_REASONS, MAX_REPORT_DETAILS } = require('../utils/moderation');

/**
 * A viewer's report of a comment. Same rules as a video report (Report.js):
 * at most one open report per person per comment, and the reason list is the
 * same closed vocabulary.
 *
 * Kept apart from Report on purpose: comment decisions are not part of the
 * video moderation metrics (false positive and false negative rates of the
 * automated screening), and must not change them.
 *
 * When staff remove the comment, the report keeps a copy of its text and
 * author, so the decision can still be checked after the comment is gone.
 */
const commentReportSchema = new mongoose.Schema(
  {
    comment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      required: true,
    },
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
    // Filled when staff remove the comment.
    commentText: String,
    commentAuthor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

commentReportSchema.index(
  { comment: 1, reporter: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } }
);
commentReportSchema.index({ comment: 1, status: 1 });

commentReportSchema.methods.toJSON = function () {
  const report = this.toObject();
  delete report.__v;
  return report;
};

module.exports = mongoose.model('CommentReport', commentReportSchema);
