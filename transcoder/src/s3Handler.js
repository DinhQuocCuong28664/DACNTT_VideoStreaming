const { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream/promises');
const config = require('./config');

const clientConfig = { region: config.awsRegion };
if (config.awsAccessKeyId && config.awsSecretAccessKey) {
  clientConfig.credentials = {
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  };
}

const s3Client = new S3Client(clientConfig);

/**
 * Download a file from S3 to local filesystem
 */
const downloadFromS3 = async (bucket, key, localPath) => {
  console.log(`⬇️  Downloading s3://${bucket}/${key} → ${localPath}`);

  const dir = path.dirname(localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3Client.send(command);

  const writeStream = fs.createWriteStream(localPath);
  await pipeline(response.Body, writeStream);

  const stats = fs.statSync(localPath);
  console.log(`✅ Downloaded: ${(stats.size / 1048576).toFixed(1)} MB`);
  return stats.size;
};

/**
 * Upload a single file to S3 with appropriate Content-Type
 */
const uploadFileToS3 = async (localPath, bucket, s3Key) => {
  const contentType = getContentType(localPath);
  const fileStream = fs.createReadStream(localPath);
  const stats = fs.statSync(localPath);

  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    Body: fileStream,
    ContentType: contentType,
  });

  await s3Client.send(command);
  return stats.size;
};

/**
 * URL ký sẵn để ffmpeg đọc một object qua HTTP (Range request) mà không tải về.
 *
 * Mỗi job tự ký lại ngay khi bắt đầu (và mỗi lần thử lại): URL ký bằng thông tin xác thực
 * tạm của task role chỉ sống tới khi thông tin đó hết hạn, dù `expiresIn` ghi dài hơn.
 */
const getSignedGetUrl = (bucket, key, expiresIn) =>
  getSignedUrl(s3Client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });

/** Ghi một đối tượng JSON. */
const putJson = async (bucket, key, value) => {
  await s3Client.send(
    new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(value), ContentType: 'application/json' })
  );
};

/** Đọc một đối tượng JSON; trả về null nếu chưa có (khác với lỗi mạng hay quyền, vẫn ném lỗi). */
const getJson = async (bucket, key) => {
  try {
    const response = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return JSON.parse(await response.Body.transformToString());
  } catch (err) {
    if (err.name === 'NoSuchKey' || (err.$metadata && err.$metadata.httpStatusCode === 404)) return null;
    throw err;
  }
};

/** Xoá nhiều object, tối đa 1000 khoá mỗi lệnh (giới hạn của S3). Khoá không tồn tại không phải lỗi. */
const deleteObjects = async (bucket, keys) => {
  const failures = [];
  for (let i = 0; i < keys.length; i += 1000) {
    const batch = keys.slice(i, i + 1000);
    const response = await s3Client.send(
      new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } })
    );
    failures.push(...(response.Errors || []));
  }
  if (failures.length > 0) {
    console.warn(`⚠️  Could not delete ${failures.length} object(s) from s3://${bucket}, e.g. ${failures[0].Key}: ${failures[0].Message}`);
  }
  return { deleted: keys.length - failures.length, failed: failures.length };
};

/**
 * Chạy `worker` trên mọi phần tử, tối đa `limit` việc cùng lúc.
 *
 * Lỗi đầu tiên làm cả lượt thất bại, và các luồng còn lại thôi nhận việc mới
 * thay vì tải tiếp những tệp mà job đằng nào cũng sẽ bị đánh ERROR.
 *
 * Chỉ trả về (hay ném lỗi) khi mọi việc đang dở đã dừng hẳn. Promise.all sẽ
 * reject ngay ở lỗi đầu tiên trong khi các luồng khác vẫn đang đọc tệp, và
 * khối finally của processVideo xoá thư mục tạm ngay sau đó.
 */
const runWithConcurrency = async (items, limit, worker) => {
  let next = 0;
  let failed = false;

  const lane = async () => {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        await worker(items[index], index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };

  const lanes = Array.from({ length: Math.min(limit, items.length) }, lane);
  const failure = (await Promise.allSettled(lanes)).find((r) => r.status === 'rejected');
  if (failure) throw failure.reason;
};

/**
 * Upload an entire local directory tree to S3 under a given prefix
 *
 * Tải song song `config.s3UploadConcurrency` tệp một lúc. Bản trước tải lần
 * lượt từng tệp, trong khi một video có hàng trăm segment .ts nhỏ (3 rendition
 * x một segment mỗi 6 giây): thời gian bị chi phối bởi độ trễ của từng request
 * chứ không phải băng thông. AWS khuyến nghị chạy song song nhiều request tới
 * S3 để tăng thông lượng (Performance design patterns for Amazon S3); mức 8 còn
 * rất xa trần 3.500 PUT/s mỗi prefix. Mỗi request vẫn đi qua SDK nên giữ nguyên
 * cơ chế thử lại khi S3 trả 503.
 */
const uploadDirectoryToS3 = async (localDir, bucket, s3Prefix) => {
  const files = getAllFiles(localDir);
  let totalSize = 0;
  let uploadedCount = 0;
  const startedAt = Date.now();

  console.log(
    `⬆️  Uploading ${files.length} files to s3://${bucket}/${s3Prefix} (${config.s3UploadConcurrency} at a time)`
  );

  await runWithConcurrency(files, config.s3UploadConcurrency, async (filePath) => {
    const relativePath = path.relative(localDir, filePath).replace(/\\/g, '/');
    const s3Key = `${s3Prefix}/${relativePath}`;

    const size = await uploadFileToS3(filePath, bucket, s3Key);
    totalSize += size;
    uploadedCount++;

    if (uploadedCount % 50 === 0 || uploadedCount === files.length) {
      console.log(`   📤 ${uploadedCount}/${files.length} files uploaded (${(totalSize / 1048576).toFixed(1)} MB)`);
    }
  });

  const seconds = (Date.now() - startedAt) / 1000;
  console.log(
    `✅ Upload complete: ${files.length} files, ${(totalSize / 1048576).toFixed(1)} MB total in ${seconds.toFixed(1)}s`
  );
  return { fileCount: files.length, totalSize, seconds };
};

/**
 * Recursively list all files in a directory
 */
const getAllFiles = (dirPath, fileList = []) => {
  const entries = fs.readdirSync(dirPath);
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry);
    if (fs.statSync(fullPath).isDirectory()) {
      getAllFiles(fullPath, fileList);
    } else {
      fileList.push(fullPath);
    }
  }
  return fileList;
};

/**
 * Map file extension to MIME Content-Type
 */
const getContentType = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.m3u8': 'application/vnd.apple.mpegurl',
    '.ts': 'video/MP2T',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.mp4': 'video/mp4',
    '.m4a': 'audio/mp4',
    '.json': 'application/json',
  };
  return types[ext] || 'application/octet-stream';
};

module.exports = {
  downloadFromS3,
  getSignedGetUrl,
  putJson,
  getJson,
  deleteObjects,
  uploadFileToS3,
  uploadDirectoryToS3,
  runWithConcurrency,
};
