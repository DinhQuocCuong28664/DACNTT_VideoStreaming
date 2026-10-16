/**
 * Quyền của đội ngũ vận hành, phản chiếu `backend/src/utils/roles.js`.
 *
 * CHỈ để ẩn hiện giao diện cho đúng người: mọi endpoint /api/admin tự kiểm tra quyền ở máy chủ, và
 * máy chủ trả 403 nếu bảng này lệch. Sửa bảng bên backend thì sửa cả ở đây.
 */
export const PERMISSIONS = {
  'moderation:review': ['admin', 'operator'],
  'moderation:appeals': ['admin', 'operator'],
  'moderation:audit': ['admin', 'operator'],
  'moderation:sample': ['admin'],
  'metrics:read': ['admin', 'auditor'],
  'events:read': ['admin', 'auditor'],
  'users:manage': ['admin'],
  'pii:email': ['admin'],
  'content:viewRemoved': ['admin', 'operator'],
};

export const ROLES = ['user', 'operator', 'auditor', 'admin'];

export const can = (user, permission) => Boolean(user && PERMISSIONS[permission]?.includes(user.role));

/** Thuộc đội ngũ vận hành (được vào /admin). */
export const isStaff = (user) => Boolean(user && ['operator', 'auditor', 'admin'].includes(user.role));

/** Mã lý do cho từng quyết định, khớp DECISION_REASONS của backend. */
export const DECISION_REASONS = {
  approve: ['model_error', 'fiction_or_game', 'news_or_education', 'acceptable_context', 'appeal_upheld', 'report_unfounded', 'other'],
  block: ['confirmed_violation', 'missed_by_model', 'report_upheld', 'audit_failed', 'policy_violation', 'other'],
};

/** Khi xác nhận một video máy đã gỡ, chỉ những lý do còn nghĩa (máy đã gỡ rồi nên không có "máy bỏ lọt"). */
export const CONFIRM_REASONS = ['confirmed_violation', 'policy_violation', 'other'];
