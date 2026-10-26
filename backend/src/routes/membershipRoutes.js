const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { optionalAuth } = require('../middleware/auth');
const {
  getChannelTiers,
  createOrUpdateTier,
  deleteTier,
  joinMembership,
  cancelMembership,
  getMembershipStatus,
  getChannelMembers,
} = require('../controllers/membershipController');

// 1. Tiers management
router.get('/tiers/:channelId', getChannelTiers);
router.post('/tiers/:channelId', auth, createOrUpdateTier);
router.delete('/tiers/:channelId/:tierId', auth, deleteTier);

// 2. Member status & Roster
router.get('/status/:channelId', optionalAuth, getMembershipStatus);
router.get('/members/:channelId', auth, getChannelMembers);

// 3. Join & Cancel Membership (Sandbox Gateway)
router.post('/join/:channelId', auth, joinMembership);
router.post('/cancel/:channelId', auth, cancelMembership);

module.exports = router;
