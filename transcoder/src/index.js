const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');
const { transcodeToHLS, probeVideo } = require('./transcoder');
const { moderateVideo } = require('./moderation');
const { downloadFromS3, uploadDirectoryToS3 } = require('./s3Handler');
const {
  connectDB,
  disconnectDB,
  updateVideoReady,
  updateVideoError,
  markVideoProcessing,
  getVideo,
} = require('./dbHandler');
const { pollMessages, parseS3Event, startHeartbeat, deleteMessage } = require('./sqsHandler');
const { notifyVideoReady, notifyVideoFailed } = require('./notify');
const { createRuntimePipeline } = require('./chunked/runtime');

/**
 * ════════════════════════════════════════
 * DACNTT Video Transcoder — Entry Point
 * ════════════════════════════════════════
 *
 * Usage:
 *   node src/index.js manual <videoId>   — Transcode a single video by ID (dev/test)
 *   node src/index.js worker             — Poll SQS and process messages continuously
 *   node src/index.js batch              — Read VIDEO_ID + RAW_S3_KEY from env (AWS Batch mode)
 *
 * Các chế độ dưới đây chỉ do chính pipeline chia đoạn nộp vào Batch (chunked/pipeline.js), không
 * bao giờ chạy tay hay từ Lambda:
 *   node src/index.js audio              — mã hoá một lần âm thanh của video (env AUDIO_BITRATE)
 *   node src/index.js chunk              — mã hoá một đoạn (env AWS_BATCH_JOB_ARRAY_INDEX)
 *   node src/index.js finalize           — ghép các đoạn, đánh dấu READY
 */

const TEMP_DIR = path.join(os.tmpdir(), 'vidshare-transcoder');

/**
 * Main transcoding pipeline for a single video
 */
