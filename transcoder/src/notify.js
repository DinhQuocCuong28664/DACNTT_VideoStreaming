const { getVideoWithUser } = require('./dbHandler');
const {
  sendVideoReadyEmail,
  sendVideoFailedEmail,
  sendVideoModerationEmail,
} = require('./emailService');

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
 * Báo video đã xử lý xong cho chủ video: email "sẵn sàng", hoặc email kiểm duyệt khi video bị
 * chặn hay gắn cờ. Dùng chung cho đường một-job (index.js) và job ghép của đường chia đoạn.
 *
 * Chỉ gọi khi CHÍNH job này thắng cuộc ghi READY: job trùng lặp bị chặn ghi (updated=false)
 * mà vẫn gửi thì người dùng nhận email trùng.
 */
const notifyVideoReady = async (videoId, moderation) => {
  const videoWithUser = await getVideoWithUser(videoId);
  const recipient = videoWithUser?.user?.email;
  const displayName = videoWithUser?.user?.displayName || videoWithUser?.user?.username;
  const outcome = moderation?.status;

  if (outcome === 'blocked' || outcome === 'flagged') {
    await notifySafely(
      sendVideoModerationEmail,
      recipient,
      { title: videoWithUser?.title, displayName, outcome },
      `video ${outcome}`
    );
  } else {
    await notifySafely(
      sendVideoReadyEmail,
      recipient,
      { title: videoWithUser?.title, videoId, displayName },
      'video ready'
    );
  }
};

/** Báo video xử lý thất bại. Chỉ gọi khi job này là job thắng cuộc ghi ERROR. */
const notifyVideoFailed = async (videoId) => {
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
};

module.exports = { notifySafely, notifyVideoReady, notifyVideoFailed };
