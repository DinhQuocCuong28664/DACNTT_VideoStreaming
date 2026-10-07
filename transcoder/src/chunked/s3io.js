/**
 * Lớp I/O của pipeline chia đoạn trên S3.
 *
 * Pipeline chỉ nói chuyện qua giao diện này nên chạy được cả cục bộ (scripts/lib/localIo.js)
 * mà không cần AWS.
 *
 * Tệp tạm (kế hoạch, âm thanh đã mã hoá, kết quả từng đoạn) nằm ở bucket RAW dưới `work/<videoId>/`:
 * bucket đó riêng tư và không có CloudFront đứng trước, nên âm thanh gốc của một video riêng tư
 * không bao giờ có URL công khai. Bucket processed thì khác: CloudFront phục vụ cả bucket.
 * Event S3 → SQS chỉ lọc tiền tố `videos/` nên ghi vào `work/` không kích hoạt thêm job nào.
 */

/**
 * @param {object} p
 * @param {string} p.rawBucket
 * @param {string} p.processedBucket
 * @param {string} p.workPrefix
 * @param {number} p.presignSeconds
 * @param {object} p.s3 - các hàm của s3Handler (tiêm vào để kiểm thử)
 */
const createS3Io = ({ rawBucket, processedBucket, workPrefix, presignSeconds, s3 }) => ({
  /** Khoá của một tệp tạm: work/<videoId>/<name>. */
  workKey: (videoId, name) => `${workPrefix}/${videoId}/${name}`,

  /** URL đọc nguồn qua HTTP; ký lại mỗi lần gọi. */
  sourceUrl: (rawKey) => s3.getSignedGetUrl(rawBucket, rawKey, presignSeconds),
  workUrl: (key) => s3.getSignedGetUrl(rawBucket, key, presignSeconds),

  putWorkJson: (key, value) => s3.putJson(rawBucket, key, value),
  getWorkJson: (key) => s3.getJson(rawBucket, key),
  putWorkFile: (localPath, key) => s3.uploadFileToS3(localPath, rawBucket, key),
  deleteWork: (keys) => s3.deleteObjects(rawBucket, keys),

  uploadProcessedDir: (localDir, prefix) => s3.uploadDirectoryToS3(localDir, processedBucket, prefix),
  putProcessedFile: (localPath, key) => s3.uploadFileToS3(localPath, processedBucket, key),
});

module.exports = { createS3Io };
