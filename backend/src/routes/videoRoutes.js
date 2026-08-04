const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { optionalAuth } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validateRequest');
const {
  initiateUpload,
  confirmUpload,
  getAllVideos,
  getVideoById,
  getUserVideos,
  toggleLike,
  toggleDislike,
  getComments,
  addComment,
  deleteComment,
  updateVideo,
  deleteVideo,
} = require('../controllers/videoController');

// Public routes (with optional auth to detect owner)
router.get('/', getAllVideos);
router.get('/user/:userId', optionalAuth, getUserVideos);
router.get('/:id', optionalAuth, getVideoById);
router.get('/:id/comments', optionalAuth, getComments);

// Protected routes (require JWT)
router.post('/initiate-upload', auth, validateRequest(['filename', 'mimetype']), initiateUpload);
router.patch('/:id/confirm-upload', auth, confirmUpload);
router.post('/:id/like', auth, toggleLike);
router.post('/:id/dislike', auth, toggleDislike);
router.post('/:id/comments', auth, addComment);
router.delete('/comments/:commentId', auth, deleteComment);
router.put('/:id', auth, updateVideo);
router.delete('/:id', auth, deleteVideo);

module.exports = router;
