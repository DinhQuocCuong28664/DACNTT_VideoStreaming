const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
  {
    video: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Video',
      required: true,
      index: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: [true, 'Comment content cannot be empty'],
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    },
    /**
     * The top-level comment this one replies to, or null for a top-level
     * comment. Replies are one level deep, as on YouTube: a reply to a reply
     * is stored under the same top-level comment (MongoDB's parent-reference
     * pattern, read with one query per thread).
     */
    parentComment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Comment',
      default: null,
    },
    /** Number of replies, kept on the top-level comment for the "N replies" button. */
    replyCount: {
      type: Number,
      default: 0,
    },
    /** Open viewer reports (CommentReport); above 0 puts the comment in the staff queue. */
    openReports: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Top-level comments of a video newest first, and the replies of one comment
// oldest first. Both lists page by `_id` (keyset pagination).
commentSchema.index({ video: 1, parentComment: 1, _id: -1 });
commentSchema.index({ parentComment: 1, _id: 1 });
// The staff queue of reported comments, most reported first. Partial, so the
// index only holds the few comments that have open reports.
commentSchema.index(
  { openReports: -1, _id: -1 },
  { partialFilterExpression: { openReports: { $gt: 0 } } }
);

commentSchema.methods.toJSON = function () {
  const comment = this.toObject();
  delete comment.__v;
  return comment;
};

module.exports = mongoose.model('Comment', commentSchema);
