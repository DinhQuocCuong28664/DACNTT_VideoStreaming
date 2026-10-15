/**
 * Xác minh email khi đăng ký: token, endpoint xác minh và gửi lại thư.
 *
 * Tính chất cần giữ:
 * - Cơ sở dữ liệu chỉ có bản băm của token; bản thô chỉ đi trong thư.
 * - Một liên kết chỉ dùng được một lần và có hạn.
 * - Thư gửi hỏng không làm hỏng việc đăng ký.
 */
const crypto = require('crypto');
const authService = require('../src/services/authService');
const authController = require('../src/controllers/authController');
const emailService = require('../src/services/emailService');
const User = require('../src/models/User');

jest.mock('../src/models/User');
jest.mock('../src/services/emailService');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests_only_32chars';

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Xác minh email', () => {
  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('authService.register', () => {
    it('tạo tài khoản CHƯA xác minh, chỉ lưu bản băm của token và trả bản thô', async () => {
      User.findOne.mockResolvedValue(null);
      User.create.mockImplementation(async (doc) => ({ _id: 'u1', ...doc }));

      const before = Date.now();
      const result = await authService.register('nguoidung', 'moi@example.com', 'matkhau123');

      const created = User.create.mock.calls[0][0];
      expect(created.emailVerified).toBe(false);
      expect(result.verificationToken).toMatch(/^[a-f0-9]{64}$/);
      expect(created.emailVerificationToken).toBe(sha256(result.verificationToken));
      expect(created.emailVerificationToken).not.toBe(result.verificationToken);

      const ttl = created.emailVerificationExpire.getTime() - before;
      expect(ttl).toBeGreaterThan(authService.EMAIL_VERIFICATION_TTL_MS - 5000);
      expect(ttl).toBeLessThanOrEqual(authService.EMAIL_VERIFICATION_TTL_MS + 5000);
    });
  });

  describe('authService.verifyEmail', () => {
    it('từ chối token sai định dạng mà không chạm tới cơ sở dữ liệu', async () => {
      await expect(authService.verifyEmail('khong-phai-token')).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'VERIFY_LINK_INVALID',
        messageKey: 'auth.verifyLinkInvalid',
      });
      expect(User.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('tra cứu bằng bản băm, còn hạn, và tiêu token trong cùng một lần cập nhật', async () => {
      const raw = 'a'.repeat(64);
      User.findOneAndUpdate.mockResolvedValue({ _id: 'u1', emailVerified: true });

      await authService.verifyEmail(raw);

      const [filter, update, options] = User.findOneAndUpdate.mock.calls[0];
      expect(filter.emailVerificationToken).toBe(sha256(raw));
      expect(filter.emailVerificationExpire.$gt).toBeInstanceOf(Date);
      expect(update.$set).toEqual({ emailVerified: true });
      expect(update.$unset).toEqual({ emailVerificationToken: 1, emailVerificationExpire: 1 });
      expect(options).toEqual({ returnDocument: 'after' });
    });

    it('báo 400 khi token không khớp, đã dùng hoặc đã hết hạn', async () => {
      User.findOneAndUpdate.mockResolvedValue(null);

      await expect(authService.verifyEmail('b'.repeat(64))).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'VERIFY_LINK_INVALID',
      });
    });
  });

  describe('authService.prepareVerificationEmail', () => {
    it('từ chối khi email đã được xác minh', async () => {
      User.findById.mockResolvedValue({ hasVerifiedEmail: () => true, save: jest.fn() });

      await expect(authService.prepareVerificationEmail('u1')).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'ALREADY_VERIFIED',
      });
    });

    it('thay token cũ bằng token mới rồi lưu', async () => {
      const user = { hasVerifiedEmail: () => false, set: jest.fn(), save: jest.fn().mockResolvedValue(undefined) };
      User.findById.mockResolvedValue(user);

      const { verificationToken } = await authService.prepareVerificationEmail('u1');

      const fields = user.set.mock.calls[0][0];
      expect(fields.emailVerificationToken).toBe(sha256(verificationToken));
      expect(fields.emailVerificationExpire).toBeInstanceOf(Date);
      expect(user.save).toHaveBeenCalled();
    });
  });

  describe('POST /api/auth/register', () => {
    const registerResult = {
      user: { _id: 'u1', email: 'moi@example.com' },
      token: 'jwt',
      verificationToken: 'c'.repeat(64),
    };

    it('gửi thư có liên kết tới trang xác minh của frontend', async () => {
      jest.spyOn(authService, 'register').mockResolvedValue(registerResult);
      emailService.sendVerificationEmail.mockResolvedValue(undefined);
      process.env.FRONTEND_URL = 'https://zelostech.site';

      const res = createMockRes();
      await authController.registerUser(
        { body: { username: 'moi', email: 'moi@example.com', password: 'matkhau123' }, headers: {} },
        res,
        jest.fn()
      );

      const [to, url] = emailService.sendVerificationEmail.mock.calls[0];
      expect(to).toBe('moi@example.com');
      expect(url).toBe(`https://zelostech.site/verify-email/${'c'.repeat(64)}`);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0].data.verificationEmailSent).toBe(true);
    });

    it('vẫn đăng ký thành công khi gửi thư hỏng, và báo cho giao diện biết', async () => {
      jest.spyOn(authService, 'register').mockResolvedValue(registerResult);
      emailService.sendVerificationEmail.mockRejectedValue(new Error('SMTP timeout'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = createMockRes();
      const next = jest.fn();
      await authController.registerUser(
        { body: { username: 'moi', email: 'moi@example.com', password: 'matkhau123' }, headers: {} },
        res,
        next
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json.mock.calls[0][0].data.verificationEmailSent).toBe(false);
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    it('báo 503 kèm mã EMAIL_SEND_FAILED khi gửi thư hỏng', async () => {
      jest
        .spyOn(authService, 'prepareVerificationEmail')
        .mockResolvedValue({ user: { email: 'a@example.com' }, verificationToken: 'd'.repeat(64) });
      emailService.sendVerificationEmail.mockRejectedValue(new Error('SMTP timeout'));
      jest.spyOn(console, 'error').mockImplementation(() => {});

      const res = createMockRes();
      await authController.resendVerification({ user: { _id: 'u1' }, headers: {} }, res, jest.fn());

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json.mock.calls[0][0].code).toBe('EMAIL_SEND_FAILED');
    });

    it('trả 200 và nêu địa chỉ đã gửi khi thành công', async () => {
      jest
        .spyOn(authService, 'prepareVerificationEmail')
        .mockResolvedValue({ user: { email: 'a@example.com' }, verificationToken: 'd'.repeat(64) });
      emailService.sendVerificationEmail.mockResolvedValue(undefined);

      const res = createMockRes();
      await authController.resendVerification(
        { user: { _id: 'u1' }, headers: { 'accept-language': 'en' } },
        res,
        jest.fn()
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json.mock.calls[0][0].message).toContain('a@example.com');
    });
  });
});
