/**
 * Giới hạn và kích thước phần của luồng tải video lên.
 *
 * Một nguồn duy nhất cho validateRequest, videoService và endpoint
 * `GET /api/videos/upload-config` (frontend đọc từ đó thay vì giữ con số riêng
 * có thể lệch với máy chủ).
 */

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

/**
 * Trần cứng của mã nguồn, không phụ thuộc cấu hình: 20 GiB là 640 phần 32 MiB,
 * còn nằm gọn trong giới hạn 10.000 phần của S3 và trong một trang ListParts
 * (1.000 phần). Nâng trần này thì phải xem lại cả hai.
 */
const HARD_MAX_VIDEO_SIZE_BYTES = 20 * GiB;

/**
 * Default cap when MAX_VIDEO_SIZE_GB is unset: 2 GiB, the size one sequential
 * single-job transcode handles (about 30 min of 1080p at 1 vCPU,
 * docs/results/transcode-timing.json). Environments with chunk-parallel
 * transcoding raise it with MAX_VIDEO_SIZE_GB (at most 20). Production sets it
 * in Terraform (infrastructure/modules/lambda-backend, max_video_size_gb).
 */
const DEFAULT_MAX_VIDEO_SIZE_BYTES = 2 * GiB;

/** Một lệnh PUT/POST đơn lẻ lên S3 chỉ nhận tối đa 5 GiB. */
const SINGLE_UPLOAD_MAX_BYTES = 5 * GiB;

/**
 * Tệp lớn hơn ngưỡng này tải theo từng phần (multipart); nhỏ hơn thì vẫn dùng
 * một presigned POST như trước. Multipart cho phép thử lại riêng phần hỏng thay
 * vì tải lại cả tệp khi mất mạng, thứ đáng giá từ vài trăm MB trở lên.
 */
const MULTIPART_THRESHOLD_BYTES = 512 * MiB;

/**
 * Kích thước mỗi phần (trừ phần cuối). Nhỏ vừa phải vì URL của từng phần được
 * ký bằng credential của role EC2, vốn xoay vòng: URL ký sát lúc credential hết
 * hạn chỉ sống được vài phút, nên mỗi phần phải tải xong trong khoảng đó.
 * 32 MiB mất ~4 phút ở 1 Mbps.
 */
const MULTIPART_PART_SIZE_BYTES = 32 * MiB;

/** Số URL phần tối đa cấp trong một lần gọi. */
const MAX_PART_URLS_PER_REQUEST = 10;

/** URL của một phần sống 15 phút, như presigned POST. */
const PART_URL_TTL_SECONDS = 15 * 60;

/** Trần tải lên đang áp dụng, đọc từ MAX_VIDEO_SIZE_GB nếu có. */
const resolveMaxVideoSizeBytes = (env = process.env) => {
  const gib = Number(env.MAX_VIDEO_SIZE_GB);
  if (!Number.isFinite(gib) || gib <= 0) return DEFAULT_MAX_VIDEO_SIZE_BYTES;
  return Math.min(Math.floor(gib * GiB), HARD_MAX_VIDEO_SIZE_BYTES);
};

const MAX_VIDEO_SIZE_BYTES = resolveMaxVideoSizeBytes();

/** Tệp có khai dung lượng và lớn hơn ngưỡng thì tải theo từng phần. */
const usesMultipart = (fileSize) => Number(fileSize) > MULTIPART_THRESHOLD_BYTES;

/** Số phần của một tệp. */
const countParts = (fileSize, partSize = MULTIPART_PART_SIZE_BYTES) =>
  Math.ceil(Number(fileSize) / partSize);

/**
 * Dung lượng đúng của phần thứ `partNumber` (đánh số từ 1): mọi phần bằng
 * `partSize`, trừ phần cuối là phần còn lại. Trả null khi số phần nằm ngoài tệp.
 * Máy chủ ký chính con số này vào URL, nên S3 từ chối phần có dung lượng khác.
 */
const partSizeOf = (partNumber, fileSize, partSize = MULTIPART_PART_SIZE_BYTES) => {
  const count = countParts(fileSize, partSize);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > count) return null;
  return partNumber < count ? partSize : Number(fileSize) - (count - 1) * partSize;
};

module.exports = {
  HARD_MAX_VIDEO_SIZE_BYTES,
  DEFAULT_MAX_VIDEO_SIZE_BYTES,
  SINGLE_UPLOAD_MAX_BYTES,
  MAX_VIDEO_SIZE_BYTES,
  MULTIPART_THRESHOLD_BYTES,
  MULTIPART_PART_SIZE_BYTES,
  MAX_PART_URLS_PER_REQUEST,
  PART_URL_TTL_SECONDS,
  resolveMaxVideoSizeBytes,
  usesMultipart,
  countParts,
  partSizeOf,
};
