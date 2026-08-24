const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

// Initialize S3 Client (AWS SDK v3)
//
// Chỉ truyền `credentials` khi thực sự có khoá tĩnh trong biến môi trường.
// Truyền vô điều kiện sẽ đưa cho SDK một object {accessKeyId: undefined,
// secretAccessKey: undefined} khi máy chủ dùng IAM Role thay cho khoá tĩnh, và
// SDK từ chối với lỗi "Resolved credential object is not valid" — mọi yêu cầu
// xin pre-signed URL trả về HTTP 500. Bỏ trống trường này để SDK tự dò theo
// chuỗi mặc định (biến môi trường → hồ sơ chung → IAM Role qua IMDS), nhờ đó
// chạy được cả ở máy phát triển lẫn trên EC2 gắn instance profile.
//
// Transcoder đã áp dụng đúng cách này từ trước (xem transcoder/src/s3Handler.js);
// backend giữ nguyên lỗi cũ cho tới khi triển khai trên EC2 dùng IAM Role.
const s3ClientConfig = { region: process.env.AWS_REGION };
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  s3ClientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

const s3Client = new S3Client(s3ClientConfig);

/**
 * Generate a unique S3 key for video upload
 * Format: videos/{userId}/{videoId}/{original-filename}
 * Notice: Using videoId (Mongo ObjectId) guarantees Lambda extracts the exact DB _id!
 */
const generateS3Key = (userId, videoId, filename) => {
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `videos/${userId}/${videoId}/${sanitizedFilename}`;
};

/**
 * Generate Pre-signed PUT URL for direct upload to S3 Raw Bucket
 * URL expires in 15 minutes
 */
const generatePresignedUploadUrl = async (key, contentType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_RAW_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: 15 * 60, // 15 minutes
  });

  return url;
};

/**
 * Sinh S3 key cho ảnh đại diện: avatars/{userId}/{timestamp}.{ext}
 * Timestamp làm phần tên file để mỗi lần đổi ảnh là một object mới — tránh
 * cache trình duyệt/CDN giữ ảnh cũ do URL không đổi khi ghi đè cùng key.
 */
const generateAvatarKey = (userId, filename) => {
  const ext = (filename.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  return `avatars/${userId}/${Date.now()}.${ext}`;
};

/**
 * Pre-signed PUT URL để tải ảnh đại diện thẳng lên bucket tĩnh công khai
 * (cùng bucket đang host frontend qua zelostech.site) — KHÁC với
 * S3_RAW_BUCKET_NAME của video, vì bucket video bị chặn public truy cập
 * hoàn toàn (BlockPublicAcls/RestrictPublicBuckets đều bật) theo đúng quyết
 * định giữ private đã ghi trong docs/REBUILD_ON_NEW_AWS_ACCOUNT.md, còn ảnh
 * đại diện cần hiển thị công khai ngay lập tức, không qua transcode/CDN ký.
 * Bucket tĩnh này đã có policy public GetObject sẵn từ trước (phục vụ host
 * frontend), nên tái dùng chứ không tạo bucket/hạ tầng mới.
 */
const generateAvatarUploadUrl = async (key, contentType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_STATIC_BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return await getSignedUrl(s3Client, command, { expiresIn: 15 * 60 });
};

/**
 * URL công khai để hiển thị ảnh đại diện sau khi tải lên.
 *
 * Dùng path-style (s3.{region}.amazonaws.com/{bucket}/{key}) thay vì
 * virtual-hosted-style ({bucket}.s3.{region}.amazonaws.com/{key}): tên bucket
 * "zelostech.site" chứa dấu chấm, khiến virtual-hosted-style tạo ra một tên
 * miền phụ 2 cấp không khớp chứng chỉ TLS wildcard *.s3.amazonaws.com của
 * AWS — trình duyệt sẽ từ chối tải ảnh vì lỗi chứng chỉ. Đây là giới hạn đã
 * biết của S3 với bucket có dấu chấm trong tên, không phải lỗi cấu hình.
 */
const getAvatarPublicUrl = (key) =>
  `https://s3.${process.env.AWS_REGION}.amazonaws.com/${process.env.S3_STATIC_BUCKET_NAME}/${key}`;

/**
 * Delete a single object from S3
 */
const deleteObject = async (bucket, key) => {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3Client.send(command);
};

/**
 * Delete all objects with prefix in a bucket (directory deletion with pagination support)
 */
const deleteDirectory = async (bucket, prefix) => {
  try {
    let continuationToken;
    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResult = await s3Client.send(listCommand);

      if (listResult.Contents && listResult.Contents.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: listResult.Contents.map((obj) => ({ Key: obj.Key })),
          },
        });

        await s3Client.send(deleteCommand);
      }

      continuationToken = listResult.NextContinuationToken;
    } while (continuationToken);
  } catch (err) {
    console.warn(`⚠️ Failed to delete S3 directory ${prefix} in ${bucket}:`, err.message);
  }
};

module.exports = {
  generateS3Key,
  generatePresignedUploadUrl,
  generateAvatarKey,
  generateAvatarUploadUrl,
  getAvatarPublicUrl,
  deleteObject,
  deleteDirectory,
};
