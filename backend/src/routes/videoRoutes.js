const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateRequest } = require('../middleware/validateRequest');
const {
  getUploadUrl,
  createVideo,
  confirmUpload,
  getAllVideos,
  getVideoById,
  getUserVideos,
  updateVideo,
  deleteVideo,
} = require('../controllers/videoController');

// Public routes
router.get('/', getAllVideos);
router.get('/user/:userId', getUserVideos);
router.get('/:id', getVideoById);

// Protected routes (require JWT)
router.post('/upload-url', auth, validateRequest(['filename', 'mimetype']), getUploadUrl);
router.post('/', auth, validateRequest(['title', 'rawS3Key']), createVideo);
router.patch('/:id/confirm-upload', auth, confirmUpload);
router.put('/:id', auth, updateVideo);
router.delete('/:id', auth, deleteVideo);

module.exports = router;
