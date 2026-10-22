const commentReportService = require('../services/commentReportService');
const { parsePaging } = require('../utils/pagination');
const { t } = require('../config/i18n');

/**
 * @route   POST /api/videos/comments/:commentId/report
 * @body    { reason: 'sexual' | 'violent' | ..., details?: string }
 * @access  Private
 */
const reportComment = async (req, res, next) => {
  try {
    const { alreadyReported } = await commentReportService.reportComment(req.params.commentId, req.user, req.body);
    res.status(alreadyReported ? 200 : 201).json({
      success: true,
      message: t(req, alreadyReported ? 'report.commentAlreadyReported' : 'report.commentReceived'),
      data: { alreadyReported },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/comments
 * @desc    Comments with open reports, most reported first
 * @access  Operator, Admin (moderation:review)
 */
const listReportedComments = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, 20);
    const result = await commentReportService.listReportedComments({ page, limit });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/admin/comments/:id
 * @body    { decision: 'dismiss' | 'remove' }
 * @access  Operator, Admin (moderation:review)
 */
const resolveCommentReports = async (req, res, next) => {
  try {
    const result = await commentReportService.resolveCommentReports(req.params.id, req.user, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = { reportComment, listReportedComments, resolveCommentReports };
