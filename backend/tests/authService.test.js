const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const authService = require('../src/services/authService');
const User = require('../src/models/User');

jest.mock('../src/models/User');

// JWT_SECRET phải được thiết lập trước khi sinh token trong các test bên dưới
process.env.JWT_SECRET = 'test_secret_key_for_unit_tests_only_32chars';

describe('authService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    it('nên sinh JWT chứa đúng id người dùng trong payload', () => {
      const userId = new mongoose.Types.ObjectId().toString();

      const token = authService.generateToken(userId);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      expect(decoded.id).toBe(userId);
    });

    it('nên gắn thời hạn hết hạn vào token', () => {
      const userId = new mongoose.Types.ObjectId().toString();

      const token = authService.generateToken(userId);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });

    it('nên tạo token không hợp lệ khi xác thực bằng khóa bí mật khác', () => {
      const token = authService.generateToken(new mongoose.Types.ObjectId().toString());

      expect(() => jwt.verify(token, 'khoa_bi_mat_hoan_toan_khac')).toThrow();
    });
  });

  describe('register', () => {
    it('nên từ chối khi email đã tồn tại và trả về mã lỗi 409', async () => {
      User.findOne.mockResolvedValue({ email: 'trung@example.com', username: 'khac' });

      await expect(
        authService.register('nguoidung', 'trung@example.com', 'matkhau123')
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Email already exists',
      });

      expect(User.create).not.toHaveBeenCalled();
    });

    it('nên từ chối khi username đã tồn tại và nêu đúng trường bị trùng', async () => {
      User.findOne.mockResolvedValue({ email: 'khac@example.com', username: 'nguoidung' });

      await expect(
        authService.register('nguoidung', 'moi@example.com', 'matkhau123')
      ).rejects.toMatchObject({
        statusCode: 409,
        message: 'Username already exists',
      });
    });

    it('nên tạo người dùng mới và trả về token khi thông tin hợp lệ', async () => {
      const newUserId = new mongoose.Types.ObjectId();

      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue({ _id: newUserId, username: 'nguoidung' });

      const result = await authService.register('nguoidung', 'moi@example.com', 'matkhau123');

      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'nguoidung',
          email: 'moi@example.com',
          displayName: 'nguoidung',
        })
      );

      const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(newUserId.toString());
    });

    it('không được truyền mật khẩu đã băm sẵn — việc băm do pre-save hook đảm nhiệm', async () => {
      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      await authService.register('nguoidung', 'moi@example.com', 'matkhauGoc');

      expect(User.create).toHaveBeenCalledWith(
        expect.objectContaining({ password: 'matkhauGoc' })
      );
    });
  });

  describe('login', () => {
    it('nên báo lỗi 401 khi không tìm thấy email', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

      await expect(authService.login('khongton@example.com', 'matkhau')).rejects.toMatchObject({
        statusCode: 401,
        message: 'Invalid email or password',
      });
    });

    it('nên báo lỗi 401 khi mật khẩu không khớp', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        matchPassword: jest.fn().mockResolvedValue(false),
      };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await expect(authService.login('user@example.com', 'saimatkhau')).rejects.toMatchObject({
        statusCode: 401,
      });

      expect(mockUser.matchPassword).toHaveBeenCalledWith('saimatkhau');
    });

    it('nên trả về cùng một thông báo lỗi cho email sai và mật khẩu sai (chống dò tài khoản)', async () => {
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });
      const loiEmailSai = await authService.login('a@example.com', 'x').catch((e) => e.message);

      User.findOne.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          _id: new mongoose.Types.ObjectId(),
          matchPassword: jest.fn().mockResolvedValue(false),
        }),
      });
      const loiMatKhauSai = await authService.login('a@example.com', 'x').catch((e) => e.message);

      expect(loiEmailSai).toBe(loiMatKhauSai);
    });

    it('nên đăng nhập thành công và trả về token hợp lệ', async () => {
      const userId = new mongoose.Types.ObjectId();
      const mockUser = {
        _id: userId,
        matchPassword: jest.fn().mockResolvedValue(true),
      };
      User.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      const result = await authService.login('user@example.com', 'dungmatkhau');

      const decoded = jwt.verify(result.token, process.env.JWT_SECRET);
      expect(decoded.id).toBe(userId.toString());
    });

    it('nên lấy mật khẩu bằng select("+password") vì trường này bị ẩn mặc định', async () => {
      const selectMock = jest.fn().mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        matchPassword: jest.fn().mockResolvedValue(true),
      });
      User.findOne.mockReturnValue({ select: selectMock });

      await authService.login('user@example.com', 'matkhau');

      expect(selectMock).toHaveBeenCalledWith('+password');
    });
  });

  describe('resetPassword', () => {
    it('nên từ chối token không hợp lệ hoặc đã hết hạn với mã lỗi 400', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(authService.resetPassword('token_khong_hop_le', 'matkhaumoi')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid or expired reset token',
      });
    });

    it('nên tra cứu bằng token đã băm chứ không phải token thô', async () => {
      User.findOne.mockResolvedValue(null);

      await authService.resetPassword('token_tho', 'matkhaumoi').catch(() => {});

      const filter = User.findOne.mock.calls[0][0];
      expect(filter.resetPasswordToken).not.toBe('token_tho');
      expect(filter.resetPasswordToken).toMatch(/^[a-f0-9]{64}$/);
      expect(filter.resetPasswordExpire).toHaveProperty('$gt');
    });

    it('nên xóa token đặt lại mật khẩu sau khi đổi thành công', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        save: jest.fn().mockResolvedValue(true),
      };
      User.findOne.mockResolvedValue(mockUser);

      await authService.resetPassword('token_hop_le', 'matkhaumoi');

      expect(mockUser.password).toBe('matkhaumoi');
      expect(mockUser.resetPasswordToken).toBeUndefined();
      expect(mockUser.resetPasswordExpire).toBeUndefined();
      expect(mockUser.save).toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('nên báo lỗi 401 khi mật khẩu hiện tại không đúng', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        matchPassword: jest.fn().mockResolvedValue(false),
        save: jest.fn(),
      };
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await expect(
        authService.changePassword(mockUser._id, 'sai', 'matkhaumoi')
      ).rejects.toMatchObject({ statusCode: 401 });

      expect(mockUser.save).not.toHaveBeenCalled();
    });

    it('nên đổi mật khẩu khi mật khẩu hiện tại đúng', async () => {
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        matchPassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true),
      };
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(mockUser) });

      await authService.changePassword(mockUser._id, 'dung', 'matkhaumoi');

      expect(mockUser.password).toBe('matkhaumoi');
      expect(mockUser.save).toHaveBeenCalled();
    });
  });
});
