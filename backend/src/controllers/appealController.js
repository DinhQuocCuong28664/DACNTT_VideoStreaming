const appealService = require('../services/appealService');
const { parsePaging } = require('../utils/pagination');

/**
 * @route   POST /api/videos/:id/appeal
 * @desc    Chủ video khiếu nại một video bị gỡ
 * @body    { message: string }
 * @access  Private (chủ video)
 */
const createAppeal = async (req, res, next) => {
  try {
    const appeal = await appealService.createAppeal(req.params.id, req.user, req.body);
    res.status(201).json({ success: true, data: { appeal } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/videos/:id/appeal
 * @desc    Khiếu nại gần nhất của chính chủ video (hoặc null)
 * @access  Private (chủ video)
 */
const getOwnAppeal = async (req, res, next) => {
  try {
    const appeal = await appealService.getOwnAppeal(req.params.id, req.user);
    res.status(200).json({ success: true, data: { appeal } });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/appeals
 * @query   status = open (mặc định) | upheld | rejected, page, limit
 * @access  Operator, Admin
 */
const listAppeals = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, 20);
    const status = typeof req.query.status === 'string' ? req.query.status : 'open';
    const result = await appealService.listAppeals(req.user, { status, page, limit });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/admin/appeals/:id
 * @body    { decision: 'uphold' | 'reject', note?: string, reasonCode?: string }
 * @access  Operator, Admin
 */
const resolveAppeal = async (req, res, next) => {
  try {
    const appeal = await appealService.resolveAppeal(req.params.id, req.user, req.body);
    res.status(200).json({ success: true, data: { appeal } });
  } catch (error) {
    next(error);
  }
};

module.exports = { createAppeal, getOwnAppeal, listAppeals, resolveAppeal };
