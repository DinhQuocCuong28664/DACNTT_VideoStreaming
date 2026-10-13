const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validateRequest');
const {
  getModerationStats,
  getModerationQueue,
  getVideoReports,
  getModerationEvents,
  decideVideo,
} = require('../controllers/moderationController');

// Mọi route quản trị: phải đăng nhập, rồi từng route kiểm tra QUYỀN riêng (utils/roles.js).
// Không còn một cổng "admin" chung: operator và auditor vào đúng phần của mình.
router.use(auth);

router.get('/stats', requirePermission('moderation:review', 'metrics:read'), getModerationStats);
router.get('/videos', requirePermission('moderation:review'), getModerationQueue);
router.get('/videos/:id/reports', requirePermission('moderation:review'), getVideoReports);
router.patch(
  '/videos/:id/moderation',
  requirePermission('moderation:review'),
  validateRequest(['decision', 'reasonCode']),
  decideVideo
);
router.get('/events', requirePermission('events:read'), getModerationEvents);

module.exports = router;
