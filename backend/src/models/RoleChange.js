const mongoose = require('mongoose');
const { ROLES } = require('../utils/roles');

/**
 * Nhật ký đổi vai trò: chỉ thêm, không sửa, không xoá.
 *
 * Đổi vai trò là thao tác nhạy cảm nhất của trang vận hành (nó cấp quyền gỡ video và xem email),
 * nên mỗi lần đổi để lại dấu vết: ai đổi, đổi cho ai, từ gì sang gì. Auditor đọc được qua
 * /api/admin/role-changes.
 */
const roleChangeSchema = new mongoose.Schema(
  {
    target: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    from: { type: String, enum: ROLES, required: true },
    to: { type: String, enum: ROLES, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

roleChangeSchema.index({ createdAt: -1 });

module.exports = mongoose.model('RoleChange', roleChangeSchema);
