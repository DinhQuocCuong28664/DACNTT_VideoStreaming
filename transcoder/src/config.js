require('dotenv').config();

/** Đọc số dương từ biến môi trường, sai hoặc thiếu thì dùng giá trị mặc định. */
const positiveNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const config = {
  // MongoDB
  mongodbUri: process.env.MONGODB_URI,

  // AWS General
  awsRegion: process.env.AWS_REGION || 'ap-southeast-1',
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,

  // S3 Buckets
  s3RawBucket: process.env.S3_RAW_BUCKET_NAME || 'vidshare-raw-bucket',
  s3ProcessedBucket: process.env.S3_PROCESSED_BUCKET_NAME || 'vidshare-processed-bucket',

  // CloudFront (empty = use S3 URL directly for dev)
  cloudfrontDomain: process.env.CLOUDFRONT_DOMAIN || '',

  // SQS
  sqsQueueUrl: process.env.SQS_QUEUE_URL || '',

  // Frontend — dùng để dựng link xem video trong email thông báo
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  // Email (Gmail SMTP) — thông báo video sẵn sàng/thất bại
  email: {
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT, 10) || 587,
    user: process.env.EMAIL_USER,
    appPassword: process.env.EMAIL_APP_PASSWORD,
    from: process.env.EMAIL_FROM || 'DACNTT Video Platform <noreply@zelostech.site>',
  },

  // Kiểm duyệt nội dung bằng Amazon Rekognition (xem src/moderation.js).
  //
  // Bật mặc định, chỉ tắt khi ghi rõ MODERATION_ENABLED=false: quên cấu hình
  // thì hệ thống vẫn kiểm duyệt, thay vì lặng lẽ công khai mọi video.
  moderation: {
    enabled: process.env.MODERATION_ENABLED !== 'false',
    // Một khung hình mỗi 5 giây, tối đa 120 khung: trần $0.12/video theo giá
    // $0.001/ảnh; video dài hơn 10 phút thì khoảng cách tự giãn ra.
    interval: positiveNumber(process.env.MODERATION_FRAME_INTERVAL, 5),
    maxFrames: Math.floor(positiveNumber(process.env.MODERATION_MAX_FRAMES, 120)),
    // AWS: MinConfidence dưới 50 cho nhiều dương tính giả. 60 để vào hàng rà
    // soát, 90 mới tự động gỡ — phần lưng chừng dành cho con người quyết.
    reviewConfidence: positiveNumber(process.env.MODERATION_REVIEW_CONFIDENCE, 60),
    blockConfidence: positiveNumber(process.env.MODERATION_BLOCK_CONFIDENCE, 90),
    // Phân tích được dưới 80% số khung dự kiến thì không tự động công khai.
    minCoverage: 0.8,
    concurrency: 3,
  },

  // FFmpeg Settings
  ffmpeg: {
    segmentDuration: 6, // seconds per HLS segment
    thumbnailTime: 5,   // extract thumbnail at this second
    renditions: [
      {
        name: '360p',
        width: 640,
        height: 360,
        videoBitrate: '400k',
        audioBitrate: '64k',
        maxrate: '500k',
        bufsize: '800k',
      },
      {
        name: '720p',
        width: 1280,
        height: 720,
        videoBitrate: '1500k',
        audioBitrate: '128k',
        maxrate: '2000k',
        bufsize: '3000k',
      },
      {
        name: '1080p',
        width: 1920,
        height: 1080,
        videoBitrate: '4000k',
        audioBitrate: '192k',
        maxrate: '5000k',
        bufsize: '8000k',
      },
    ],
  },
};

/**
 * Build the public URL for an HLS asset.
 * If CloudFront is configured, use it; otherwise fall back to S3 direct URL.
 */
config.getPublicUrl = (s3Key) => {
  if (config.cloudfrontDomain && config.cloudfrontDomain !== 'your_cloudfront_domain.cloudfront.net') {
    return `https://${config.cloudfrontDomain}/${s3Key}`;
  }
  return `https://${config.s3ProcessedBucket}.s3.${config.awsRegion}.amazonaws.com/${s3Key}`;
};

module.exports = config;
