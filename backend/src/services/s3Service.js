const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

// Initialize S3 Client (AWS SDK v3)
const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * Generate a unique S3 key for video upload
 * Format: videos/{userId}/{uuid}/{original-filename}
 */
const generateS3Key = (userId, filename) => {
  const uniqueId = uuidv4();
  const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `videos/${userId}/${uniqueId}/${sanitizedFilename}`;
};

/**
 * Generate Pre-signed PUT URL for direct upload to S3 Raw Bucket
 * URL expires in 15 minutes (as per AGENTS.md specification)
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
 * Delete an object from S3
 */
const deleteObject = async (bucket, key) => {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  await s3Client.send(command);
};

module.exports = {
  generateS3Key,
  generatePresignedUploadUrl,
  deleteObject,
};
