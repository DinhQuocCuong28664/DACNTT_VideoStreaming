const userAdminService = require('../services/userAdminService');
const { parsePaging } = require('../utils/pagination');

/**
 * @route   GET /api/admin/users
 * @query   q? (tên, email), role?, page, limit
 * @access  Admin
 */
const listUsers = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, 20);
    const q = typeof req.query.q === 'string' ? req.query.q : undefined;
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const result = await userAdminService.listUsers({ q, role, page, limit });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   PATCH /api/admin/users/:id/role
 * @body    { role: 'user' | 'operator' | 'auditor' | 'admin' }
 * @access  Admin
 */
const changeRole = async (req, res, next) => {
  try {
    const result = await userAdminService.changeRole(req.params.id, req.user, req.body);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

/**
 * @route   GET /api/admin/role-changes
 * @access  Auditor, Admin
 */
const listRoleChanges = async (req, res, next) => {
  try {
    const { page, limit } = parsePaging(req.query, 20);
    const result = await userAdminService.listRoleChanges({ page, limit });
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

module.exports = { listUsers, changeRole, listRoleChanges };
