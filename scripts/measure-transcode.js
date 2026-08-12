/**
 * ═══════════════════════════════════════════════════
 * Đo hiệu năng Transcoding Pipeline (Mục 12)
 *
 * Chỉ số đo: tổng thời gian từ lúc tệp video gốc được tải lên hoàn tất cho tới
 * khi video chuyển sang trạng thái READY, tức là thời điểm người dùng thực sự
 * có thể xem được. Khoảng thời gian này bao gồm toàn bộ chuỗi sự kiện của kiến
 * trúc Event-Driven: độ trễ phát sự kiện S3, thời gian chờ trong hàng đợi SQS,
 * thời gian khởi tạo container trên AWS Batch/Fargate (cold start), thời gian
 * FFmpeg chuyển mã, và thời gian tải kết quả lên S3.
 *
 * Việc tách riêng các chặng này rất quan trọng: nếu chỉ đo thời gian FFmpeg
 * thuần túy, báo cáo sẽ bỏ sót phần chi phí khởi tạo container — vốn là nhược
 * điểm cố hữu của kiến trúc Serverless Container và cần được nêu trung thực.
 *
 * Kết quả ghi ra docs/results/transcode-timing.json
 * ═══════════════════════════════════════════════════
 *
 * Cách dùng:
 *   node scripts/measure-transcode.js <đường dẫn video> [nhãn]
 *
 * Biến môi trường bắt buộc:
 *   API_URL    — địa chỉ Backend API, ví dụ https://api.zelostech.site/api
 *   JWT_TOKEN  — token của tài khoản dùng để tải lên
 */

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

const API_URL = process.env.API_URL || 'http://localhost:5000/api';
const JWT_TOKEN = process.env.JWT_TOKEN;
const RESULTS_DIR = path.join(__dirname, '..', 'docs', 'results');

/** Khoảng thời gian giữa hai lần hỏi trạng thái video */
const POLL_INTERVAL_MS = 3000;
/**
 * Thời gian chờ tối đa trước khi coi là thất bại.
 *
 * Số liệu đo thực tế cho thấy realtime factor (thời gian xử lý / thời lượng
 * video) dao động 2.9x–4.5x tùy tải Fargate Spot tại thời điểm đó. Một video
 * 10 phút từng mất tới 38 phút để xử lý xong dù pipeline hoàn toàn thành công
 * — nếu chỉ đợi 30 phút, script sẽ báo timeout giả trong khi job vẫn đang
 * chạy đúng. Mặc định nâng lên 3 giờ để đủ margin an toàn cho cả video 1GB
 * (~25 phút gốc, có thể mất hơn 100 phút để xử lý). Có thể ghi đè qua biến
 * môi trường POLL_TIMEOUT_MINUTES nếu cần.
 */
const POLL_TIMEOUT_MS = (Number(process.env.POLL_TIMEOUT_MINUTES) || 180) * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const authHeaders = () => ({
  Authorization: `Bearer ${JWT_TOKEN}`,
  'Content-Type': 'application/json',
});

/** Bước 1: xin Pre-signed URL và tạo bản ghi video */
async function initiateUpload(filename, fileSize) {
  const res = await fetch(`${API_URL}/videos/initiate-upload`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      title: `Benchmark ${filename} — ${new Date().toISOString()}`,
      description: 'Video dùng để đo hiệu năng transcoding pipeline',
      filename,
      mimetype: 'video/mp4',
      fileSize,
      visibility: 'private',
    }),
  });

  if (!res.ok) {
    throw new Error(`initiate-upload thất bại: HTTP ${res.status} — ${await res.text()}`);
  }

  const body = await res.json();
  return { videoId: body.data.video._id, uploadUrl: body.data.uploadUrl };
}

/**
 * Xác nhận upload hoàn tất — chuyển trạng thái UPLOADING → PROCESSING.
 *
 * Đây chỉ là bước cập nhật trạng thái phục vụ hiển thị trên giao diện; pipeline
 * chuyển mã được kích hoạt độc lập bởi S3 Event Notification, không phụ thuộc
 * lệnh gọi này. Script vẫn gọi để mô phỏng đúng luồng mà trình duyệt thật thực
 * hiện (xem `frontend/src/components/Video/VideoUpload.jsx`).
 */
async function confirmUpload(videoId) {
  const res = await fetch(`${API_URL}/videos/${videoId}/confirm-upload`, {
    method: 'PATCH',
    headers: authHeaders(),
  });

  if (!res.ok) {
    throw new Error(`confirm-upload thất bại: HTTP ${res.status} — ${await res.text()}`);
  }
}

