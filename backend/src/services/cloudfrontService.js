const { getSignedCookies } = require('@aws-sdk/cloudfront-signer');
const { translate, DEFAULT_LANGUAGE } = require('../config/i18n');

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
  // Transcoder ghi HLS output thẳng dưới videos/{videoId}/... (xem s3Prefix
  // trong transcoder/src/index.js) — không có thư mục trung gian nào giữa
  // "videos" và videoId, nên KHÔNG được thêm dấu * ở vị trí đó.
  return `https://${domain}/videos/${videoId}/*`;
};

/**
 * Sinh bộ Signed Cookie cho một video cụ thể.
 *
 * @param {string} videoId - ID video được phép phát
 * @returns {{cookies: object, expiresAt: Date, resource: string}}
 */
const generatePlaybackCookies = (videoId) => {
  if (!isSigningEnabled()) {
    const error = new Error(translate(DEFAULT_LANGUAGE, 'cloudfront.notConfigured'));
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
 * Cookie chỉ mục: danh sách video đã được cấp bộ cookie trong trình duyệt này.
 *
 * Mỗi video có bộ cookie riêng ở Path=/videos/{id}/ (xem attachPlaybackCookies),
 * nên lúc đăng xuất máy chủ phải biết những đường dẫn nào để xoá — cookie
 * httpOnly thì trình duyệt không tự xoá được, và máy chủ không đọc được cookie
 * đặt cho đường dẫn khác. Cookie chỉ mục nằm ở /api trên chính tên miền API nên
 * đi kèm cả request cấp cookie lẫn request đăng xuất.
 */
const PLAYBACK_INDEX_COOKIE = 'vidshare-playback-videos';

/** Số video tối đa được theo dõi; video cũ hơn bị thu hồi cookie ngay. */
const MAX_TRACKED_VIDEOS = 20;

/** Chỉ chấp nhận ObjectId dạng hex — giá trị cookie đến từ trình duyệt. */
const VIDEO_ID_PATTERN = /^[0-9a-f]{24}$/;

const videoCookiePath = (videoId) => `/videos/${videoId}/`;

/**
 * Thuộc tính chung của cookie phát video. Lúc đặt và lúc xoá phải dùng đúng
 * cùng domain/path/sameSite/secure, nếu không trình duyệt coi lệnh xoá là cho
 * một cookie khác và cookie cũ vẫn còn nguyên.
 */
const playbackCookieOptions = (path) => {
  const options = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path,
  };

  if (process.env.COOKIE_DOMAIN) {
    options.domain = process.env.COOKIE_DOMAIN;
  }

  return options;
};

const indexCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api',
});

const clearCookieSet = (res, path) => {
  const options = playbackCookieOptions(path);
  res.clearCookie(COOKIE_NAMES.policy, options);
  res.clearCookie(COOKIE_NAMES.signature, options);
  res.clearCookie(COOKIE_NAMES.keyPairId, options);
};

const readIssuedVideoIds = (req) => {
  const raw = (req && req.cookies && req.cookies[PLAYBACK_INDEX_COOKIE]) || '';
  return String(raw)
    .split(',')
    .filter((id) => VIDEO_ID_PATTERN.test(id));
};

/**
 * Gắn bộ Signed Cookie vào phản hồi HTTP.
 *
 * Thuộc tính `domain` được đặt ở tên miền cha (ví dụ `.zelostech.site`) để cookie
 * sinh ra từ API cũng được trình duyệt gửi kèm khi tải segment từ CDN. Cờ
 * `httpOnly` ngăn mã JavaScript đọc được chữ ký, còn `secure` bảo đảm cookie chỉ
 * truyền trên kết nối HTTPS.
 *
 * Mỗi video một bộ cookie ở Path=/videos/{id}/. Trước đây cả ba cookie nằm ở
 * Path=/ với cùng một tên cho mọi video, nên mở video thứ hai (tab khác) là ghi
 * đè bộ cookie của video thứ nhất: tab kia bắt đầu nhận 403, trình phát xin lại
 * cookie, và hai tab giành nhau ở từng segment. CloudFront chỉ cho một statement
 * với một Resource trong mỗi custom policy, nên không thể ký gộp nhiều video vào
 * một bộ; tài liệu của nó dùng thuộc tính Path cho đúng trường hợp này. Trình
 * duyệt chỉ gửi bộ cookie khớp đường dẫn của request, nên các bộ cùng tồn tại.
 *
 * @param {object} req - để đọc cookie chỉ mục hiện có
 * @param {object} res
 * @param {string} videoId - ID dạng hex thường, đúng như thư mục trên S3
 */
const attachPlaybackCookies = (req, res, videoId) => {
  const { cookies, expiresAt, resource } = generatePlaybackCookies(videoId);

  const options = { ...playbackCookieOptions(videoCookiePath(videoId)), expires: expiresAt };
  res.cookie(COOKIE_NAMES.policy, cookies['CloudFront-Policy'], options);
  res.cookie(COOKIE_NAMES.signature, cookies['CloudFront-Signature'], options);
  res.cookie(COOKIE_NAMES.keyPairId, cookies['CloudFront-Key-Pair-Id'], options);

  // Bộ cookie kiểu cũ ở Path=/ (trước khi tách theo video) có thể còn trong
  // trình duyệt tới hai giờ sau lần deploy; để nó lại thì request tới CDN mang
  // hai bộ trùng tên. Xoá đi là vô hại khi nó không tồn tại.
  clearCookieSet(res, '/');

  const tracked = [...readIssuedVideoIds(req).filter((id) => id !== videoId), videoId];
  const evicted = tracked.splice(0, Math.max(0, tracked.length - MAX_TRACKED_VIDEOS));
  for (const id of evicted) {
    clearCookieSet(res, videoCookiePath(id));
  }
  res.cookie(PLAYBACK_INDEX_COOKIE, tracked.join(','), { ...indexCookieOptions(), expires: expiresAt });

  return { expiresAt, resource };
};

/**
 * Thu hồi bộ Signed Cookie khỏi trình duyệt.
 *
 * Cần có hàm này vì cookie được đặt `httpOnly`, nên đăng xuất phía trình duyệt
 * không thể tự xoá chúng — chỉ máy chủ mới xoá được. Trước đây không có đường
 * nào làm việc đó: đăng xuất chỉ xoá token trong localStorage, còn bộ cookie
 * phát video vẫn nằm lại trong trình duyệt tới hai giờ. Trên máy dùng chung,
 * người ngồi vào sau vẫn tải được segment video riêng tư của người trước nếu
 * biết đường dẫn.
 *
 * Xoá bộ cookie của mọi video trong cookie chỉ mục, bộ kiểu cũ ở Path=/, rồi
 * chính cookie chỉ mục.
 */
const clearPlaybackCookies = (req, res) => {
  for (const id of readIssuedVideoIds(req)) {
    clearCookieSet(res, videoCookiePath(id));
  }
  clearCookieSet(res, '/');
  res.clearCookie(PLAYBACK_INDEX_COOKIE, indexCookieOptions());
};

module.exports = {
  isSigningEnabled,
  generatePlaybackCookies,
  attachPlaybackCookies,
  clearPlaybackCookies,
  buildResourcePattern,
  COOKIE_TTL_SECONDS,
  COOKIE_NAMES,
  PLAYBACK_INDEX_COOKIE,
  MAX_TRACKED_VIDEOS,
};
