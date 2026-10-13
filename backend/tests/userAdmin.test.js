const mongoose = require('mongoose');
const userAdminService = require('../src/services/userAdminService');
const User = require('../src/models/User');
const RoleChange = require('../src/models/RoleChange');

jest.mock('../src/models/User');
jest.mock('../src/models/RoleChange');

/**
 * Quản lý vai trò người dùng.
 *
 * Ba điều không được vỡ, vì vỡ một trong ba là một đường leo thang đặc quyền hoặc mất khả năng
 * quản trị: không tự đổi vai trò của mình, không hạ admin cuối cùng, mọi lần đổi đều ghi nhật ký.
 */
describe('Quản lý vai trò', () => {
  const actorId = new mongoose.Types.ObjectId();
  const targetId = new mongoose.Types.ObjectId().toString();
  const admin = { _id: actorId, role: 'admin' };

  const findTarget = (target) => {
    User.findById.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(target) }) });
  };
  const updateReturning = (user) => {
    User.findOneAndUpdate.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(user) }) });
  };

  beforeEach(() => {
    RoleChange.create.mockResolvedValue({});
  });
  afterEach(() => jest.clearAllMocks());

  describe('changeRole', () => {
    it('cấp vai trò operator cho người dùng thường và ghi nhật ký', async () => {
      findTarget({ role: 'user' });
      updateReturning({ _id: targetId, role: 'operator' });

      const result = await userAdminService.changeRole(targetId, admin, { role: 'operator' });

      expect(result.changed).toBe(true);
      expect(User.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: targetId, role: 'user' },
        { $set: { role: 'operator' } },
        expect.anything()
      );
      expect(RoleChange.create).toHaveBeenCalledWith({ target: targetId, actor: actorId, from: 'user', to: 'operator' });
    });

    it('không đổi vai trò của chính mình, kể cả khi đổi sang vai trò thấp hơn', async () => {
      await expect(
        userAdminService.changeRole(String(actorId), admin, { role: 'user' })
      ).rejects.toMatchObject({ statusCode: 403, errorCode: 'CANNOT_CHANGE_OWN_ROLE' });
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('không hạ admin cuối cùng', async () => {
      findTarget({ role: 'admin' });
      User.countDocuments.mockResolvedValue(1);

      await expect(userAdminService.changeRole(targetId, admin, { role: 'operator' })).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'LAST_ADMIN',
      });
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(RoleChange.create).not.toHaveBeenCalled();
    });

    it('hạ một admin khi còn admin khác thì được', async () => {
      findTarget({ role: 'admin' });
      User.countDocuments.mockResolvedValue(2);
      updateReturning({ _id: targetId, role: 'operator' });

      const result = await userAdminService.changeRole(targetId, admin, { role: 'operator' });

      expect(result.changed).toBe(true);
      expect(RoleChange.create).toHaveBeenCalledWith(expect.objectContaining({ from: 'admin', to: 'operator' }));
    });

    it('vai trò lạ bị từ chối trước khi chạm DB (không ghi được giá trị tuỳ ý vào role)', async () => {
      for (const role of ['superuser', { $ne: 'user' }, undefined, '']) {
        await expect(userAdminService.changeRole(targetId, admin, { role })).rejects.toMatchObject({ statusCode: 400 });
      }
      expect(User.findById).not.toHaveBeenCalled();
    });

    it('ID không hợp lệ: 400; người dùng không tồn tại: 404', async () => {
      await expect(userAdminService.changeRole('abc', admin, { role: 'user' })).rejects.toMatchObject({ statusCode: 400 });

      findTarget(null);
      await expect(userAdminService.changeRole(targetId, admin, { role: 'user' })).rejects.toMatchObject({ statusCode: 404 });
    });

    it('đặt lại đúng vai trò hiện có: không ghi, không có nhật ký', async () => {
      findTarget({ role: 'auditor' });

      const result = await userAdminService.changeRole(targetId, admin, { role: 'auditor' });

      expect(result.changed).toBe(false);
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
      expect(RoleChange.create).not.toHaveBeenCalled();
    });

    it('hai admin đổi cùng một người cùng lúc: lệnh thua trả 409, không ghi nhật ký', async () => {
      findTarget({ role: 'user' });
      updateReturning(null);

      await expect(userAdminService.changeRole(targetId, admin, { role: 'operator' })).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'ROLE_CONFLICT',
      });
      expect(RoleChange.create).not.toHaveBeenCalled();
    });
  });

  describe('listUsers', () => {
    const chain = () => ({
      select: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    it('thoát ký tự đặc biệt của regex trong từ khoá tìm kiếm', async () => {
      User.find.mockReturnValue(chain());
      User.countDocuments.mockResolvedValue(0);

      await userAdminService.listUsers({ q: '.*(a+)+$' });

      const filter = User.find.mock.calls[0][0];
      const regex = filter.$or[0].username;
      expect(regex.test('.*(a+)+$')).toBe(true);
      // Nếu không thoát, ".*" khớp mọi tên; thoát rồi thì tên bình thường không khớp.
      expect(regex.test('alice')).toBe(false);
    });

    it('lọc theo vai trò hợp lệ và từ chối vai trò lạ', async () => {
      User.find.mockReturnValue(chain());
      User.countDocuments.mockResolvedValue(0);

      await userAdminService.listUsers({ role: 'operator' });
      expect(User.find.mock.calls[0][0]).toEqual({ role: 'operator' });

      await expect(userAdminService.listUsers({ role: { $ne: 'user' } })).rejects.toMatchObject({ statusCode: 400 });
    });
  });
});
