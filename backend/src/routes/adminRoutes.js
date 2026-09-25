const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validateRequest');
const {
  getModerationStats,
  getModerationQueue,
  getVideoReports,
  decideVideo,
} = require('../controllers/moderationController');

// Mọi route quản trị: phải đăng nhập VÀ có vai trò admin.
router.use(auth, requireAdmin);

router.get('/stats', getModerationStats);
router.get('/videos', getModerationQueue);
router.get('/videos/:id/reports', getVideoReports);
router.patch('/videos/:id/moderation', validateRequest(['decision']), decideVideo);

module.exports = router;
