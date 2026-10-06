const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { optionalAuth } = require('../middleware/auth');
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
  addComment,
  deleteComment,
  updateVideo,
  deleteVideo,
} = require('../controllers/videoController');
const { reportVideo } = require('../controllers/moderationController');

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

// Protected routes (require JWT)
router.post(
  '/initiate-upload',
  auth,
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
router.post('/:id/report', auth, reportLimiter, validateRequest(['reason']), reportVideo);
router.put('/:id', auth, updateVideo);
router.delete('/:id', auth, deleteVideo);

module.exports = router;
