/**
 * Giới hạn số thư gửi tới một địa chỉ nhận.
 *
 * Tính chất cần giữ:
 * - Đếm theo địa chỉ nhận đã chuẩn hoá, không theo IP hay tài khoản.
 * - Cửa sổ trượt: thư cũ hết hạn thì được gửi tiếp.
 * - Bộ nhớ có trần và không giữ địa chỉ email thô.
 * - Vượt giới hạn: đăng ký vẫn thành công, gửi lại trả 429 mà không cấp token mới,
 *   quên mật khẩu trả đúng câu chung và không cấp token mới.
 */
const authService = require('../src/services/authService');
const authController = require('../src/controllers/authController');
const emailService = require('../src/services/emailService');
const recipientMailThrottle = require('../src/utils/recipientMailThrottle');

jest.mock('../src/services/emailService');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests_only_32chars';

const { createRecipientMailThrottle } = recipientMailThrottle;

const HOUR = 60 * 60 * 1000;

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

describe('Giới hạn thư theo địa chỉ nhận', () => {
  describe('createRecipientMailThrottle', () => {
    it('cho gửi đủ giới hạn rồi từ chối', () => {
      const throttle = createRecipientMailThrottle({ limit: 3 });

      expect(throttle.allow('nan.nhan@example.com')).toBe(true);
      expect(throttle.allow('nan.nhan@example.com')).toBe(true);
      expect(throttle.allow('nan.nhan@example.com')).toBe(true);
      expect(throttle.allow('nan.nhan@example.com')).toBe(false);
    });

    it('coi hoa thường và khoảng trắng là cùng một địa chỉ', () => {
      const throttle = createRecipientMailThrottle({ limit: 2 });

      expect(throttle.allow('Nan.Nhan@Example.com')).toBe(true);
      expect(throttle.allow('  nan.nhan@example.com ')).toBe(true);
      expect(throttle.allow('NAN.NHAN@EXAMPLE.COM')).toBe(false);
    });

    it('đếm riêng từng địa chỉ', () => {
      const throttle = createRecipientMailThrottle({ limit: 1 });

      expect(throttle.allow('a@example.com')).toBe(true);
      expect(throttle.allow('a@example.com')).toBe(false);
      expect(throttle.allow('b@example.com')).toBe(true);
    });

    it('cho gửi lại khi các thư cũ đã ra khỏi cửa sổ một giờ', () => {
      let clock = 1_000_000;
      const throttle = createRecipientMailThrottle({ limit: 2, windowMs: HOUR, now: () => clock });

      expect(throttle.allow('a@example.com')).toBe(true);
      clock += 10 * 60 * 1000;
      expect(throttle.allow('a@example.com')).toBe(true);
      expect(throttle.allow('a@example.com')).toBe(false);

      // Thư đầu hết hạn sau 1 giờ, thư thứ hai thì chưa.
      clock += 51 * 60 * 1000;
      expect(throttle.allow('a@example.com')).toBe(true);
      expect(throttle.allow('a@example.com')).toBe(false);

      clock += 10 * 60 * 1000;
      expect(throttle.allow('a@example.com')).toBe(true);
    });

    it('không ghi nhận lần bị từ chối nên không kéo dài thời gian bị chặn', () => {
      let clock = 0;
      const throttle = createRecipientMailThrottle({ limit: 1, windowMs: HOUR, now: () => clock });

      expect(throttle.allow('a@example.com')).toBe(true);
      for (let i = 0; i < 50; i += 1) {
        clock += 60 * 1000;
        expect(throttle.allow('a@example.com')).toBe(false);
      }

      clock = HOUR + 1;
      expect(throttle.allow('a@example.com')).toBe(true);
    });

    it('chặn bộ nhớ ở số khoá tối đa, dọn khoá hết hạn trước', () => {
      let clock = 0;
      const throttle = createRecipientMailThrottle({ limit: 1, windowMs: HOUR, maxKeys: 3, now: () => clock });

      throttle.allow('1@example.com');
      throttle.allow('2@example.com');
      throttle.allow('3@example.com');
      expect(throttle.size()).toBe(3);

      // Cả ba hết hạn: một địa chỉ mới làm sạch bảng.
      clock = HOUR + 1;
      throttle.allow('4@example.com');
      expect(throttle.size()).toBe(1);

      // Còn hiệu lực cả ba mà bảng đầy: bỏ khoá cũ nhất, kích thước không vượt trần.
      throttle.allow('5@example.com');
      throttle.allow('6@example.com');
      throttle.allow('7@example.com');
      expect(throttle.size()).toBe(3);
    });

    it('khoá cũ nhất bị bỏ khi bảng đầy sẽ được tính lại từ đầu', () => {
      const throttle = createRecipientMailThrottle({ limit: 1, maxKeys: 2 });

      throttle.allow('1@example.com');
      throttle.allow('2@example.com');
      throttle.allow('3@example.com'); // đẩy 1@ ra khỏi bảng

      expect(throttle.allow('1@example.com')).toBe(true);
    });

    it('chỉ lộ ra allow và size, không có đường nào đọc lại địa chỉ đã gửi', () => {
      const throttle = createRecipientMailThrottle();
      throttle.allow('bi.mat@example.com');

      // Bảng chỉ lộ ra kích thước; khoá là băm nên không có đường nào đọc lại địa chỉ.
      expect(Object.keys(throttle).sort()).toEqual(['allow', 'size']);
    });

    it('chịu được đầu vào rỗng hoặc không phải chuỗi', () => {
      const throttle = createRecipientMailThrottle({ limit: 1 });

      expect(() => throttle.allow(undefined)).not.toThrow();
      expect(() => throttle.allow({ $ne: null })).not.toThrow();
      expect(() => throttle.allow(12345)).not.toThrow();
    });
  });

  describe('isActive', () => {
    it('tắt trong môi trường test và khi đặt MAIL_RECIPIENT_THROTTLE=false', () => {
      expect(recipientMailThrottle.isActive({ NODE_ENV: 'test' })).toBe(false);
      expect(recipientMailThrottle.isActive({ NODE_ENV: 'production', MAIL_RECIPIENT_THROTTLE: 'false' })).toBe(false);
    });

    it('bật ở production và development theo mặc định', () => {
      expect(recipientMailThrottle.isActive({ NODE_ENV: 'production' })).toBe(true);
      expect(recipientMailThrottle.isActive({ NODE_ENV: 'development' })).toBe(true);
      expect(recipientMailThrottle.isActive({})).toBe(true);
    });
  });

  describe('allowMail', () => {
    it('luôn cho qua khi đang tắt (môi trường test)', () => {
      for (let i = 0; i < 50; i += 1) {
        expect(recipientMailThrottle.allowMail('a@example.com')).toBe(true);
      }
    });
  });

  describe('trong authController khi vượt giới hạn', () => {
    afterEach(() => {
      jest.clearAllMocks();
      jest.restoreAllMocks();
    });

    describe('POST /api/auth/register', () => {
      it('vẫn tạo tài khoản, không gửi thư và báo verificationEmailSent=false', async () => {
        jest.spyOn(recipientMailThrottle, 'allowMail').mockReturnValue(false);
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(authService, 'register').mockResolvedValue({
          user: { _id: 'u1', email: 'nan.nhan@example.com' },
          token: 'jwt',
          verificationToken: 'c'.repeat(64),
        });

        const res = createMockRes();
        const next = jest.fn();
        await authController.registerUser(
          { body: { username: 'moi', email: 'nan.nhan@example.com', password: 'Mat-Khau-Tot-2026' }, headers: {} },
          res,
          next
        );

        expect(next).not.toHaveBeenCalled();
        expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json.mock.calls[0][0].data.verificationEmailSent).toBe(false);
        expect(recipientMailThrottle.allowMail).toHaveBeenCalledWith('nan.nhan@example.com');
      });

      it('không ghi địa chỉ nhận vào log', async () => {
        jest.spyOn(recipientMailThrottle, 'allowMail').mockReturnValue(false);
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(authService, 'register').mockResolvedValue({
          user: { _id: 'u1', email: 'nan.nhan@example.com' },
          token: 'jwt',
          verificationToken: 'c'.repeat(64),
        });

        await authController.registerUser(
          { body: { username: 'moi', email: 'nan.nhan@example.com', password: 'Mat-Khau-Tot-2026' }, headers: {} },
          createMockRes(),
          jest.fn()
        );

        expect(warn).toHaveBeenCalled();
        expect(warn.mock.calls.flat().join(' ')).not.toContain('nan.nhan@example.com');
      });
    });

    describe('POST /api/auth/resend-verification', () => {
      it('trả 429 RECIPIENT_RATE_LIMITED và không cấp token mới', async () => {
        jest.spyOn(recipientMailThrottle, 'allowMail').mockReturnValue(false);
        const prepare = jest.spyOn(authService, 'prepareVerificationEmail');

        const res = createMockRes();
        await authController.resendVerification(
          { user: { _id: 'u1', email: 'nan.nhan@example.com' }, headers: {} },
          res,
          jest.fn()
        );

        expect(res.status).toHaveBeenCalledWith(429);
        expect(res.json.mock.calls[0][0]).toMatchObject({ success: false, code: 'RECIPIENT_RATE_LIMITED' });
        expect(prepare).not.toHaveBeenCalled();
        expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
      });

      it('chỉ tiêu một lượt trong giới hạn cho mỗi thư gửi lại', async () => {
        const allow = jest.spyOn(recipientMailThrottle, 'allowMail').mockReturnValue(true);
        jest
          .spyOn(authService, 'prepareVerificationEmail')
          .mockResolvedValue({ user: { email: 'nan.nhan@example.com' }, verificationToken: 'd'.repeat(64) });
        emailService.sendVerificationEmail.mockResolvedValue(undefined);

        const res = createMockRes();
        await authController.resendVerification(
          { user: { _id: 'u1', email: 'nan.nhan@example.com' }, headers: {} },
          res,
          jest.fn()
        );

        expect(allow).toHaveBeenCalledTimes(1);
        expect(res.status).toHaveBeenCalledWith(200);
        expect(emailService.sendVerificationEmail).toHaveBeenCalledTimes(1);
      });
    });

    describe('POST /api/auth/forgot-password', () => {
      it('trả đúng câu chung như khi gửi được và không cấp token mới', async () => {
        const forgot = jest.spyOn(authService, 'forgotPassword');

        // Đối chứng: cùng địa chỉ khi còn trong giới hạn nhưng không có tài khoản.
        jest.spyOn(recipientMailThrottle, 'allowMail').mockReturnValue(true);
        forgot.mockResolvedValue(null);
        const normal = createMockRes();
        await authController.forgotPassword({ body: { email: 'nan.nhan@example.com' }, headers: {} }, normal, jest.fn());

        forgot.mockClear();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        recipientMailThrottle.allowMail.mockReturnValue(false);
        const throttled = createMockRes();
        await authController.forgotPassword(
          { body: { email: 'nan.nhan@example.com' }, headers: {} },
          throttled,
          jest.fn()
        );

        expect(forgot).not.toHaveBeenCalled();
        expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
        expect(throttled.status).toHaveBeenCalledWith(200);
        expect(throttled.json.mock.calls[0][0]).toEqual(normal.json.mock.calls[0][0]);
      });

      it('kiểm theo địa chỉ khách nhập, không phụ thuộc tài khoản có tồn tại', async () => {
        const allow = jest.spyOn(recipientMailThrottle, 'allowMail').mockReturnValue(true);
        jest.spyOn(authService, 'forgotPassword').mockResolvedValue(null);

        await authController.forgotPassword(
          { body: { email: 'khong.co.tai.khoan@example.com' }, headers: {} },
          createMockRes(),
          jest.fn()
        );

        expect(allow).toHaveBeenCalledWith('khong.co.tai.khoan@example.com');
      });
    });
  });
});
