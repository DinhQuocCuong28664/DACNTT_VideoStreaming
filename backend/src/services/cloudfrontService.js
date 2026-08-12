const { getSignedCookies } = require('@aws-sdk/cloudfront-signer');

/**
 * Dịch vụ cấp CloudFront Signed Cookie cho việc phát video.
 *
 * Vì sao cần lớp này: Origin Access Control (OAC) chỉ ngăn người dùng truy cập
 * trực tiếp vào Amazon S3, nhưng không kiểm soát được ai có quyền xem nội dung
 * qua CloudFront. Nếu không có cơ chế ký, bất kỳ ai biết đường dẫn `.m3u8` đều
 * tải được video, kể cả video đã đặt ở chế độ riêng tư. Signed Cookie khắc phục
 * điều đó bằng cách buộc CloudFront chỉ phục vụ nội dung cho yêu cầu mang chữ ký
 * hợp lệ do máy chủ cấp sau khi đã kiểm tra quyền.
 *
 * Vì sao dùng Signed Cookie thay vì Signed URL: một phiên phát HLS gồm tệp
 * manifest và hàng trăm segment `.ts` riêng lẻ. Với Signed URL, mỗi tệp phải
 * được ký riêng và địa chỉ trong manifest cũng phải viết lại. Signed Cookie chỉ
 * cần cấp một lần cho toàn bộ thư mục video, trình duyệt tự đính kèm vào mọi
 * yêu cầu segment tiếp theo.
 */

/** Thời hạn hiệu lực của cookie: 2 giờ, đủ dài cho một phiên xem thông thường */
const COOKIE_TTL_SECONDS = 2 * 60 * 60;

/** Tên ba cookie theo đúng đặc tả của CloudFront */
const COOKIE_NAMES = {
  policy: 'CloudFront-Policy',
  signature: 'CloudFront-Signature',
  keyPairId: 'CloudFront-Key-Pair-Id',
};

/**
 * Cho biết hệ thống đã cấu hình đầy đủ để ký cookie hay chưa.
 * Khi chưa cấu hình, ứng dụng vẫn chạy bình thường với CDN công khai —
 * điều này giữ cho môi trường phát triển cục bộ không bị chặn.
 */
const isSigningEnabled = () =>
  Boolean(
    process.env.CLOUDFRONT_KEY_PAIR_ID &&
      process.env.CLOUDFRONT_PRIVATE_KEY &&
      process.env.CLOUDFRONT_DOMAIN
  );

/**
 * Chuẩn hóa khóa bí mật đọc từ biến môi trường.
 * Khi lưu trong Secrets Manager hoặc tệp .env, ký tự xuống dòng thường bị mã hóa
 * thành chuỗi "\n" hai ký tự; PEM bắt buộc phải có xuống dòng thật.
 */
const normalizePrivateKey = (rawKey) => rawKey.replace(/\\n/g, '\n');

/**
 * Xây dựng mẫu tài nguyên (resource pattern) mà cookie có hiệu lực.
 *
 * Ký theo ký tự đại diện ở cấp thư mục video giúp một bộ cookie phủ toàn bộ
 * manifest và segment của video đó, đồng thời không cấp quyền sang video khác.
 */
const buildResourcePattern = (videoId) => {
  const domain = process.env.CLOUDFRONT_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return `https://${domain}/videos/*/${videoId}/*`;
};

/**
 * Sinh bộ Signed Cookie cho một video cụ thể.
 *
 * @param {string} videoId - ID video được phép phát
 * @returns {{cookies: object, expiresAt: Date, resource: string}}
 */
const generatePlaybackCookies = (videoId) => {
  if (!isSigningEnabled()) {
    const error = new Error('CloudFront signing chưa được cấu hình trên máy chủ');
    error.statusCode = 503;
    throw error;
  }

  const resource = buildResourcePattern(videoId);
  const expiresAt = new Date(Date.now() + COOKIE_TTL_SECONDS * 1000);

  /**
   * Bắt buộc dùng Custom Policy thay vì Canned Policy.
   *
   * Canned Policy (chỉ truyền `dateLessThan`) không chấp nhận ký tự đại diện
   * trong đường dẫn tài nguyên, trong khi một phiên phát HLS cần phủ toàn bộ
   * manifest và hàng trăm segment nằm trong cùng thư mục video. Custom Policy
   * cho phép khai báo `Resource` dạng wildcard, đồng thời sinh ra cookie
   * `CloudFront-Policy` — thứ mà CloudFront dùng để đối chiếu phạm vi truy cập.
   */
  const policy = JSON.stringify({
    Statement: [
      {
        Resource: resource,
        Condition: {
          DateLessThan: {
            'AWS:EpochTime': Math.floor(expiresAt.getTime() / 1000),
          },
        },
      },
    ],
  });

  const signed = getSignedCookies({
    keyPairId: process.env.CLOUDFRONT_KEY_PAIR_ID,
    privateKey: normalizePrivateKey(process.env.CLOUDFRONT_PRIVATE_KEY),
    policy,
  });

  return { cookies: signed, expiresAt, resource };
};

/**
 * Gắn bộ Signed Cookie vào phản hồi HTTP.
 *
 * Thuộc tính `domain` được đặt ở tên miền cha (ví dụ `.zelostech.site`) để cookie
 * sinh ra từ API cũng được trình duyệt gửi kèm khi tải segment từ CDN. Cờ
 * `httpOnly` ngăn mã JavaScript đọc được chữ ký, còn `secure` bảo đảm cookie chỉ
 * truyền trên kết nối HTTPS.
 */
const attachPlaybackCookies = (res, videoId) => {
  const { cookies, expiresAt, resource } = generatePlaybackCookies(videoId);

  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: expiresAt,
    path: '/',
  };

  if (process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
  }

  res.cookie(COOKIE_NAMES.policy, cookies['CloudFront-Policy'], options);
  res.cookie(COOKIE_NAMES.signature, cookies['CloudFront-Signature'], options);
  res.cookie(COOKIE_NAMES.keyPairId, cookies['CloudFront-Key-Pair-Id'], options);

  return { expiresAt, resource };
};

module.exports = {
  isSigningEnabled,
  generatePlaybackCookies,
  attachPlaybackCookies,
  buildResourcePattern,
  COOKIE_TTL_SECONDS,
  COOKIE_NAMES,
};
