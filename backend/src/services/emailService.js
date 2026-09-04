const nodemailer = require('nodemailer');
const { SUPPORTED, DEFAULT_LANGUAGE } = require('../config/i18n');

/**
 * Email Service — Gmail SMTP with App Password
 * Used for password reset emails.
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

/**
 * Send password reset email
 * @param {string} to - Recipient email
 * @param {string} resetUrl - Full URL with reset token
 * @param {string} [language] - 'vi' or 'en'; falls back to the default language
 */
const sendPasswordResetEmail = async (to, resetUrl, language = DEFAULT_LANGUAGE) => {
  const transporter = createTransporter();
  const copy = COPY[SUPPORTED.includes(language) ? language : DEFAULT_LANGUAGE];

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
          <a href="${resetUrl}"
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

module.exports = {
  sendPasswordResetEmail,
};
