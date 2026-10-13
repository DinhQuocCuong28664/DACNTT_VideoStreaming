const { ROLES, PERMISSIONS, can, isStaff } = require('../src/utils/roles');
const { requirePermission } = require('../src/middleware/auth');

jest.mock('../src/models/User');

/**
 * Bảng quyền của đội ngũ vận hành.
 *
 * Bảng này là hợp đồng bảo mật: mỗi dòng ở đây là một điều người vận hành (và người
 * giải thích với thầy) cần đọc được. Kiểm tra theo ma trận đầy đủ, không theo từng
 * trường hợp riêng lẻ, để thêm quyền hay vai trò mà quên sửa bảng sẽ làm test đỏ.
 */
describe('Vai trò và quyền', () => {
  const user = (role) => ({ _id: `id-${role}`, role });

  // Mỗi hàng: quyền -> vai trò được phép. Viết lại tường minh thay vì suy ra từ PERMISSIONS,
  // nếu không test chỉ lặp lại mã.
  const MATRIX = {
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

  it('bảng PERMISSIONS không có quyền nào ngoài ma trận mong đợi', () => {
    expect(Object.keys(PERMISSIONS).sort()).toEqual(Object.keys(MATRIX).sort());
  });

  describe.each(Object.entries(MATRIX))('%s', (permission, allowed) => {
    it.each(ROLES)('vai trò %s', (role) => {
      expect(can(user(role), permission)).toBe(allowed.includes(role));
    });
  });

  it('không cấp quyền cho người dùng thiếu, vai trò lạ hay quyền không tồn tại', () => {
    expect(can(null, 'moderation:review')).toBe(false);
    expect(can(undefined, 'moderation:review')).toBe(false);
    expect(can({ role: 'superuser' }, 'moderation:review')).toBe(false);
    expect(can({}, 'moderation:review')).toBe(false);
    expect(can(user('admin'), 'khong:ton-tai')).toBe(false);
  });

  it('operator không thấy email và không đổi được vai trò', () => {
    expect(can(user('operator'), 'pii:email')).toBe(false);
    expect(can(user('operator'), 'users:manage')).toBe(false);
  });

  it('auditor chỉ đọc: không quyết định, không phát video bị gỡ', () => {
    for (const permission of ['moderation:review', 'moderation:appeals', 'moderation:audit', 'content:viewRemoved']) {
      expect(can(user('auditor'), permission)).toBe(false);
    }
  });

  it('isStaff gồm operator, auditor, admin và loại user', () => {
    expect(isStaff(user('operator'))).toBe(true);
    expect(isStaff(user('auditor'))).toBe(true);
    expect(isStaff(user('admin'))).toBe(true);
    expect(isStaff(user('user'))).toBe(false);
    expect(isStaff(null)).toBe(false);
  });

  describe('requirePermission', () => {
    const createRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };
    const run = (middleware, role) => {
      const res = createRes();
      const next = jest.fn();
      middleware({ user: role ? user(role) : undefined, headers: {} }, res, next);
      return { res, next };
    };

    it('cho qua vai trò có quyền và chặn 403 vai trò không có', () => {
      const guard = requirePermission('moderation:review');

      expect(run(guard, 'operator').next).toHaveBeenCalled();
      expect(run(guard, 'admin').next).toHaveBeenCalled();

      const denied = run(guard, 'auditor');
      expect(denied.next).not.toHaveBeenCalled();
      expect(denied.res.status).toHaveBeenCalledWith(403);
    });

    it('chặn khi không có req.user', () => {
      const { res, next } = run(requirePermission('moderation:review'), null);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('nhiều quyền nghĩa là một trong số đó', () => {
      const guard = requirePermission('moderation:review', 'metrics:read');

      expect(run(guard, 'operator').next).toHaveBeenCalled();
      expect(run(guard, 'auditor').next).toHaveBeenCalled();
      expect(run(guard, 'user').res.status).toHaveBeenCalledWith(403);
    });
  });
});
