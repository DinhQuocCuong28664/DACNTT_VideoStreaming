const Video = require('../models/Video');
const s3Service = require('./s3Service');

/**
 * Đối soát video kẹt ở trạng thái trung gian.
 *
 * Hai lỗ hổng mà không đường nào khác vá được:
 *
 * 1. PROCESSING mãi mãi. Transcoder chỉ tự ghi ERROR khi code của nó còn chạy
 *    tới khối catch. Job bị Batch giết vì quá timeout, container hết bộ nhớ,
 *    hay Spot bị thu hồi quá số lần thử lại thì không ai ghi gì cả: sự kiện
 *    FAILED trên EventBridge chỉ gửi email cho quản trị viên
 *    (modules/monitoring/main.tf), và chủ video thấy "đang xử lý" vĩnh viễn.
 *
 * 2. UPLOADING bỏ dở. Bản ghi được tạo trước khi cấp URL tải lên; người dùng
 *    đóng tab giữa chừng thì bản ghi nháp ở lại mãi, vì trình duyệt không còn
 *    cơ hội gọi discardDraftVideo().
 *
 * Cách làm là đối soát theo trạng thái (level-triggered), như vòng reconcile
 * của Kubernetes: đọc trạng thái hiện tại rồi đưa về trạng thái đúng, thay vì
 * phản ứng với từng sự kiện (edge-triggered). Nó không phụ thuộc việc có bắt
 * được sự kiện nào hay không, và UPLOADING bỏ dở thì vốn chẳng phát ra sự kiện
 * nào. Chạy trong backend vì đó là nơi đã có sẵn kết nối DB; khi backend tắt
 * thì cũng không ai xem được trạng thái sai, và lần đối soát đầu sau khi bật
 * lại sẽ dọn bù.
 *
 * Mọi thao tác ghi đều có điều kiện theo trạng thái, nên chạy song song ở
 * nhiều tiến trình hay chạy lặp lại đều vô hại.
 */

const HOUR = 60 * 60 * 1000;

/**
 * 3 lần thử x timeout 2 giờ mỗi lần (retry_strategy và timeout trong
 * infrastructure/modules/batch/main.tf). Transcoder ghi lại PROCESSING ở mỗi
 * lần thử, nên quá mốc này kể từ lần ghi cuối thì job chắc chắn đã chết.
 *
 * Trường hợp duy nhất có thể đánh lỗi nhầm là job còn xếp hàng (RUNNABLE) hơn
 * 6 giờ vì thiếu capacity Spot. Khi ấy job vẫn chạy được về sau: transcoder
 * đưa video từ ERROR về PROCESSING rồi READY, nên trạng thái tự đúng lại.
 */
const STUCK_PROCESSING_MS = 6 * HOUR;

/** URL tải lên hết hạn sau 15 phút; một ngày là dư cho mọi lượt tải thật. */
const ABANDONED_UPLOAD_MS = 24 * HOUR;

/** Số bản nháp xử lý mỗi lượt, để một lượt không kéo dài vô hạn. */
const DRAFT_BATCH_SIZE = 100;

/**
 * Một lượt đối soát.
 *
 * @param {number} now - Mốc thời gian hiện tại (tiêm vào để test)
 * @returns {Promise<{stuckProcessing: number, deletedDrafts: number, orphanedUploads: number}>}
 */
const reconcileStuckVideos = async (now = Date.now()) => {
  const stuck = await Video.updateMany(
    { status: 'PROCESSING', updatedAt: { $lt: new Date(now - STUCK_PROCESSING_MS) } },
    { $set: { status: 'ERROR' } }
  );

  const drafts = await Video.find(
    { status: 'UPLOADING', createdAt: { $lt: new Date(now - ABANDONED_UPLOAD_MS) } },
    'rawS3Key'
  )
    .limit(DRAFT_BATCH_SIZE)
    .lean();

  let deletedDrafts = 0;
  let orphanedUploads = 0;

  for (const draft of drafts) {
    let uploaded = false;
    if (draft.rawS3Key) {
      try {
        uploaded = await s3Service.objectExists(process.env.S3_RAW_BUCKET_NAME, draft.rawS3Key);
      } catch (err) {
        // Không kiểm tra được thì để lượt sau, tuyệt đối không xoá khi chưa chắc.
        console.warn(`⚠️  Reconciler: could not check s3 object for video ${draft._id}: ${err.message}`);
        continue;
      }
    }

    if (uploaded) {
      // Tệp đã lên S3 mà một ngày sau vẫn chưa job nào chạy: sự kiện S3 → SQS
      // → Lambda đã thất lạc. Giữ nguyên tệp và bản ghi, chỉ báo lỗi để chủ
      // video thấy thay vì chờ mãi.
      const result = await Video.updateOne(
        { _id: draft._id, status: 'UPLOADING' },
        { $set: { status: 'ERROR' } }
      );
      orphanedUploads += result.modifiedCount;
    } else {
      const result = await Video.deleteOne({ _id: draft._id, status: 'UPLOADING' });
      deletedDrafts += result.deletedCount;
    }
  }

  return { stuckProcessing: stuck.modifiedCount, deletedDrafts, orphanedUploads };
};

/**
 * Chạy đối soát định kỳ trong tiến trình backend.
 *
 * Lượt đầu chạy sau một phút để kết nối DB kịp mở; timer được `unref()` nên
 * không giữ tiến trình sống khi pm2 muốn dừng nó.
 */
const startVideoReconciler = ({ intervalMs = 15 * 60 * 1000, initialDelayMs = 60 * 1000 } = {}) => {
  const runOnce = async () => {
    try {
      const result = await reconcileStuckVideos();
      if (result.stuckProcessing || result.deletedDrafts || result.orphanedUploads) {
        console.log(
          `🧹 Reconciler: ${result.stuckProcessing} stuck PROCESSING → ERROR, ` +
            `${result.orphanedUploads} unprocessed uploads → ERROR, ${result.deletedDrafts} abandoned drafts deleted`
        );
      }
    } catch (err) {
      console.error(`❌ Reconciler run failed: ${err.message}`);
    }
  };

  const first = setTimeout(runOnce, initialDelayMs);
  const every = setInterval(runOnce, intervalMs);
  first.unref();
  every.unref();
  return { first, every };
};

module.exports = {
  reconcileStuckVideos,
  startVideoReconciler,
  STUCK_PROCESSING_MS,
  ABANDONED_UPLOAD_MS,
};
