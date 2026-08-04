const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

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
  deleteObject,
  deleteDirectory,
};
