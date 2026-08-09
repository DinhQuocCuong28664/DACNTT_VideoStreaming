const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
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
 * Upload an entire local directory tree to S3 under a given prefix
 * Recursively walks localDir and uploads every file
 */
const uploadDirectoryToS3 = async (localDir, bucket, s3Prefix) => {
  const files = getAllFiles(localDir);
  let totalSize = 0;
  let uploadedCount = 0;

  console.log(`⬆️  Uploading ${files.length} files to s3://${bucket}/${s3Prefix}`);

  for (const filePath of files) {
    const relativePath = path.relative(localDir, filePath).replace(/\\/g, '/');
    const s3Key = `${s3Prefix}/${relativePath}`;

    const size = await uploadFileToS3(filePath, bucket, s3Key);
    totalSize += size;
    uploadedCount++;

    if (uploadedCount % 10 === 0 || uploadedCount === files.length) {
      console.log(`   📤 ${uploadedCount}/${files.length} files uploaded (${(totalSize / 1048576).toFixed(1)} MB)`);
    }
  }

  console.log(`✅ Upload complete: ${files.length} files, ${(totalSize / 1048576).toFixed(1)} MB total`);
  return { fileCount: files.length, totalSize };
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
  };
  return types[ext] || 'application/octet-stream';
};

module.exports = {
  downloadFromS3,
  uploadFileToS3,
  uploadDirectoryToS3,
};
