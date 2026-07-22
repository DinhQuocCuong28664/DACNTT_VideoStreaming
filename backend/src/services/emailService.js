const nodemailer = require('nodemailer');

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
 * Send password reset email
 * @param {string} to - Recipient email
 * @param {string} resetUrl - Full URL with reset token
 */
const sendPasswordResetEmail = async (to, resetUrl) => {
  const transporter = createTransporter();

  const mailOptions = {
    from: process.env.EMAIL_FROM || 'DACNTT Video Platform <noreply@zelostech.site>',
    to,
    subject: '🔐 Đặt lại mật khẩu — DACNTT Video Platform',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1a1a2e;">🎬 DACNTT Video Platform</h2>
        <hr style="border: 1px solid #e0e0e0;" />
        <p>Xin chào,</p>
        <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản của mình. Nhấn vào nút bên dưới để tạo mật khẩu mới:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetUrl}" 
             style="background-color: #6c5ce7; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
            Đặt lại mật khẩu
          </a>
        </div>
        <p style="color: #666;">Liên kết này sẽ hết hạn sau <strong>15 phút</strong>.</p>
        <p style="color: #666;">Nếu bạn không yêu cầu đặt lại mật khẩu, vui lòng bỏ qua email này.</p>
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
