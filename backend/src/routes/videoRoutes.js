const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { optionalAuth, requireVerifiedEmail } = require('../middleware/auth');
const { validateRequest, validateUploadMetadata } = require('../middleware/validateRequest');
const { uploadLimiter, reportLimiter } = require('../middleware/rateLimiter');
const {
  initiateUpload,
  confirmUpload,
  getUploadConfig,
  getMultipartPartUrls,
  completeMultipartUpload,
  getAllVideos,
  getVideoById,
  getPlaybackAuth,
  registerView,
  getUserVideos,
  getRelatedVideos,
  toggleLike,
  toggleDislike,
  getComments,
  getReplies,
  addComment,
  deleteComment,
  setPinnedComment,
  updateVideo,
  deleteVideo,
} = require('../controllers/videoController');
const { reportVideo } = require('../controllers/moderationController');
const { reportComment } = require('../controllers/commentReportController');
const { createAppeal, getOwnAppeal } = require('../controllers/appealController');

// Public routes (with optional auth to detect owner)
router.get('/', getAllVideos);
// Phải đứng trước '/:id', nếu không 'upload-config' bị coi là một video ID.
router.get('/upload-config', getUploadConfig);
router.get('/user/:userId', optionalAuth, getUserVideos);
router.get('/:id', optionalAuth, getVideoById);
router.get('/:id/related', optionalAuth, getRelatedVideos);
router.get('/:id/playback-auth', optionalAuth, getPlaybackAuth);
router.post('/:id/view', optionalAuth, registerView);
router.get('/:id/comments', optionalAuth, getComments);
router.get('/comments/:commentId/replies', optionalAuth, getReplies);

// Protected routes (require JWT)
// Chặn ngay ở bước tạo bản ghi: confirm-upload chỉ chạy cho video đã qua
// bước này. Kiểm tra xác minh trước limiter để lượt bị từ chối không ăn vào
// hạn mức tải lên của giờ đó.
router.post(
  '/initiate-upload',
  auth,
  requireVerifiedEmail,
  uploadLimiter,
  validateRequest(['filename', 'mimetype']),
  validateUploadMetadata,
  initiateUpload
);
router.patch('/:id/confirm-upload', auth, confirmUpload);
// Tải lên theo từng phần (tệp lớn): xin URL cho từng nhóm phần, rồi ghép.
router.post('/:id/multipart/parts', auth, validateRequest(['partNumbers']), getMultipartPartUrls);
router.post('/:id/multipart/complete', auth, completeMultipartUpload);
router.post('/:id/like', auth, toggleLike);
router.post('/:id/dislike', auth, toggleDislike);
router.post('/:id/comments', auth, addComment);
router.delete('/comments/:commentId', auth, deleteComment);
router.post('/comments/:commentId/report', auth, reportLimiter, validateRequest(['reason']), reportComment);
router.put('/:id/pinned-comment', auth, setPinnedComment);
router.post('/:id/report', auth, reportLimiter, validateRequest(['reason']), reportVideo);
// Khiếu nại của chủ video với video bị gỡ; dùng chung giới hạn tốc độ với báo cáo.
router.post('/:id/appeal', auth, reportLimiter, validateRequest(['message']), createAppeal);
router.get('/:id/appeal', auth, getOwnAppeal);
router.put('/:id', auth, updateVideo);
router.delete('/:id', auth, deleteVideo);

module.exports = router;
