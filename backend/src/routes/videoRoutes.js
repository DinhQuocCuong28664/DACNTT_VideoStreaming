const express = require('express');
const router = express.Router();
const {
  createVideo,
  confirmUpload,
  getAllVideos,
  getVideoById,
  getUserVideos,
  updateVideo,
  deleteVideo,
} = require('../controllers/videoController');
const { protect } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');

// Public routes
router.get('/', getAllVideos);
router.get('/:id', getVideoById);
router.get('/user/:userId', getUserVideos);

// Protected routes
router.post('/', protect, validateRequest(['title']), createVideo);
router.patch('/:id/confirm-upload', protect, confirmUpload);
router.put('/:id', protect, updateVideo);
router.delete('/:id', protect, deleteVideo);

module.exports = router;
