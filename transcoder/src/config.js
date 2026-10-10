require('dotenv').config();

const { isValidFargateSize } = require('./chunked/fargateSize');

/** Đọc số dương từ biến môi trường, sai hoặc thiếu thì dùng giá trị mặc định. */
const positiveNumber = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

/** Cặp vCPU/bộ nhớ của job chunk từ biến môi trường; không đặt hoặc sai thì {0, 0} (dùng cỡ job definition). */
const resolveChunkTaskSize = (vcpuText, memoryText) => {
  const chunkVcpu = Number(vcpuText);
  const chunkMemoryMiB = Number(memoryText);
  if (!vcpuText && !memoryText) return { chunkVcpu: 0, chunkMemoryMiB: 0 };
  if (!isValidFargateSize(chunkVcpu, chunkMemoryMiB)) {
    console.warn(`⚠️  CHUNK_JOB_VCPU=${vcpuText} / CHUNK_JOB_MEMORY=${memoryText} không phải cặp Fargate hợp lệ; dùng cỡ của job definition.`);
    return { chunkVcpu: 0, chunkMemoryMiB: 0 };
  }
  return { chunkVcpu, chunkMemoryMiB };
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

  // Số tệp HLS tải lên S3 cùng lúc (s3Handler.uploadDirectoryToS3). AWS khuyên
  // đo khi chỉnh con số này; đổi qua biến môi trường, không cần build lại image.
  s3UploadConcurrency: Math.floor(positiveNumber(process.env.S3_UPLOAD_CONCURRENCY, 8)),

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

  // Chuyển mã song song theo đoạn cho video dài (docs/CHUNKED_TRANSCODING_DESIGN.md).
  //
  // TẮT mặc định và chỉ bật khi ghi rõ CHUNKED_TRANSCODING=true: job definition thiếu quyền
  // nộp job con hay thiếu biến BATCH_* sẽ không tự dưng chuyển video dài sang đường mới.
  // Tắt lại bằng cách đổi biến này (đăng ký lại job definition), không cần build lại image.
  chunked: {
    enabled: process.env.CHUNKED_TRANSCODING === 'true',
    // Video dài hơn ngưỡng này (giây) đi đường chia đoạn. Dưới ngưỡng giữ nguyên đường một-job.
    thresholdSeconds: Math.floor(positiveNumber(process.env.CHUNK_THRESHOLD_SECONDS, 1200)),
    // Số GOP (= số segment 6 giây) mỗi đoạn. 50 → ~5 phút. Đoạn ngắn thì chạy lại rẻ khi Spot
    // bị thu hồi và chia việc đều hơn, nhưng mỗi đoạn tốn chừng 30-40 giây khởi động container.
    gopsPerChunk: Math.floor(positiveNumber(process.env.CHUNK_GOPS, 50)),
    // Chia đoạn theo công suất: `targetParallelism` là số đoạn chạy được cùng lúc (quota vCPU chia số
    // vCPU mỗi đoạn; Terraform đặt biến này). Planner nhắm tới `chunksPerSlot` đoạn cho mỗi chỗ, nhưng
    // không để đoạn nhỏ hơn `minGopsPerChunk` GOP hay lớn hơn `gopsPerChunk`. 0 = tắt: mọi video dùng
    // `gopsPerChunk` như trước.
    targetParallelism: Math.floor(Math.max(0, Number(process.env.CHUNK_TARGET_PARALLELISM) || 0)),
    // Kích thước task cho riêng các job chunk (ghi đè job definition). 0 = dùng cỡ của job definition.
    // Chunk là phần nặng CPU và song song được; planner, âm thanh và job ghép giữ cỡ nhỏ. Đo cũ: task
    // 4 vCPU chạy nhanh 5,5 lần task 1 vCPU, tức hiệu quả hơn trên mỗi vCPU vì 1 vCPU phải chạy giải mã
    // và 6 bộ mã hoá tranh nhau. Cặp không hợp lệ bị bỏ qua (cảnh báo) thay vì làm mọi video dài hỏng.
    ...resolveChunkTaskSize(process.env.CHUNK_JOB_VCPU, process.env.CHUNK_JOB_MEMORY),
    chunksPerSlot: Math.floor(positiveNumber(process.env.CHUNKS_PER_SLOT, 3)),
    minGopsPerChunk: Math.floor(positiveNumber(process.env.CHUNK_MIN_GOPS, 10)),
    // Hằng số chung của -output_ts_offset (giây), phải >= 0,1 (E2 trong tài liệu thiết kế).
    tsOffsetBase: 1,
    // Tệp tạm của pipeline nằm ở bucket RAW (riêng tư, không có CloudFront), tiền tố này.
    // Không đặt ở bucket processed: âm thanh gốc của video riêng tư sẽ nằm sau CloudFront.
    workPrefix: 'work',
    // Thời hạn URL ký sẵn dùng để ffmpeg đọc nguồn qua HTTP. Mỗi job ký lại ngay khi bắt đầu.
    presignSeconds: 6 * 3600,
    // Hàng đợi và job definition để planner nộp job con vào. Hàng đợi lấy từ biến Batch tự đặt
    // nếu không khai tường minh.
    jobQueue: process.env.BATCH_JOB_QUEUE || process.env.AWS_BATCH_JQ_NAME || '',
    jobDefinition: process.env.BATCH_JOB_DEFINITION || '',
    // Hàng đợi ưu tiên thấp cho array job các đoạn, cùng compute environment với hàng đợi chính. Nhờ nó
    // một video 4 giờ (48 đoạn) không đứng trước mọi video ngắn nộp sau. Để trống thì các đoạn vào hàng
    // đợi chính như trước: an toàn khi hạ tầng chưa có hàng đợi này hoặc job definition cũ chưa có biến.
    bulkJobQueue: process.env.BATCH_BULK_JOB_QUEUE || '',
    // Số lần chạy ffmpeg cho một đoạn trong CÙNG job: URL ký sẵn hết hạn hay S3 chập chờn giữa
    // chừng làm một lần chạy hỏng, mà chạy lại đoạn là vô hại (ghi đè cùng khoá).
    ffmpegAttempts: Math.floor(positiveNumber(process.env.CHUNK_FFMPEG_ATTEMPTS, 2)),
    // Số lần Batch chạy một job con trước khi coi là thất bại, và thử lại VÔ ĐIỀU KIỆN. Chiến lược
    // của job definition chỉ thử lại khi lý do trạng thái khớp "Host EC2*" hay "Task failed to start*",
    // mà tài liệu AWS chỉ nêu mẫu đó cho Spot trên EC2, không cho Fargate Spot: không muốn đặt cược một
    // video 4 giờ vào một chuỗi chưa kiểm chứng. Thử lại vô điều kiện vẫn rẻ vì job con tự dừng sớm: lỗi
    // do mã đã đánh video ERROR ở lần đầu nên các lần sau thấy video không còn PROCESSING và thoát ngay;
    // còn tiến trình bị giết (Spot thu hồi, hết bộ nhớ) không kịp đánh ERROR nên lần sau làm tiếp.
    childRetryAttempts: Math.floor(positiveNumber(process.env.CHUNK_JOB_ATTEMPTS, 3)),
    // Timeout cho job âm thanh và job ghép (giây): chạy lâu hơn job đoạn nhiều lần ở video rất dài.
    longJobTimeoutSeconds: 6 * 3600,
  },

  // FFmpeg Settings
  ffmpeg: {
    segmentDuration: 6, // seconds per HLS segment
    thumbnailTime: 5,   // extract thumbnail at this second

    // Video dài hơn ngưỡng này (giây), hoặc không đọc được thời lượng, chỉ nhận
    // thang cũ 360p/720p/1080p thay vì cả sáu mức.
    //
    // Một job là một container, một FFmpeg, mã hoá tuần tự nên thời gian tăng
    // tuyến tính theo độ dài: đo trên Fargate 1 vCPU, video 26,7 phút mất 5.917 s
    // (hệ số 3,7) với thang cũ, trong khi job bị dừng ở 7.200 s
    // (docs/results/transcode-timing.json). Ba mức thêm vào làm thời gian tăng
    // thêm ~40% (đo cục bộ), nên với video dài chúng đẩy job qua giới hạn thay
    // vì chỉ làm nó chậm hơn. Ngưỡng 20 phút giữ nguyên khả năng xử lý hiện có
    // của video dài; video ngắn vẫn nhận đủ sáu mức. Bước tới sẽ chuyển mã song
    // song theo đoạn, khi đó mức thấp quay lại cho mọi độ dài và ngưỡng này bỏ.
    fullLadderMaxSeconds: Math.floor(positiveNumber(process.env.FULL_LADDER_MAX_SECONDS, 1200)),
    longVideoRenditions: ['360p', '720p', '1080p'],

    // Ngân sách thời gian (giây) cho riêng bước FFmpeg của một job.
    //
    // Job Batch bị dừng ở attempt_duration_seconds = 7200 (modules/batch/main.tf)
    // và hết timeout thì KHÔNG được thử lại, còn video nằm ở PROCESSING cho tới
    // khi bộ đối soát đánh ERROR sau 6 giờ. Video quá dài vì thế treo 2 giờ rồi
    // mới báo lỗi. Rào chắn dưới đây đo tốc độ thật của FFmpeg và bỏ cuộc sớm khi
    // chắc chắn không kịp. 6300 = 7200 trừ 900 giây cho tải tệp nguồn, kiểm
    // duyệt, upload và thumbnail. Đổi timeout của job thì phải đổi số này
    // (biến môi trường MAX_ENCODE_SECONDS).
    maxEncodeSeconds: Math.floor(positiveNumber(process.env.MAX_ENCODE_SECONDS, 6300)),
    encodeGuard: {
      // Tốc độ đo trong lúc khởi động và đoạn đầu thiếu đại diện: chỉ đánh giá
      // sau chừng này giây chạy và chừng này giây video đã mã hoá.
      warmupSeconds: 180,
      minPositionSeconds: 60,
      // Chỉ bỏ cuộc khi thời gian dự kiến vượt ngân sách quá 25%, và phải vượt
      // liên tục chừng này giây: tốc độ đổi theo độ phức tạp của cảnh, còn bỏ
      // cuộc nhầm thì mất video, đắt hơn nhiều so với việc chờ thêm.
      margin: 1.25,
      sustainSeconds: 30,
    },
    // Thang chất lượng, xếp TĂNG DẦN: thứ tự này quyết định thứ tự trong
    // master.m3u8 và việc mức nào bị bỏ khi chạm trần kích thước nguồn
    // (planRenditions). Ba mức 360p/720p/1080p là thang cũ, giữ nguyên từng con
    // số để video mới không đổi chất lượng ở các mức đó.
    //
    // 144p/240p/480p thêm sau cho mạng yếu và màn hình nhỏ. Bitrate lấy theo
    // cùng đường cong với ba mức cũ (~0,055-0,065 bit/điểm ảnh/khung ở 30 fps)
    // và để tổng bitrate hai mức liền kề cách nhau 1,5-2 lần như Apple khuyến
    // nghị (TN2224): 168 → 304 → 464 → 846 → 1628 kbps. Chỗ hở 1628 → 4192
    // (2,6 lần) giữa 720p và 1080p có từ thang cũ, chưa đổi.
    renditions: [
      {
        name: '144p',
        width: 256,
        height: 144,
        videoBitrate: '120k',
        audioBitrate: '48k',
        maxrate: '150k',
        bufsize: '240k',
      },
      {
        name: '240p',
        width: 426,
        height: 240,
        videoBitrate: '240k',
        audioBitrate: '64k',
        maxrate: '300k',
        bufsize: '480k',
      },
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
        name: '480p',
        width: 854,
        height: 480,
        videoBitrate: '750k',
        audioBitrate: '96k',
        maxrate: '1000k',
        bufsize: '1500k',
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
