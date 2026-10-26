const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { optionalAuth } = require('../middleware/auth');
const {
  subscribe,
  unsubscribe,
  getSubscriptionStatus,
  getSubscribedChannels,
  getSubscriptionFeed,
} = require('../controllers/subscriptionController');

// 1. Static paths first to avoid param clash
router.get('/channels', auth, getSubscribedChannels);
router.get('/feed', auth, getSubscriptionFeed);

// 2. Dynamic channel routes
router.get('/:channelId/status', optionalAuth, getSubscriptionStatus);
router.post('/:channelId', auth, subscribe);
router.delete('/:channelId', auth, unsubscribe);

module.exports = router;
