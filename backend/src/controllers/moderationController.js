const moderationService = require('../services/moderationService');
const { parsePaging } = require('../utils/pagination');
const { can } = require('../utils/roles');
const { t } = require('../config/i18n');

/**
 * @route   POST /api/videos/:id/report
 * @desc    Người xem báo cáo video vi phạm
 * @body    { reason: 'sexual' | 'violent' | ..., details?: string }
 * @access  Private
 */
const reportVideo = async (req, res, next) => {
  try {
    const { alreadyReported } = await moderationService.createReport(req.params.id, req.user, req.body);

    res.status(alreadyReported ? 200 : 201).json({
      success: true,
      message: t(req, alreadyReported ? 'report.alreadyReported' : 'report.received'),
      data: { alreadyReported },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/stats
 * @desc    Số liệu tổng quan cho trang rà soát
 * @access  Admin
 */
const getModerationStats = async (req, res, next) => {
  try {
    const stats = await moderationService.getStats();
    res.status(200).json({ success: true, data: stats });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/videos
 * @query   tab = review (mặc định) | blocked, page, limit
 * @access  Admin
 */
const getModerationQueue = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, 20);
    const tab = typeof req.query.tab === 'string' ? req.query.tab : 'review';
    // Email chủ video chỉ cho người có quyền pii:email (admin), không cho operator.
    const result = await moderationService.listQueue(tab, page, limit, { includeEmail: can(req.user, 'pii:email') });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/videos/:id/reports
 * @access  Admin
 */
const getVideoReports = async (req, res, next) => {
  try {
    const reports = await moderationService.listReports(req.params.id);
    res.status(200).json({ success: true, data: { reports } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/events
 * @query   outcome? = false_positive | flag_noise | false_negative | true_positive | true_negative | unclassified, page, limit
 * @access  Auditor, Admin
 */
const getModerationEvents = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, 20);
    const outcome = typeof req.query.outcome === 'string' ? req.query.outcome : undefined;
    const result = await moderationService.listEvents(page, limit, { outcome });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/admin/videos/:id/moderation
 * @body    { decision: 'approve' | 'block', reasonCode: string, note?: string }
 * @access  Operator, Admin
 */
const decideVideo = async (req, res, next) => {
  try {
    const video = await moderationService.decide(req.params.id, req.user, req.body);
    res.status(200).json({ success: true, data: { video } });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  reportVideo,
  getModerationStats,
  getModerationQueue,
  getVideoReports,
  getModerationEvents,
  decideVideo,
};
