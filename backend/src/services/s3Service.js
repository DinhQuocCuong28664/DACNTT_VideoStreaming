const {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');

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
 * Presigned POST: S3 tự kiểm tra các điều kiện trong policy trước khi nhận
 * byte nào.
 *
 * Vì sao không dùng presigned PUT: bộ ký của SDK v3 luôn bỏ `content-type`
 * khỏi danh sách header được ký (xem prepareRequest trong
 * @aws-sdk/s3-request-presigner), nên URL PUT chỉ ký `host` — người tải lên tự
 * chọn Content-Type và dung lượng tuỳ ý. Policy của POST thì ghim được cả hai:
 * mỗi trường trong `Fields` thành một điều kiện khớp chính xác (kể cả `key`),
 * còn `content-length-range` chặn tệp rỗng và tệp quá cỡ ngay tại S3.
 *
 * @returns {Promise<{url: string, fields: Record<string, string>}>}
 *   Trình duyệt gửi multipart/form-data tới `url` với mọi trường trong
 *   `fields`, trường `file` đặt cuối cùng.
 */
const createUploadPost = async ({ bucket, key, contentType, maxBytes, expiresIn = 15 * 60 }) =>
  createPresignedPost(s3Client, {
    Bucket: bucket,
    Key: key,
    Fields: { 'Content-Type': contentType },
    Conditions: [['content-length-range', 1, maxBytes]],
    Expires: expiresIn,
  });

/**
 * Đuôi tệp ảnh đại diện, suy từ MIME đã kiểm tra ở validateAvatarMetadata.
 *
 * Trước đây đuôi lấy từ tên tệp người dùng gửi lên, nên "anh.html" cho ra
 * key avatars/{userId}/{ts}.html. Bucket này cũng là bucket CloudFront phục vụ
 * zelostech.site, nên một tệp HTML ở đó chạy ngay trên origin của ứng dụng.
 */
const AVATAR_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

/**
 * Sinh S3 key cho ảnh đại diện: avatars/{userId}/{timestamp}.{ext}
 * Timestamp làm phần tên file để mỗi lần đổi ảnh là một object mới — tránh
 * cache trình duyệt/CDN giữ ảnh cũ do URL không đổi khi ghi đè cùng key.
 */
const generateAvatarKey = (userId, mimeType) => {
  const ext = AVATAR_EXTENSIONS[mimeType];
  if (!ext) {
    throw new Error(`Unsupported avatar type: ${mimeType}`);
  }
  return `avatars/${userId}/${Date.now()}.${ext}`;
};

/** Khớp đúng các key do generateAvatarKey sinh ra cho một người dùng. */
const isAvatarKeyOf = (userId, key) =>
  typeof key === 'string' &&
  key.startsWith(`avatars/${userId}/`) &&
  /^\d+\.(jpg|png|webp)$/.test(key.slice(`avatars/${userId}/`.length));

/**
 * Presigned POST để tải ảnh đại diện thẳng lên bucket tĩnh công khai
 * (cùng bucket đang host frontend qua zelostech.site) — KHÁC với
 * S3_RAW_BUCKET_NAME của video, vì bucket video bị chặn public truy cập
 * hoàn toàn (BlockPublicAcls/RestrictPublicBuckets đều bật) theo đúng quyết
 * định giữ private đã ghi trong docs/REBUILD_ON_NEW_AWS_ACCOUNT.md, còn ảnh
 * đại diện cần hiển thị công khai ngay lập tức, không qua transcode/CDN ký.
 * Bucket tĩnh này đã có policy public GetObject sẵn từ trước (phục vụ host
 * frontend), nên tái dùng chứ không tạo bucket/hạ tầng mới.
 *
 * Vì chính bucket này phục vụ ứng dụng, policy phải ghim Content-Type về đúng
 * loại ảnh đã kiểm tra — nếu không, "ảnh đại diện" là một trang HTML chạy trên
 * zelostech.site và đọc được JWT trong localStorage của người mở nó.
 */
const generateAvatarUploadPost = (key, contentType, maxBytes) =>
  createUploadPost({ bucket: process.env.S3_STATIC_BUCKET_NAME, key, contentType, maxBytes });

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
 * Tệp có tồn tại trên S3 không.
 *
 * Máy chủ có quyền s3:ListBucket trên bucket, nên tệp không tồn tại trả 404
 * (NotFound) chứ không phải 403; mọi lỗi khác được ném ra để người gọi không
 * nhầm "không kiểm tra được" thành "không có tệp".
 */
const objectExists = async (bucket, key) => {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || (err.$metadata && err.$metadata.httpStatusCode === 404)) {
      return false;
    }
    throw err;
  }
};

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
  createUploadPost,
  generateAvatarKey,
  isAvatarKeyOf,
  generateAvatarUploadPost,
  getAvatarPublicUrl,
  objectExists,
  deleteObject,
  deleteDirectory,
};
