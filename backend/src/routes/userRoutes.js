const express = require('express');
const router = express.Router();
const { getPublicProfile } = require('../controllers/userController');

// Public routes
router.get('/:id', getPublicProfile);

module.exports = router;
