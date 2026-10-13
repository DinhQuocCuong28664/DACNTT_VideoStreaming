const mongoose = require('mongoose');
const User = require('../models/User');
const RoleChange = require('../models/RoleChange');
const httpError = require('../utils/httpError');
const { ROLES } = require('../utils/roles');

/**
 * Quản lý vai trò người dùng, dành cho admin (quyền `users:manage`).
 *
 * Đây là đường ghi thứ hai của trường `role` (đường thứ nhất là backend/scripts/set-role.js), nên
 * giữ ba ràng buộc để một lỗi ở tầng HTTP hay một tài khoản admin bị chiếm không thể tự nâng cấp
 * hay làm mất khả năng quản trị:
 *
 * - không đổi vai trò của CHÍNH MÌNH (không tự hạ, không tự nâng);
 * - không hạ admin cuối cùng, để hệ thống không rơi vào trạng thái không ai quản trị được;
 * - mỗi lần đổi ghi nhật ký RoleChange.
 */

const USER_FIELDS = 'username displayName email avatar role createdAt';

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const listUsers = async ({ q, role, page = 1, limit = 20 } = {}) => {
  const filter = {};
  if (role) {
    if (!ROLES.includes(role)) {
      throw httpError(400, `Role must be one of: ${ROLES.join(', ')}`);
    }
    filter.role = role;
  }
  if (typeof q === 'string' && q.trim()) {
    // Từ khoá đã được thoát toàn bộ ký tự đặc biệt và cắt còn 64 ký tự: không chèn được cú pháp
    // biểu thức chính quy (ReDoS / NoSQL regex injection), như tìm kiếm video ở videoService.
    // eslint-disable-next-line security/detect-non-literal-regexp
    const pattern = new RegExp(escapeRegex(q.trim().slice(0, 64)), 'i');
    filter.$or = [{ username: pattern }, { email: pattern }, { displayName: pattern }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(USER_FIELDS)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { users, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

const changeRole = async (targetId, actor, { role } = {}) => {
  if (!mongoose.Types.ObjectId.isValid(targetId)) {
    throw httpError(400, 'Invalid user ID');
  }
  if (!ROLES.includes(role)) {
    throw httpError(400, `Role must be one of: ${ROLES.join(', ')}`);
  }
  if (String(targetId) === String(actor._id)) {
    throw httpError(403, 'You cannot change your own role', 'CANNOT_CHANGE_OWN_ROLE');
  }

  const target = await User.findById(targetId).select('role').lean();
  if (!target) {
    throw httpError(404, 'User not found');
  }
  if (target.role === role) {
    return { changed: false, user: { _id: targetId, role } };
  }

  if (target.role === 'admin') {
    const admins = await User.countDocuments({ role: 'admin' });
    if (admins <= 1) {
      throw httpError(409, 'The last admin cannot be demoted', 'LAST_ADMIN');
    }
  }

  // Có điều kiện theo vai trò vừa đọc: hai admin đổi cùng một người cùng lúc thì chỉ một lệnh thắng.
  const updated = await User.findOneAndUpdate(
    { _id: targetId, role: target.role },
    { $set: { role } },
    { returnDocument: 'after' }
  )
    .select(USER_FIELDS)
    .lean();

  if (!updated) {
    throw httpError(409, 'The role was changed by someone else; reload and try again', 'ROLE_CONFLICT');
  }

  await RoleChange.create({ target: targetId, actor: actor._id, from: target.role, to: role });
  return { changed: true, user: updated };
};

const listRoleChanges = async ({ page = 1, limit = 20 } = {}) => {
  const [changes, total] = await Promise.all([
    RoleChange.find({})
      .populate('target', 'username displayName')
      .populate('actor', 'username displayName')
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    RoleChange.countDocuments({}),
  ]);

  return { changes, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
};

module.exports = { listUsers, changeRole, listRoleChanges };
