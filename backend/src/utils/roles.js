/**
 * Vai trò và quyền của đội ngũ vận hành.
 *
 * Bốn vai trò, xếp theo mức tin cậy giảm dần:
 *
 * - `admin`: toàn quyền, gồm đổi vai trò và lấy mẫu kiểm tra.
 * - `operator`: rà soát hàng chờ, duyệt hoặc gỡ video (kèm mã lý do), xử lý khiếu nại
 *   và gán nhãn kiểm tra mẫu. Không thấy email chủ video, không đổi vai trò, không
 *   đổi được quyết định mà admin đã đưa ra.
 * - `auditor`: chỉ đọc số liệu FP/FN và nhật ký quyết định. Tách người xem số liệu
 *   khỏi người ra quyết định để việc giám sát không phụ thuộc vào người bị giám sát.
 * - `user`: người dùng thường.
 *
 * Kiểm tra theo QUYỀN (`can`), không theo tên vai trò: thêm vai trò chỉ cần sửa bảng
 * này, không phải lần theo từng chỗ so `role === 'admin'` trong mã.
 */

const ROLES = ['user', 'operator', 'auditor', 'admin'];

/** Các vai trò thuộc đội ngũ vận hành (được vào /admin). */
const STAFF_ROLES = ['operator', 'auditor', 'admin'];

const PERMISSIONS = {
  // Hàng rà soát, tab "Đã gỡ", quyết định duyệt hoặc gỡ.
  'moderation:review': ['admin', 'operator'],
  // Hàng khiếu nại của chủ video.
  'moderation:appeals': ['admin', 'operator'],
  // Gán nhãn các video thuộc lượt kiểm tra mẫu.
  'moderation:audit': ['admin', 'operator'],
  // Tạo lượt lấy mẫu mới (tốn công người nên chỉ admin bấm được).
  'moderation:sample': ['admin'],
  // Số liệu FP/FN và nhật ký quyết định.
  'metrics:read': ['admin', 'auditor'],
  'events:read': ['admin', 'auditor'],
  // Xem, đổi vai trò người dùng.
  'users:manage': ['admin'],
  // Thấy email chủ video trong hàng rà soát.
  'pii:email': ['admin'],
  // Xem và phát video đã bị gỡ hoặc đang chờ rà soát.
  'content:viewRemoved': ['admin', 'operator'],
};

/** Người dùng có quyền `permission` không? An toàn với `user` thiếu hoặc vai trò lạ. */
const can = (user, permission) => {
  const allowed = PERMISSIONS[permission];
  return Boolean(user && allowed && allowed.includes(user.role));
};

const isStaff = (user) => Boolean(user && STAFF_ROLES.includes(user.role));

module.exports = { ROLES, STAFF_ROLES, PERMISSIONS, can, isStaff };
