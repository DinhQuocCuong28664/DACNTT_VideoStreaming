const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateRequest, validateEmail } = require('../middleware/validateRequest');
const { authLimiter } = require('../middleware/rateLimiter');
const {
  registerUser,
  loginUser,
  googleAuth,
  linkGoogle,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
} = require('../controllers/authController');

// Public routes — áp dụng rate limit nghiêm ngặt để chống brute-force
router.post('/register', authLimiter, validateRequest(['username', 'email', 'password']), validateEmail, registerUser);
router.post('/login', authLimiter, validateRequest(['email', 'password']), validateEmail, loginUser);
router.post('/google', authLimiter, validateRequest(['credential']), googleAuth);
router.post('/forgot-password', authLimiter, validateRequest(['email']), validateEmail, forgotPassword);
router.post('/reset-password/:token', authLimiter, validateRequest(['password']), resetPassword);

// Protected routes (require JWT)
router.get('/me', auth, getMe);
router.put('/change-password', auth, validateRequest(['currentPassword', 'newPassword']), changePassword);
router.post('/link-google', auth, validateRequest(['credential']), linkGoogle);

module.exports = router;
