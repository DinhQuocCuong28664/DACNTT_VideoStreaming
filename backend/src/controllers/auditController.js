const auditService = require('../services/auditService');
const { parsePaging } = require('../utils/pagination');

/**
 * @route   POST /api/admin/audit/sample
 * @body    { size: 1..100 }
 * @access  Admin
 */
const createSample = async (req, res, next) => {
  try {
    const result = await auditService.createSample(req.user, req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/audit
 * @query   status = pending (mặc định) | pass | fail, page, limit
 * @access  Operator, Admin
 */
const listSamples = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, 20);
    const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
    const result = await auditService.listSamples(req.user, { status, page, limit });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/admin/audit/:id
 * @body    { result: 'pass' | 'fail', note?: string }
 * @access  Operator, Admin
 */
const labelSample = async (req, res, next) => {
  try {
    const sample = await auditService.labelSample(req.params.id, req.user, req.body);
    res.status(200).json({ success: true, data: { sample } });
  } catch (error) {
    next(error);
  }
};

module.exports = { createSample, listSamples, labelSample };
