const mongoose = require('mongoose');
const Comment = require('../models/Comment');
const CommentReport = require('../models/CommentReport');
const videoService = require('./videoService');
const httpError = require('../utils/httpError');
const { REPORT_REASONS, MAX_REPORT_DETAILS } = require('../utils/moderation');

/**
 * Viewer reports on comments and the staff queue that handles them.
 *
 * Follows the video report flow (moderationService.createReport): one open
 * report per person per comment, a counter on the comment that orders the
 * queue, and a decision by a person with `moderation:review`. Decisions here
 * write no ModerationEvent, so they stay out of the video moderation metrics.
 */

const COMMENT_DECISIONS = ['dismiss', 'remove'];

const assertId = (id, what) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    throw httpError(400, `Invalid ${what} ID`);
  }
};

const notFound = () => httpError(404, 'Comment not found');

/**
 * A viewer reports a comment. The viewer must be able to see the video the
 * comment belongs to, so reports cannot probe private videos. A repeat report
 * while the first is still open succeeds without counting twice.
 *
 * @returns {Promise<{ alreadyReported: boolean }>}
 */
const reportComment = async (commentId, reporter, { reason, details } = {}) => {
  if (!REPORT_REASONS.includes(reason)) {
    throw httpError(400, `Report reason must be one of: ${REPORT_REASONS.join(', ')}`);
  }
  const text = typeof details === 'string' ? details.trim() : '';
  if (text.length > MAX_REPORT_DETAILS) {
    throw httpError(400, `Report details cannot exceed ${MAX_REPORT_DETAILS} characters`);
  }
  assertId(commentId, 'comment');

  const comment = await Comment.findById(commentId).select('video user');
  if (!comment) throw notFound();
  await videoService.getVideoById(comment.video, reporter);

  if (comment.user.toString() === reporter._id.toString()) {
    throw httpError(400, 'You cannot report your own comment');
  }

  try {
    await CommentReport.create({
      comment: comment._id,
      video: comment.video,
      reporter: reporter._id,
      reason,
      details: text,
    });
  } catch (err) {
    if (err && err.code === 11000) return { alreadyReported: true };
    throw err;
  }

  await Comment.updateOne({ _id: comment._id }, { $inc: { openReports: 1 } });
  return { alreadyReported: false };
};

/** Open reports per reason for the comments on one page of the queue. */
const countOpenReasons = async (commentIds) => {
  if (commentIds.length === 0) return new Map();
  const rows = await CommentReport.aggregate([
    { $match: { comment: { $in: commentIds }, status: 'open' } },
    { $group: { _id: { comment: '$comment', reason: '$reason' }, count: { $sum: 1 } } },
  ]);
  const byComment = new Map();
  for (const row of rows) {
    const key = row._id.comment.toString();
    const reasons = byComment.get(key) || {};
    reasons[row._id.reason] = row.count;
    byComment.set(key, reasons);
  }
  return byComment;
};

const QUEUE_FILTER = { openReports: { $gt: 0 } };

/** The staff queue: comments with open reports, most reported first. */
const listReportedComments = async ({ page = 1, limit = 20 } = {}) => {
  const [comments, total] = await Promise.all([
    Comment.find(QUEUE_FILTER)
      .sort({ openReports: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', videoService.COMMENT_AUTHOR_FIELDS)
      .populate('video', 'title thumbnailUrl duration')
      .lean(),
    Comment.countDocuments(QUEUE_FILTER),
  ]);
  const reasons = await countOpenReasons(comments.map((c) => c._id));

  return {
    comments: comments.map((c) => ({ ...c, reportReasons: reasons.get(c._id.toString()) || {} })),
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};

/**
 * Staff close the open reports of a comment: `dismiss` keeps the comment,
 * `remove` deletes it (with its replies, as a delete by its author would)
 * after copying its text into the reports.
 *
 * @returns {Promise<{ decision: string, resolved: number }>}
 */
const resolveCommentReports = async (commentId, staff, { decision } = {}) => {
  if (!COMMENT_DECISIONS.includes(decision)) {
    throw httpError(400, `Decision must be one of: ${COMMENT_DECISIONS.join(', ')}`);
  }
  assertId(commentId, 'comment');

  const comment = await Comment.findById(commentId).populate('video', 'user pinnedComment');
  if (!comment) throw notFound();

  const resolution = { resolvedBy: staff._id, resolvedAt: new Date() };
  const open = { comment: comment._id, status: 'open' };

  if (decision === 'dismiss') {
    const { modifiedCount } = await CommentReport.updateMany(open, { $set: { status: 'dismissed', ...resolution } });
    // Recount rather than set 0: a report filed during this request stays open
    // and keeps the comment in the queue.
    const stillOpen = await CommentReport.countDocuments(open);
    await Comment.updateOne({ _id: comment._id }, { $set: { openReports: stillOpen } });
    return { decision, resolved: modifiedCount };
  }

  const { modifiedCount } = await CommentReport.updateMany(open, {
    $set: { status: 'actioned', ...resolution, commentText: comment.content, commentAuthor: comment.user },
  });
  await videoService.removeComment(comment);
  return { decision, resolved: modifiedCount };
};

module.exports = {
  COMMENT_DECISIONS,
  reportComment,
  listReportedComments,
  resolveCommentReports,
};
