const nodemailer = require('nodemailer');
const config = require('./config');

/**
 * Email Service — Gmail SMTP with App Password.
 *
 * Nhân bản có chủ đích từ backend/src/services/emailService.js: transcoder
 * và backend là hai container độc lập, không chia sẻ mã nguồn, nên mỗi bên
 * tự giữ một bản gọn nhẹ thay vì cố gắng import chéo qua ranh giới container.
 *
 * Dùng để báo cho người upload biết video đã sẵn sàng hoặc xử lý thất bại —
 * gửi trực tiếp từ transcoder vì đây là nơi duy nhất biết chính xác thời
 * điểm READY/ERROR xảy ra. Không dùng SNS topic "transcode-complete" (đã
 * dựng sẵn trong Terraform nhưng chưa nối dây) vì SNS email subscription là
 * tĩnh — cấu hình 1 địa chỉ cố định lúc `terraform apply`, không set được
 * theo từng người dùng lúc runtime.
 */

const createTransporter = () => {
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: false, // true for 465, false for other ports
    auth: {
      user: config.email.user,
      pass: config.email.appPassword,
    },
  });
};

const emailStyles = {
  wrapper: "font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;",
  heading: 'color: #1a1a2e;',
  hr: 'border: 1px solid #e0e0e0;',
  buttonSuccess:
    'background-color: #00b894; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;',
  muted: 'color: #666;',
  footer: 'color: #999; font-size: 12px;',
};

/**
 * Gửi email thông báo video đã chuyển mã thành công.
 * @param {string} to - Email người nhận
 * @param {{ title: string, videoId: string, displayName?: string }} video
 */
const sendVideoReadyEmail = async (to, { title, videoId, displayName }) => {
  const transporter = createTransporter();
  const watchUrl = `${config.frontendUrl}/watch/${videoId}`;
  // Email này gửi từ một AWS Batch job, không phải từ một request, nên không
  // có tiêu đề Accept-Language nào để suy ra ngôn ngữ người nhận và hồ sơ
  // người dùng cũng chưa lưu tuỳ chọn ngôn ngữ. Cách đúng đắn duy nhất khi
  // chưa biết là viết cả hai thứ tiếng; lưu tuỳ chọn ngôn ngữ trên tài khoản
  // là hướng sửa triệt để, được ghi lại trong phần Future Work của báo cáo.
  const greetingEn = displayName ? `Hello ${displayName},` : 'Hello,';
  const greeting = displayName ? `Xin chào ${displayName},` : 'Xin chào,';

  const mailOptions = {
    from: config.email.from,
    to,
    subject: '✅ Your video is ready · Video của bạn đã sẵn sàng — DACNTT Video Platform',
    html: `
      <div style="${emailStyles.wrapper}">
        <h2 style="${emailStyles.heading}">🎬 DACNTT Video Platform</h2>
        <hr style="${emailStyles.hr}" />
        <p>${greetingEn}</p>
        <p>Your video <strong>"${title}"</strong> has finished transcoding and is ready to watch.</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${watchUrl}" style="${emailStyles.buttonSuccess}">Watch it now</a>
        </div>
        <p style="${emailStyles.muted}">It is available at several quality levels, chosen automatically from the viewer's connection speed.</p>
        <hr style="${emailStyles.hr}" />
        <p>${greeting}</p>
        <p>Video <strong>"${title}"</strong> của bạn đã chuyển mã xong và sẵn sàng để xem.</p>
        <p style="${emailStyles.muted}">Video hiện hỗ trợ phát ở nhiều mức chất lượng, tự động điều chỉnh theo tốc độ mạng của người xem.</p>
        <hr style="${emailStyles.hr}" />
        <p style="${emailStyles.footer}">© 2026 DACNTT Video Platform — zelostech.site</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

/**
 * Gửi email thông báo video xử lý thất bại.
 *
 * Cố ý KHÔNG đưa nội dung lỗi FFmpeg thô (tham số errorMessage nội bộ) vào
 * email — thông điệp lỗi có thể chứa đường dẫn tệp hệ thống hoặc chi tiết
 * kỹ thuật không phù hợp hiển thị cho người dùng cuối. Lỗi chi tiết đã được
 * ghi vào CloudWatch Logs qua console.error ở dbHandler.updateVideoError.
 *
 * @param {string} to - Email người nhận
 * @param {{ title: string, displayName?: string }} video
 */
const sendVideoFailedEmail = async (to, { title, displayName }) => {
  const transporter = createTransporter();
  const greetingEn = displayName ? `Hello ${displayName},` : 'Hello,';
  const greeting = displayName ? `Xin chào ${displayName},` : 'Xin chào,';

  const mailOptions = {
    from: config.email.from,
    to,
    subject: '❌ Video processing failed · Video xử lý thất bại — DACNTT Video Platform',
    html: `
      <div style="${emailStyles.wrapper}">
        <h2 style="${emailStyles.heading}">🎬 DACNTT Video Platform</h2>
        <hr style="${emailStyles.hr}" />
        <p>${greetingEn}</p>
        <p>Unfortunately your video <strong>"${title}"</strong> hit an error during processing and could not be completed.</p>
        <p style="${emailStyles.muted}">Please check the file format (.mp4, .mov, .mkv and .webm are recommended) and try uploading again. If it keeps failing, contact support.</p>
        <hr style="${emailStyles.hr}" />
        <p>${greeting}</p>
        <p>Rất tiếc, video <strong>"${title}"</strong> của bạn đã gặp lỗi trong quá trình xử lý và không thể hoàn tất.</p>
        <p style="${emailStyles.muted}">Vui lòng kiểm tra lại định dạng tệp (khuyến nghị .mp4, .mov, .mkv, .webm) và thử tải lên lại. Nếu lỗi tiếp diễn, hãy liên hệ đội ngũ hỗ trợ.</p>
        <hr style="${emailStyles.hr}" />
        <p style="${emailStyles.footer}">© 2026 DACNTT Video Platform — zelostech.site</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

module.exports = {
  sendVideoReadyEmail,
  sendVideoFailedEmail,
};
