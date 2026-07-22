const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validateRequest = require('../middleware/validateRequest');

router.post('/register', validateRequest(['username', 'email', 'password']), registerUser);
router.post('/login', validateRequest(['email', 'password']), loginUser);
router.get('/me', protect, getMe);

module.exports = router;