/** Bước 2: tải tệp trực tiếp lên S3 qua Pre-signed URL */
async function uploadToS3(uploadUrl, filePath) {
  const fileBuffer = fs.readFileSync(filePath);

  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'video/mp4' },
    body: fileBuffer,
  });

  if (!res.ok) {
    throw new Error(`Tải lên S3 thất bại: HTTP ${res.status}`);
  }
}

/**
 * Số lần cho phép lỗi mạng liên tiếp trước khi thực sự bỏ cuộc.
 * Pipeline chuyển mã chạy hoàn toàn phía server (SQS/Lambda/Batch), không phụ
 * thuộc kết nối của máy chạy script này. Một lần rớt mạng tạm thời (WiFi chập
 * chờn, laptop sleep...) không có nghĩa là job đã hỏng — chỉ là máy client mất
 * kết nối tới Backend API để hỏi thăm trạng thái. Vì vậy lỗi mạng khi poll
 * được thử lại thay vì làm sập toàn bộ phép đo.
 */
const MAX_CONSECUTIVE_NETWORK_ERRORS = 20;

/** Bước 3: theo dõi trạng thái cho tới khi READY hoặc ERROR */
async function waitUntilReady(videoId, startedAt) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastStatus = null;
  const transitions = [];
  let consecutiveNetworkErrors = 0;

  while (Date.now() < deadline) {
    let res;
    try {
      res = await fetch(`${API_URL}/videos/${videoId}`, { headers: authHeaders() });
      consecutiveNetworkErrors = 0;
    } catch (err) {
      consecutiveNetworkErrors += 1;
      console.warn(
        `  ⚠️  Mất kết nối khi hỏi trạng thái (${err.message}). ` +
          `Job vẫn chạy trên server, đang thử lại... (${consecutiveNetworkErrors}/${MAX_CONSECUTIVE_NETWORK_ERRORS})`
      );

      if (consecutiveNetworkErrors >= MAX_CONSECUTIVE_NETWORK_ERRORS) {
        throw new Error(
          `Mất kết nối mạng liên tục ${MAX_CONSECUTIVE_NETWORK_ERRORS} lần khi đang hỏi trạng thái. ` +
            `Job có thể vẫn đang chạy trên AWS Batch — kiểm tra thủ công bằng ` +
            `'aws batch list-jobs --job-queue <queue> --job-status RUNNING' trước khi coi là thất bại.`
        );
      }

      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    if (res.ok) {
      const body = await res.json();
      const status = body.data.video.status;

      if (status !== lastStatus) {
        const elapsedMs = performance.now() - startedAt;
        transitions.push({ status, elapsedSec: Number((elapsedMs / 1000).toFixed(2)) });
        console.log(`  → ${status} sau ${(elapsedMs / 1000).toFixed(2)} giây`);
        lastStatus = status;
      }

      if (status === 'READY') {
        return { status, transitions, video: body.data.video };
      }

      if (status === 'ERROR') {
        return { status, transitions, video: body.data.video };
      }
    } else {
      // Log lỗi HTTP không mong đợi (ví dụ 401 do token hết hạn, hay 500)
      // thay vì âm thầm bỏ qua như trước đây — giúp chẩn đoán sự cố thật mà
      // không cần tra cứu AWS thủ công.
      console.warn(`  ⚠️  API trả về HTTP ${res.status} khi hỏi trạng thái, đang thử lại...`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(`Hết thời gian chờ ${POLL_TIMEOUT_MS / 60000} phút mà video chưa READY`);
}

async function measure(filePath, label) {
  if (!JWT_TOKEN) {
    console.error('❌ Thiếu biến môi trường JWT_TOKEN.');
    console.error('   PowerShell : $env:JWT_TOKEN="ey..."');
    console.error('   Bash       : export JWT_TOKEN="ey..."');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Không tìm thấy tệp: ${filePath}`);
    process.exit(1);
  }

  const stats = fs.statSync(filePath);
  const filename = path.basename(filePath);
  const sizeMB = stats.size / (1024 * 1024);

  console.log('═══════════════════════════════════════════════════');
  console.log('  ĐO HIỆU NĂNG TRANSCODING PIPELINE');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Tệp        : ${filename}`);
  console.log(`  Dung lượng : ${sizeMB.toFixed(1)} MB`);
  console.log(`  Nhãn       : ${label || '(không đặt)'}`);
  console.log('');

  const t0 = performance.now();

  console.log('  Bước 1/3: Xin Pre-signed URL…');
  const { videoId, uploadUrl } = await initiateUpload(filename, stats.size);
  const tInitiate = performance.now();
  console.log(`  → videoId = ${videoId} (${((tInitiate - t0) / 1000).toFixed(2)} giây)`);

  console.log('  Bước 2/3: Tải tệp lên Amazon S3…');
  await uploadToS3(uploadUrl, filePath);
  const tUploaded = performance.now();
  const uploadSec = (tUploaded - tInitiate) / 1000;
  console.log(`  → Hoàn tất sau ${uploadSec.toFixed(2)} giây (${(sizeMB / uploadSec).toFixed(2)} MB/s)`);

  await confirmUpload(videoId);

  console.log('  Bước 3/3: Chờ pipeline chuyển mã…');
  // Mốc thời gian bắt đầu tính là lúc tải lên xong, đúng theo định nghĩa của
  // Mục 12: "từ khi video được tải lên hoàn tất đến khi video sẵn sàng để xem".
  const result = await waitUntilReady(videoId, tUploaded);
  const tReady = performance.now();

  const pipelineSec = (tReady - tUploaded) / 1000;
  const totalSec = (tReady - t0) / 1000;

  const report = {
    measuredAt: new Date().toISOString(),
    label: label || null,
    file: {
      name: filename,
      sizeBytes: stats.size,
      sizeMB: Number(sizeMB.toFixed(2)),
    },
    videoId,
    finalStatus: result.status,
    timings: {
      initiateUploadSec: Number(((tInitiate - t0) / 1000).toFixed(2)),
      s3UploadSec: Number(uploadSec.toFixed(2)),
      uploadThroughputMBps: Number((sizeMB / uploadSec).toFixed(2)),
      // Chỉ số chính theo yêu cầu Mục 12
      transcodePipelineSec: Number(pipelineSec.toFixed(2)),
      endToEndSec: Number(totalSec.toFixed(2)),
    },
    statusTransitions: result.transitions,
    videoDurationSec: result.video?.duration || null,
    // Tỷ số giữa thời gian xử lý và thời lượng video: nhỏ hơn 1 nghĩa là hệ
    // thống chuyển mã nhanh hơn thời gian thực (realtime factor).
    realtimeFactor:
      result.video?.duration > 0
        ? Number((pipelineSec / result.video.duration).toFixed(3))
        : null,
  };

  console.log('\n───────────────────────────────────────────────────');
  console.log('  KẾT QUẢ');
  console.log('───────────────────────────────────────────────────');
  console.log(`  Tải lên S3            : ${report.timings.s3UploadSec} giây`);
  console.log(`  Chuyển mã (pipeline)  : ${report.timings.transcodePipelineSec} giây`);
  console.log(`  Tổng end-to-end       : ${report.timings.endToEndSec} giây`);
  if (report.realtimeFactor !== null) {
    console.log(`  Hệ số thời gian thực  : ${report.realtimeFactor}× (thời lượng video ${report.videoDurationSec}s)`);
  }

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outputPath = path.join(RESULTS_DIR, 'transcode-timing.json');

  // Ghi nối tiếp vào tệp để tích lũy kết quả của cả ba mốc 100 MB, 500 MB, 1 GB
  let existing = [];
  if (fs.existsSync(outputPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
      existing = Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      console.warn('  ⚠️ Không đọc được kết quả cũ, sẽ tạo tệp mới.');
    }
  }
  existing.push(report);
  fs.writeFileSync(outputPath, JSON.stringify(existing, null, 2), 'utf8');

  console.log(`\n✅ Đã ghi kết quả vào ${path.relative(process.cwd(), outputPath)}`);
  console.log(`   (tệp hiện có ${existing.length} phép đo)`);

  if (result.status === 'ERROR') {
    console.error('\n❌ Video kết thúc ở trạng thái ERROR — pipeline chuyển mã thất bại.');
    process.exitCode = 1;
  }

  return report;
}

if (require.main === module) {
  const filePath = process.argv[2];
  const label = process.argv[3];

  if (!filePath) {
    console.error('Thiếu tham số bắt buộc.\n');
    console.error('Cách dùng: node scripts/measure-transcode.js <đường dẫn video> [nhãn]');
    console.error('Ví dụ   : node scripts/measure-transcode.js ./samples/video-100mb.mp4 "100MB"');
    process.exit(1);
  }

  measure(filePath, label).catch((err) => {
    console.error(`\n❌ Lỗi: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { measure };
