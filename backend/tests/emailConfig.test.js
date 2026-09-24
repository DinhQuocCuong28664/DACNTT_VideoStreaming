const nodemailer = require('nodemailer');
const { isEmailConfigured, verifyEmailTransport } = require('../src/services/emailService');

jest.mock('nodemailer');

/**
 * Kiểm tra cấu hình email lúc khởi động.
 *
 * Mail đặt lại mật khẩu từng hỏng im lặng vì .env trên máy chủ còn chuỗi giữ
 * chỗ "REPLACE_ME_AFTER_BOOT": luồng quên mật khẩu cố ý không báo lỗi ra ngoài,
 * nên chỉ có log lúc khởi động mới làm lỗi này lộ ra.
 */
describe('isEmailConfigured', () => {
  it('nhận cấu hình đủ và thật', () => {
    expect(isEmailConfigured({ EMAIL_USER: 'a@gmail.com', EMAIL_APP_PASSWORD: 'abcdabcdabcdabcd' })).toBe(true);
  });

  it.each([
    [{}],
    [{ EMAIL_USER: 'a@gmail.com' }],
    [{ EMAIL_USER: 'REPLACE_ME_AFTER_BOOT', EMAIL_APP_PASSWORD: 'REPLACE_ME_AFTER_BOOT' }],
    [{ EMAIL_USER: 'a@gmail.com', EMAIL_APP_PASSWORD: 'REPLACE_ME_AFTER_BOOT' }],
    [{ EMAIL_USER: 'your_email@gmail.com', EMAIL_APP_PASSWORD: 'your_gmail_app_password' }],
  ])('coi %j là chưa cấu hình', (env) => {
    expect(isEmailConfigured(env)).toBe(false);
  });
});

describe('verifyEmailTransport', () => {
  const saved = { ...process.env };
  const logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

  afterEach(() => {
    process.env = { ...saved };
    jest.clearAllMocks();
  });

  it('cảnh báo và không gọi SMTP khi còn chuỗi giữ chỗ', async () => {
    process.env.EMAIL_USER = 'REPLACE_ME_AFTER_BOOT';
    process.env.EMAIL_APP_PASSWORD = 'REPLACE_ME_AFTER_BOOT';
    await expect(verifyEmailTransport(logger)).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalled();
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
  });

  it('báo lỗi nhưng không ném khi SMTP từ chối đăng nhập', async () => {
    process.env.EMAIL_USER = 'a@gmail.com';
    process.env.EMAIL_APP_PASSWORD = 'abcdabcdabcdabcd';
    nodemailer.createTransport.mockReturnValue({
      verify: jest.fn().mockRejectedValue(new Error('Invalid login: 535-5.7.8')),
    });
    await expect(verifyEmailTransport(logger)).resolves.toBe(false);
    expect(logger.error.mock.calls[0][0]).toMatch(/535/);
  });

  it('ghi nhận sẵn sàng khi SMTP chấp nhận', async () => {
    process.env.EMAIL_USER = 'a@gmail.com';
    process.env.EMAIL_APP_PASSWORD = 'abcdabcdabcdabcd';
    nodemailer.createTransport.mockReturnValue({ verify: jest.fn().mockResolvedValue(true) });
    await expect(verifyEmailTransport(logger)).resolves.toBe(true);
    expect(logger.log).toHaveBeenCalled();
  });
});
