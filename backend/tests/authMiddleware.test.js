const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const auth = require('../src/middleware/auth');
const { optionalAuth } = require('../src/middleware/auth');
const User = require('../src/models/User');

jest.mock('../src/models/User');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests_only_32chars';

/** Tạo đối tượng response giả để kiểm tra mã trạng thái và nội dung trả về */
const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Middleware xác thực JWT', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('auth (bắt buộc đăng nhập)', () => {
    it('nên trả về 401 khi thiếu header Authorization', async () => {
      const req = { headers: {} };
      const res = createMockRes();
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('nên trả về 401 khi header không theo định dạng Bearer', async () => {
      const req = { headers: { authorization: 'Basic dXNlcjpwYXNz' } };
      const res = createMockRes();
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('nên trả về 401 khi token bị ký bằng khóa bí mật khác', async () => {
      const tokenGia = jwt.sign({ id: new mongoose.Types.ObjectId().toString() }, 'khoa_gia_mao');
      const req = { headers: { authorization: `Bearer ${tokenGia}` } };
      const res = createMockRes();
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('nên trả về 401 khi token đã hết hạn', async () => {
      const tokenHetHan = jwt.sign(
        { id: new mongoose.Types.ObjectId().toString() },
        process.env.JWT_SECRET,
        { expiresIn: '-1s' }
      );
      const req = { headers: { authorization: `Bearer ${tokenHetHan}` } };
      const res = createMockRes();
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('nên trả về 401 khi người dùng trong token không còn tồn tại', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
      User.findById.mockResolvedValue(null);

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('nên gắn req.user và gọi next() khi token hợp lệ', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const mockUser = { _id: userId, username: 'nguoidung' };
      const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
      User.findById.mockResolvedValue(mockUser);

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      await auth(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth (đăng nhập không bắt buộc)', () => {
    it('nên cho đi tiếp mà không gắn req.user khi không có token', async () => {
      const req = { headers: {} };
      const res = createMockRes();
      const next = jest.fn();

      await optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('nên cho đi tiếp mà không gắn req.user khi token không hợp lệ', async () => {
      const req = { headers: { authorization: 'Bearer token_rac' } };
      const res = createMockRes();
      const next = jest.fn();

      await optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('nên gắn req.user khi token hợp lệ', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const mockUser = { _id: userId, username: 'nguoidung' };
      const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
      User.findById.mockResolvedValue(mockUser);

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      await optionalAuth(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });
  });
});
