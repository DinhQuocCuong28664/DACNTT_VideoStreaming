const mongoose = require('mongoose');
const config = require('./config');

// Video schema (same as backend — minimal fields needed for transcoder)
const videoSchema = new mongoose.Schema(
  {
    title: String,
    description: String,
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['UPLOADING', 'PROCESSING', 'READY', 'ERROR'],
    },
    rawS3Key: String,
    hlsUrl: String,
    thumbnailUrl: String,
    duration: Number,
    fileSize: Number,
    mimeType: String,
    views: Number,
    tags: [String],
    visibility: String,
  },
  { timestamps: true }
);

// User schema tối giản — chỉ đủ trường để lấy địa chỉ nhận email thông báo
// qua populate('user', ...). Không dùng chung model với backend vì transcoder
// và backend là hai container độc lập, không chia sẻ mã nguồn.
const userSchema = new mongoose.Schema({
  email: String,
  displayName: String,
  username: String,
});

const Video = mongoose.model('Video', videoSchema);
// Chỉ cần đăng ký model 'User' để populate('user', ...) phân giải được —
// không cần giữ tham chiếu trực tiếp tới model này ở đâu khác.
mongoose.model('User', userSchema);

/**
 * Connect to MongoDB Atlas
 */
const connectDB = async () => {
  if (mongoose.connection.readyState === 1) return; // Already connected
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(config.mongodbUri);
  console.log('✅ MongoDB Connected');
};

/**
 * Disconnect from MongoDB
 */
const disconnectDB = async () => {
  await mongoose.disconnect();
  console.log('🔌 MongoDB Disconnected');
};

/**
 * Update video status after transcoding completes.
 *
 * Dùng findOneAndUpdate với điều kiện `status != 'READY'` thay vì
 * findById + save() vô điều kiện. Đây là lớp phòng vệ cuối cùng chống ghi
 * trùng khi SQS redeliver message cho một video đã xử lý xong — ví dụ do
 * heartbeat trễ quá visibility timeout trong lúc container chỉ bị treo tạm
 * (không crash hẳn), hoặc do deleteMessage() thất bại sau khi đã xử lý xong.
 * Nếu 2 job cùng chạy, chỉ job ghi trước làm status chuyển sang READY thành
 * công; job ghi sau nhận về null và bị bỏ qua thay vì ghi đè.
 */
const updateVideoReady = async (videoId, { hlsUrl, thumbnailUrl, duration }) => {
  const update = { status: 'READY', hlsUrl };
  if (thumbnailUrl) update.thumbnailUrl = thumbnailUrl;
  if (duration) update.duration = duration;

  const video = await Video.findOneAndUpdate(
    { _id: videoId, status: { $ne: 'READY' } },
    { $set: update },
    { new: true }
  );

  if (!video) {
    const existing = await Video.findById(videoId);
    if (!existing) {
      throw new Error(`Video not found: ${videoId}`);
    }
    console.warn(
      `⚠️  Video ${videoId} was already READY; skipping the duplicate write (duplicate job detected via SQS redelivery)`
    );
    // updated=false: đây không phải job thắng cuộc ghi, không được gửi email
    // thông báo (job thắng cuộc — nếu còn sống — đã hoặc sẽ tự gửi).
    return { video: existing, updated: false };
  }

  console.log(`✅ Video ${videoId} status → READY`);
  return { video, updated: true };
};

/**
 * Mark video as ERROR.
 *
 * Cùng lý do với updateVideoReady: không được phép hạ một video đã READY
 * xuống ERROR. Nếu job A xử lý thành công (READY) nhưng job B (bản sao do
 * SQS redeliver) chạy chậm hơn và thất bại sau đó, job B tuyệt đối không
 * được phép ghi đè kết quả thành công của job A.
 */
const updateVideoError = async (videoId, errorMessage) => {
  const video = await Video.findOneAndUpdate(
    { _id: videoId, status: { $ne: 'READY' } },
    { $set: { status: 'ERROR' } },
    { new: true }
  );

  if (!video) {
    const existing = await Video.findById(videoId);
    if (!existing) {
      console.error(`Video not found: ${videoId}`);
      return { video: null, updated: false };
    }
    console.warn(
      `⚠️  Video ${videoId} is already READY; skipping the ERROR mark from a duplicate job (original error: ${errorMessage})`
    );
    return { video: existing, updated: false };
  }

  console.error(`❌ Video ${videoId} status → ERROR: ${errorMessage}`);
  return { video, updated: true };
};

/**
 * Get video by ID
 */
const getVideo = async (videoId) => {
  return Video.findById(videoId);
};

/**
 * Lấy video kèm thông tin người upload (email, tên hiển thị) — dùng để gửi
 * email thông báo. Tách riêng khỏi updateVideoReady/updateVideoError vì hai
 * hàm đó trả về document Video thuần (không populate) để giữ đường ghi DB
 * gọn nhẹ; populate chỉ cần khi thực sự chuẩn bị gửi mail.
 */
const getVideoWithUser = async (videoId) => {
  return Video.findById(videoId).populate('user', 'email displayName username');
};

module.exports = {
  connectDB,
  disconnectDB,
  updateVideoReady,
  updateVideoError,
  getVideo,
  getVideoWithUser,
};
