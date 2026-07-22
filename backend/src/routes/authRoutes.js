const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { validateRequest, validateEmail } = require('../middleware/validateRequest');
const {
  registerUser,
  loginUser,
  getMe,
  forgotPassword,
  resetPassword,
  changePassword,
} = require('../controllers/authController');

// Public routes
router.post('/register', validateRequest(['username', 'email', 'password']), validateEmail, registerUser);
router.post('/login', validateRequest(['email', 'password']), validateEmail, loginUser);
router.post('/forgot-password', validateRequest(['email']), validateEmail, forgotPassword);
router.post('/reset-password/:token', validateRequest(['password']), resetPassword);

// Protected routes (require JWT)
router.get('/me', auth, getMe);
router.put('/change-password', auth, validateRequest(['currentPassword', 'newPassword']), changePassword);

module.exports = router;
