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

    it('nên từ chối token được cấp TRƯỚC lần đổi mật khẩu gần nhất', async () => {
      const userId = new mongoose.Types.ObjectId().toString();

      // Token cấp cách đây một giờ, mật khẩu vừa đổi cách đây một phút:
      // đây đúng là tình huống tài khoản bị chiếm rồi chủ tài khoản đổi
      // mật khẩu để đuổi kẻ tấn công ra.
      const motGioTruoc = Math.floor(Date.now() / 1000) - 3600;
      const token = jwt.sign({ id: userId, iat: motGioTruoc }, process.env.JWT_SECRET);

      User.findById.mockResolvedValue({
        _id: userId,
        username: 'nguoidung',
        passwordChangedAt: new Date(Date.now() - 60 * 1000),
      });

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      await auth(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('nên chấp nhận token được cấp SAU lần đổi mật khẩu gần nhất', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      const mockUser = {
        _id: userId,
        username: 'nguoidung',
        passwordChangedAt: new Date(Date.now() - 3600 * 1000),
      };
      // Token cấp ngay bây giờ — tức là cấp sau khi đổi mật khẩu
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

    it('nên chấp nhận token khi tài khoản chưa từng đổi mật khẩu', async () => {
      const userId = new mongoose.Types.ObjectId().toString();
      // Không có passwordChangedAt — tài khoản cũ, tạo trước khi có trường này
      const mockUser = { _id: userId, username: 'nguoidung' };
      const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
      User.findById.mockResolvedValue(mockUser);

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      await auth(req, res, next);

      expect(req.user).toEqual(mockUser);
      expect(next).toHaveBeenCalled();
    });

    it('nên chấp nhận token cấp ngay sát thời điểm đổi mật khẩu', async () => {
      // Chống hồi quy cho sai lệch đơn vị giây/mili giây: `iat` của JWT tính
      // bằng giây và bị làm tròn xuống, nên nếu pre-save hook không trừ bù
      // thì token vừa cấp cho chính người dùng vừa đổi mật khẩu sẽ bị coi là
      // cũ và họ bị đăng xuất ngay lập tức.
      const userId = new mongoose.Types.ObjectId().toString();
      const mockUser = {
        _id: userId,
        username: 'nguoidung',
        // Đúng như pre-save hook trong User model đặt: lùi lại 1 giây
        passwordChangedAt: new Date(Date.now() - 1000),
      };
      const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);
      User.findById.mockResolvedValue(mockUser);

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      await auth(req, res, next);

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

    it('nên đi tiếp mà KHÔNG gắn req.user khi token cấp trước lần đổi mật khẩu', async () => {
      // Nếu thiếu kiểm tra này, token đã bị truất quyền vẫn được coi là đã
      // đăng nhập trên các route dùng optionalAuth — chẳng hạn xem video
      // riêng tư — khiến việc đổi mật khẩu chỉ có tác dụng một nửa.
      const userId = new mongoose.Types.ObjectId().toString();
      const motGioTruoc = Math.floor(Date.now() / 1000) - 3600;
      const token = jwt.sign({ id: userId, iat: motGioTruoc }, process.env.JWT_SECRET);

      User.findById.mockResolvedValue({
        _id: userId,
        username: 'nguoidung',
        passwordChangedAt: new Date(Date.now() - 60 * 1000),
      });

      const req = { headers: { authorization: `Bearer ${token}` } };
      const res = createMockRes();
      const next = jest.fn();

      await optionalAuth(req, res, next);

      expect(req.user).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
