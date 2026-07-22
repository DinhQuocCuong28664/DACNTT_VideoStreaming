const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock_key',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock_secret',
  },
});

const generatePresignedUploadUrl = async (key, contentType) => {
  const command = new PutObjectCommand({
    Bucket: process.env.S3_RAW_BUCKET_NAME || 'vidshare-raw-bucket',
    Key: key,
    ContentType: contentType,
  });

  // Pre-signed URL valid for 15 minutes (900 seconds)
  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
  return signedUrl;
};

const deleteS3Object = async (bucket, key) => {
  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: key,
  });

  return await s3Client.send(command);
};

module.exports = {
  s3Client,
  generatePresignedUploadUrl,
  deleteS3Object,
};