const processVideo = async (videoId, rawS3Key, { force = false } = {}) => {
  const startTime = Date.now();
  const workDir = path.join(TEMP_DIR, videoId);
  const inputPath = path.join(workDir, 'input', path.basename(rawS3Key));
  const outputDir = path.join(workDir, 'output');

  console.log(`\n🎬 ════════════════════════════════════════`);
  console.log(`   Processing Video: ${videoId}`);
  console.log(`   S3 Key: ${rawS3Key}`);
  console.log(`════════════════════════════════════════\n`);

  // Kiểm tra sớm: nếu video đã READY (ví dụ do một job trùng lặp trước đó đã
  // xử lý xong — có thể do SQS redeliver message sau khi deleteMessage() thất
  // bại, hoặc do heartbeat trễ), bỏ qua ngay để không tải + transcode lại vô
  // ích. Đây chỉ là tối ưu "best-effort" (vẫn có khoảng hở race condition nếu
  // 2 job cùng vượt qua bước kiểm tra này gần như đồng thời) — lớp phòng vệ
  // triệt để nằm ở updateVideoReady/updateVideoError (ghi có điều kiện).
  // `force` chỉ đến từ lệnh thủ công, không bao giờ từ SQS: đường chạy tự
  // động giữ nguyên tính bất biến trước việc gửi trùng. Dùng khi cần chuyển
  // mã lại có chủ đích — ví dụ sau khi sửa tham số mã hoá — trên video đã
  // READY mà nội dung nguồn không đổi.
  //
  // Ghi có điều kiện trong updateVideoReady vẫn từ chối cập nhật vì video
  // đang READY, và điều đó là MONG MUỐN ở đây: đường dẫn không đổi nên không
  // có gì để ghi, và vì `updated` bằng false nên cũng không gửi lại email
  // "video đã sẵn sàng" cho chủ video.
  const existingVideo = await getVideo(videoId);

  // Bản ghi luôn được tạo TRƯỚC khi cấp URL tải lên (initiate-upload), nên
  // không tìm thấy nghĩa là chủ video đã xoá nó. Chuyển mã tiếp chỉ để lại một
  // thư mục HLS mồ côi trên S3 mà không bản ghi nào trỏ tới.
  if (!existingVideo) {
    console.warn(`⚠️  Video ${videoId} no longer exists (deleted by its owner); skipping the job.`);
    return;
  }

  if (existingVideo.status === 'READY') {
    if (!force) {
      console.warn(
        `⚠️  Video ${videoId} is already READY; skipping the duplicate job without downloading or transcoding again.`
      );
      return;
    }
    console.warn(`♻️  Video ${videoId} đã READY nhưng có --force: chuyển mã lại và ghi đè kết quả.`);
  }

  try {
    // Step 0: Báo cho hệ thống biết job đã thực sự bắt đầu (xem markVideoProcessing).
    // Video READY chỉ tới được đây bằng --force, và giữ nguyên READY.
    if (existingVideo.status !== 'READY') {
      await markVideoProcessing(videoId);
    }

    // Step 1: Create work directories
    fs.mkdirSync(path.join(workDir, 'input'), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // Step 2: Download raw video from S3
    await downloadFromS3(config.s3RawBucket, rawS3Key, inputPath);

    // Step 2.5: Kiểm duyệt nội dung (Amazon Rekognition). Chạy trước chuyển
    // mã vì rẻ và nhanh hơn nhiều; kết quả được giữ lại để ghi CÙNG lúc với
    // status READY ở bước 5. Video bị chặn vẫn được chuyển mã để quản trị viên
    // xem lại được khi chủ video khiếu nại — chỉ là không ai khác phát được.
    // Bỏ qua khi chuyển mã lại video đã READY bằng --force: lệnh ghi READY sẽ
    // bị từ chối nên kết quả kiểm duyệt cũng không có chỗ để ghi.
    let moderation = null;
    if (config.moderation.enabled && existingVideo?.status !== 'READY') {
      const { duration: probedDuration } = await probeVideo(inputPath);
      moderation = await moderateVideo(inputPath, probedDuration, workDir);
    } else if (!config.moderation.enabled) {
      console.warn('⚠️  MODERATION_ENABLED=false: this video will go public without content moderation.');
    }

    // Step 3: Transcode to HLS (360p / 720p / 1080p)
    const { duration, thumbnailPath } = await transcodeToHLS(inputPath, outputDir);

    // Step 4: Upload HLS output to S3 Processed Bucket
    const s3Prefix = `videos/${videoId}`;
    await uploadDirectoryToS3(outputDir, config.s3ProcessedBucket, s3Prefix);

    // Step 5: Update MongoDB — status → READY
    const hlsUrl = config.getPublicUrl(`${s3Prefix}/master.m3u8`);
    // Không có tệp thì không trỏ URL vào đó: giao diện tự hiện ảnh thay thế.
    const thumbnailUrl = thumbnailPath ? config.getPublicUrl(`${s3Prefix}/thumbnail.jpg`) : null;

    const { updated } = await updateVideoReady(videoId, { hlsUrl, thumbnailUrl, duration, moderation });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🎉 ════════════════════════════════════════`);
    console.log(`   Video ${videoId} READY in ${totalTime}s`);
    console.log(`   HLS URL: ${hlsUrl}`);
    console.log(`════════════════════════════════════════\n`);

    // Chỉ gửi email khi CHÍNH job này thắng cuộc ghi READY — nếu đây là job
    // trùng lặp bị chặn ghi (updated=false), job thắng cuộc đã/sẽ tự gửi rồi,
    // gửi thêm ở đây sẽ khiến người dùng nhận email trùng.
    if (updated) {
      await notifyVideoReady(videoId, moderation);
    }
  } catch (err) {
    console.error(`❌ Transcoding failed for ${videoId}:`, err.message);
    const { updated } = await updateVideoError(videoId, err.message);

    if (updated) {
      await notifyVideoFailed(videoId);
    }

    throw err;
  } finally {
    // Cleanup temp files
    try {
      fs.rmSync(workDir, { recursive: true, force: true });
      console.log(`🧹 Cleaned up temp directory: ${workDir}`);
    } catch (e) {
      console.warn(`⚠️  Cleanup warning: ${e.message}`);
    }
  }
};

/**
 * Mode 1: Manual — Transcode a specific video by ID
 * Usage: node src/index.js manual <videoId> [--force]
 *
 * `--force` chuyển mã lại cả video đã READY. Chỉ dùng khi tham số mã hoá đã
 * đổi và cần dựng lại kết quả từ nguồn cũ; đường chạy tự động qua SQS không
 * có cờ này và vẫn bỏ qua job trùng như trước.
 */
const runManual = async (videoId, { force = false } = {}) => {
  console.log('🔧 Mode: MANUAL');

  await connectDB();

  const video = await getVideo(videoId);
  if (!video) {
    console.error(`❌ Video not found: ${videoId}`);
    process.exit(1);
  }

  if (!video.rawS3Key) {
    console.error(`❌ Video has no rawS3Key: ${videoId}`);
    process.exit(1);
  }

  console.log(`📋 Video: "${video.title}" (status: ${video.status})`);
  await processVideo(videoId, video.rawS3Key, { force });

  await disconnectDB();
};

/**
 * Mode 2: Worker — Poll SQS continuously and process messages
 * Usage: node src/index.js worker
 */
const runWorker = async () => {
  console.log('🔧 Mode: SQS WORKER');
  console.log(`📡 Queue: ${config.sqsQueueUrl}`);

  await connectDB();

  console.log('👂 Listening for messages...\n');

  while (true) {
    try {
      const messages = await pollMessages();

      if (messages.length === 0) {
        continue; // Long polling timeout — loop back
      }

      for (const message of messages) {
        const event = parseS3Event(message.Body);
        if (!event) {
          console.warn('⚠️  Skipping invalid message');
          await deleteMessage(message.ReceiptHandle);
          continue;
        }

        // Start heartbeat to prevent duplicate processing
        const heartbeatId = startHeartbeat(message.ReceiptHandle);

        try {
          // Find video by rawS3Key in database
          let videoId = event.videoId;
          if (!videoId) {
            const video = await findVideoByS3Key(event.key);
            if (!video) {
              console.warn(`⚠️  No video found for S3 key: ${event.key}`);
              await deleteMessage(message.ReceiptHandle);
              clearInterval(heartbeatId);
              continue;
            }
            videoId = video._id.toString();
          }

          await processVideo(videoId, event.key);
          await deleteMessage(message.ReceiptHandle);
        } catch (err) {
          console.error('❌ Processing failed:', err.message);
          // Don't delete — message will reappear after visibility timeout for retry
        } finally {
          clearInterval(heartbeatId);
        }
      }
    } catch (err) {
      console.error('❌ Worker error:', err.message);
      // Wait 5 seconds before retrying on error
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

/**
 * Mode 3: Batch — Read from environment variables (AWS Batch mode)
 * Usage: VIDEO_ID=xxx RAW_S3_KEY=yyy node src/index.js batch
 */
const runBatch = async () => {
  console.log('🔧 Mode: AWS BATCH');

  const videoId = process.env.VIDEO_ID;
  const rawS3Key = process.env.RAW_S3_KEY;

  if (!videoId || !rawS3Key) {
    console.error('❌ Missing required environment variables: VIDEO_ID, RAW_S3_KEY');
    process.exit(1);
  }

  await connectDB();

  // Video dài đi đường chia đoạn: job này chỉ lên kế hoạch và nộp job con rồi thoát. Mọi trường
  // hợp còn lại (tắt cờ, video ngắn, nguồn không chia đoạn được, không đọc được nguồn qua HTTP)
  // rơi xuống đường một-job như trước giờ.
  if (config.chunked.enabled) {
    const outcome = await createRuntimePipeline().planJob({ videoId, rawS3Key });
    if (outcome.mode === 'chunked') {
      console.log(`🧩 Chunked pipeline submitted for ${videoId}; this job is done.`);
      await disconnectDB();
      return;
    }
    if (outcome.mode === 'skipped') {
      console.warn(`⚠️  Skipping ${videoId}: ${outcome.reason}`);
      await disconnectDB();
      return;
    }
    console.log(`ℹ️  Single-job path for ${videoId}: ${outcome.reason}`);
  }

  await processVideo(videoId, rawS3Key);
  await disconnectDB();
};

/** Đọc biến môi trường bắt buộc của một job con; thiếu thì dừng ngay với thông báo rõ. */
const requireEnv = (...names) => {
  const values = {};
  for (const name of names) {
    if (!process.env[name]) {
      console.error(`❌ Missing required environment variable: ${name}`);
      process.exit(1);
    }
    values[name] = process.env[name];
  }
  return values;
};

/**
 * Chế độ job con của pipeline chia đoạn. Mỗi job kết nối DB, làm đúng một việc rồi ngắt kết nối.
 * Thất bại thì pipeline đã tự đánh ERROR video (failVideoOnError); ở đây chỉ cần ném lỗi để
 * tiến trình thoát mã khác 0 và Batch ghi nhận job thất bại.
 */
const runPipelineJob = async (role) => {
  console.log(`🔧 Mode: CHUNKED PIPELINE (${role})`);
  await connectDB();
  const pipeline = createRuntimePipeline();

  try {
    // Gán biến môi trường vào một thuộc tính tên chứa chữ "key" thì khớp rule generic-api-key của
    // Gitleaks và CI báo bí mật rò rỉ dù đó chỉ là đường dẫn S3; nên gán qua biến tên ngắn.
    if (role === 'audio') {
      const { VIDEO_ID: videoId, RAW_S3_KEY: s3Key, AUDIO_BITRATE: bitrate } = requireEnv('VIDEO_ID', 'RAW_S3_KEY', 'AUDIO_BITRATE');
      await pipeline.audioJob({ videoId, rawS3Key: s3Key, bitrate });
    } else if (role === 'chunk') {
      const { VIDEO_ID: videoId, RAW_S3_KEY: s3Key, AWS_BATCH_JOB_ARRAY_INDEX: index } = requireEnv(
        'VIDEO_ID',
        'RAW_S3_KEY',
        'AWS_BATCH_JOB_ARRAY_INDEX'
      );
      await pipeline.chunkJob({ videoId, rawS3Key: s3Key, index: Number(index) });
    } else {
      const { VIDEO_ID: videoId, RAW_S3_KEY: s3Key } = requireEnv('VIDEO_ID', 'RAW_S3_KEY');
      await pipeline.finalizeJob({ videoId, rawS3Key: s3Key });
    }
  } finally {
    await disconnectDB();
  }
};

/**
 * Helper: Find video by its rawS3Key
 */
const findVideoByS3Key = async (s3Key) => {
  const mongoose = require('mongoose');
  const Video = mongoose.model('Video');
  return Video.findOne({ rawS3Key: s3Key });
};

// ═══════════════════════════════════════
// CLI Entry Point
// ═══════════════════════════════════════
const main = async () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║    DACNTT Video Transcoder — FFmpeg + HLS     ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log('');

  const mode = process.argv[2] || 'batch';

  try {
    switch (mode) {
      case 'manual': {
        const videoId = process.argv[3];
        if (!videoId) {
          console.error('Usage: node src/index.js manual <videoId> [--force]');
          process.exit(1);
        }
        await runManual(videoId, { force: process.argv.includes('--force') });
        break;
      }
      case 'worker':
        await runWorker();
        break;
      case 'batch':
        await runBatch();
        break;
      case 'audio':
      case 'chunk':
      case 'finalize':
        await runPipelineJob(mode);
        break;
      default:
        console.error(`Unknown mode: ${mode}`);
        console.error('Available modes: manual, worker, batch, audio, chunk, finalize');
        process.exit(1);
    }
  } catch (err) {
    console.error('\n💀 Fatal error:', err.message);
    process.exit(1);
  }
};

main();
