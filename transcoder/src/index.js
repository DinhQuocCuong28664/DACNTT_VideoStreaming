const fs = require('fs');
const path = require('path');
const os = require('os');
const config = require('./config');
const { transcodeToHLS } = require('./transcoder');
const { downloadFromS3, uploadDirectoryToS3 } = require('./s3Handler');
const {
  connectDB,
  disconnectDB,
  updateVideoReady,
  updateVideoError,
  getVideo,
  getVideoWithUser,
} = require('./dbHandler');
const { pollMessages, parseS3Event, startHeartbeat, deleteMessage } = require('./sqsHandler');
const { sendVideoReadyEmail, sendVideoFailedEmail } = require('./emailService');

/**
 * Gửi email thông báo mà không bao giờ làm crash job chính.
 *
 * Việc transcode/ghi DB đã hoàn tất (thành công hay thất bại) tại thời điểm
 * gọi hàm này — một lỗi SMTP (sai mật khẩu app, mất mạng...) không được phép
 * biến một job transcode ĐÃ THÀNH CÔNG thành một job bị coi là lỗi.
 */
const notifySafely = async (sendFn, to, payload, label) => {
  if (!to) {
    console.warn(`⚠️  Could not send the ${label} email: the video has no valid recipient address.`);
    return;
  }
  try {
    await sendFn(to, payload);
    console.log(`📧 Sent the ${label} email to ${to}`);
  } catch (err) {
    console.error(`⚠️  Sending the ${label} email failed (this does not affect the transcode result):`, err.message);
  }
};

/**
 * ════════════════════════════════════════
 * DACNTT Video Transcoder — Entry Point
 * ════════════════════════════════════════
 *
 * Usage:
 *   node src/index.js manual <videoId>   — Transcode a single video by ID (dev/test)
 *   node src/index.js worker             — Poll SQS and process messages continuously
 *   node src/index.js batch              — Read VIDEO_ID + RAW_S3_KEY from env (AWS Batch mode)
 */

const TEMP_DIR = path.join(os.tmpdir(), 'vidshare-transcoder');

/**
 * Main transcoding pipeline for a single video
 */
const processVideo = async (videoId, rawS3Key) => {
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
  const existingVideo = await getVideo(videoId);
  if (existingVideo && existingVideo.status === 'READY') {
    console.warn(
      `⚠️  Video ${videoId} is already READY; skipping the duplicate job without downloading or transcoding again.`
    );
    return;
  }

  try {
    // Step 1: Create work directories
    fs.mkdirSync(path.join(workDir, 'input'), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });

    // Step 2: Download raw video from S3
    await downloadFromS3(config.s3RawBucket, rawS3Key, inputPath);

    // Step 3: Transcode to HLS (360p / 720p / 1080p)
    const { duration } = await transcodeToHLS(inputPath, outputDir);

    // Step 4: Upload HLS output to S3 Processed Bucket
    const s3Prefix = `videos/${videoId}`;
    await uploadDirectoryToS3(outputDir, config.s3ProcessedBucket, s3Prefix);

    // Step 5: Update MongoDB — status → READY
    const hlsUrl = config.getPublicUrl(`${s3Prefix}/master.m3u8`);
    const thumbnailUrl = config.getPublicUrl(`${s3Prefix}/thumbnail.jpg`);

    const { updated } = await updateVideoReady(videoId, { hlsUrl, thumbnailUrl, duration });

    const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n🎉 ════════════════════════════════════════`);
    console.log(`   Video ${videoId} READY in ${totalTime}s`);
    console.log(`   HLS URL: ${hlsUrl}`);
    console.log(`════════════════════════════════════════\n`);

    // Chỉ gửi email khi CHÍNH job này thắng cuộc ghi READY — nếu đây là job
    // trùng lặp bị chặn ghi (updated=false), job thắng cuộc đã/sẽ tự gửi rồi,
    // gửi thêm ở đây sẽ khiến người dùng nhận email trùng.
    if (updated) {
      const videoWithUser = await getVideoWithUser(videoId);
      await notifySafely(
        sendVideoReadyEmail,
        videoWithUser?.user?.email,
        {
          title: videoWithUser?.title,
          videoId,
          displayName: videoWithUser?.user?.displayName || videoWithUser?.user?.username,
        },
        'video ready'
      );
    }
  } catch (err) {
    console.error(`❌ Transcoding failed for ${videoId}:`, err.message);
    const { updated } = await updateVideoError(videoId, err.message);

    if (updated) {
      const videoWithUser = await getVideoWithUser(videoId);
      await notifySafely(
        sendVideoFailedEmail,
        videoWithUser?.user?.email,
        {
          title: videoWithUser?.title,
          displayName: videoWithUser?.user?.displayName || videoWithUser?.user?.username,
        },
        'video failed'
      );
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
 * Usage: node src/index.js manual <videoId>
 */
const runManual = async (videoId) => {
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
  await processVideo(videoId, video.rawS3Key);

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
  await processVideo(videoId, rawS3Key);
  await disconnectDB();
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
          console.error('Usage: node src/index.js manual <videoId>');
          process.exit(1);
        }
        await runManual(videoId);
        break;
      }
      case 'worker':
        await runWorker();
        break;
      case 'batch':
        await runBatch();
        break;
      default:
        console.error(`Unknown mode: ${mode}`);
        console.error('Available modes: manual, worker, batch');
        process.exit(1);
    }
  } catch (err) {
    console.error('\n💀 Fatal error:', err.message);
    process.exit(1);
  }
};

main();
