const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateRequest, validateAvatarMetadata } = require('../middleware/validateRequest');
const { getPublicProfile, presignAvatarUpload, updateAvatar } = require('../controllers/userController');

// Protected routes (require JWT) — phải khai báo TRƯỚC "/:id" bên dưới, nếu
// không Express sẽ khớp "/avatar" vào tham số :id của route public.
router.post(
  '/avatar/presign',
  auth,
  validateRequest(['filename', 'mimetype']),
  validateAvatarMetadata,
  presignAvatarUpload
);
router.put('/avatar', auth, validateRequest(['key']), updateAvatar);

// Public routes
router.get('/:id', getPublicProfile);

module.exports = router;
