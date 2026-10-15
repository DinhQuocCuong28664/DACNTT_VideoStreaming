const nodemailer = require('nodemailer');
const { SUPPORTED, DEFAULT_LANGUAGE } = require('../config/i18n');

/**
 * Email Service — Gmail SMTP with App Password
 * Used for password reset and email verification emails.
 */

const createTransporter = () => {
  return nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_APP_PASSWORD,
    },
  });
};

/**
 * Nội dung email đặt lại mật khẩu theo từng ngôn ngữ.
 *
 * Email này gửi đi ngay trong một request nên biết được ngôn ngữ người dùng
 * đang dùng qua tiêu đề Accept-Language. Khác với email thông báo chuyển mã
 * của transcoder, vốn được gửi từ một job chạy sau và không có ngữ cảnh
 * request nào để suy ra ngôn ngữ.
 */
const COPY = {
  vi: {
    subject: '🔐 Đặt lại mật khẩu — DACNTT Video Platform',
    greeting: 'Xin chào,',
    intro:
      'Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản của mình. Nhấn vào nút bên dưới để tạo mật khẩu mới:',
    button: 'Đặt lại mật khẩu',
    expiry: 'Liên kết này sẽ hết hạn sau <strong>15 phút</strong>.',
    ignore: 'Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.',
  },
  en: {
    subject: '🔐 Reset your password — DACNTT Video Platform',
    greeting: 'Hello,',
    intro:
      'You asked to reset the password for your account. Use the button below to choose a new one:',
    button: 'Reset password',
    expiry: 'This link expires in <strong>15 minutes</strong>.',
    ignore: 'If you did not request a password reset, you can ignore this email.',
  },
};

/** Nội dung email xác minh địa chỉ sau khi đăng ký. */
const VERIFY_COPY = {
  vi: {
    subject: '✉️ Xác minh email — DACNTT Video Platform',
    greeting: 'Xin chào,',
    intro:
      'Cảm ơn bạn đã đăng ký. Nhấn vào nút bên dưới để xác nhận đây là email của bạn. Sau khi xác minh, bạn có thể tải video lên:',
    button: 'Xác minh email',
    expiry: 'Liên kết này sẽ hết hạn sau <strong>24 giờ</strong>.',
    ignore: 'Nếu bạn không tạo tài khoản nào, vui lòng bỏ qua email này.',
  },
  en: {
    subject: '✉️ Verify your email — DACNTT Video Platform',
    greeting: 'Hello,',
    intro:
      'Thanks for signing up. Use the button below to confirm this is your email address. Once it is verified you can upload videos:',
    button: 'Verify email',
    expiry: 'This link expires in <strong>24 hours</strong>.',
    ignore: 'If you did not create an account, you can ignore this email.',
  },
};

const pickCopy = (table, language) =>
  table[SUPPORTED.includes(language) ? language : DEFAULT_LANGUAGE];

/** Gửi một thư gồm lời chào, một nút hành động và dòng hạn dùng. */
const sendActionEmail = async (to, copy, actionUrl) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'DACNTT Video Platform <noreply@zelostech.site>',
    to,
    subject: copy.subject,
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a2e;">🎬 DACNTT Video Platform</h2>
        <hr style="border: 1px solid #e0e0e0;" />
        <p>${copy.greeting}</p>
        <p>${copy.intro}</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${actionUrl}"
             style="background-color: #6c5ce7; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
            ${copy.button}
          </a>
        </div>
        <p style="color: #666;">${copy.expiry}</p>
        <p style="color: #666;">${copy.ignore}</p>
        <hr style="border: 1px solid #e0e0e0;" />
        <p style="color: #999; font-size: 12px;">© 2026 DACNTT Video Platform — zelostech.site</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Send password reset email
 * @param {string} to - Recipient email
 * @param {string} resetUrl - Full URL with reset token
 * @param {string} [language] - 'vi' or 'en'; falls back to the default language
 */
const sendPasswordResetEmail = (to, resetUrl, language = DEFAULT_LANGUAGE) =>
  sendActionEmail(to, pickCopy(COPY, language), resetUrl);

/**
 * Send email verification email
 * @param {string} to - Recipient email
 * @param {string} verifyUrl - Full URL with verification token
 * @param {string} [language] - 'vi' or 'en'; falls back to the default language
 */
const sendVerificationEmail = (to, verifyUrl, language = DEFAULT_LANGUAGE) =>
  sendActionEmail(to, pickCopy(VERIFY_COPY, language), verifyUrl);

/**
 * Cấu hình email có dùng được không, xét trước khi chạm tới mạng: thiếu biến,
 * hoặc còn chuỗi giữ chỗ kiểu "REPLACE_ME_AFTER_BOOT" mà script dựng máy cũ
 * từng để lại.
 */
const PLACEHOLDER = /REPLACE_ME|^your_/i;

const isEmailConfigured = (env = process.env) =>
  [env.EMAIL_USER, env.EMAIL_APP_PASSWORD].every((v) => Boolean(v) && !PLACEHOLDER.test(v));

/**
 * Kiểm tra SMTP một lần lúc máy chủ khởi động và ghi kết quả ra log.
 *
 * Luồng quên mật khẩu cố ý trả cùng một câu trả lời dù gửi mail được hay không
 * (để không lộ email nào có tài khoản), nên cấu hình sai không bao giờ hiện ra
 * phía người dùng. Ngày 2026-09-24 mail đặt lại mật khẩu đã hỏng như vậy suốt
 * từ lần dựng lại máy chủ, chỉ vì .env còn chuỗi giữ chỗ. Dòng log này biến lỗi
 * đó thành thứ thấy ngay trong `pm2 logs` sau mỗi lần deploy. Không bao giờ ném
 * lỗi: thiếu email không được làm sập API.
 */
const verifyEmailTransport = async (logger = console) => {
  if (!isEmailConfigured()) {
    logger.warn('⚠️  Email is not configured (EMAIL_USER / EMAIL_APP_PASSWORD missing or placeholder): password reset and verification emails will not be delivered');
    return false;
  }
  try {
    await createTransporter().verify();
    logger.log(`✉️  SMTP ready as ${process.env.EMAIL_USER}`);
    return true;
  } catch (err) {
    logger.error(`❌ SMTP check failed: ${err.message} — password reset and verification emails will not be delivered`);
    return false;
  }
};

module.exports = {
  sendPasswordResetEmail,
  sendVerificationEmail,
  isEmailConfigured,
  verifyEmailTransport,
};
