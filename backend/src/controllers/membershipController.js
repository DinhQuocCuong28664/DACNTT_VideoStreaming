const membershipService = require('../services/membershipService');

/**
 * Controller handling channel membership tiers, subscriptions, and member rosters.
 */

// @desc    Get active membership tiers for a channel
// @route   GET /api/memberships/tiers/:channelId
// @access  Public
const getChannelTiers = async (req, res, next) => {
  try {
    const tiers = await membershipService.getChannelTiers(req.params.channelId);
    res.status(200).json({
      success: true,
      data: tiers,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Create or update a membership tier
// @route   POST /api/memberships/tiers/:channelId
// @access  Private (Channel Owner)
const createOrUpdateTier = async (req, res, next) => {
  try {
    const tier = await membershipService.createOrUpdateTier(
      req.params.channelId,
      req.body,
      req.user
    );
    res.status(200).json({
      success: true,
      data: tier,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Delete/deactivate a membership tier
// @route   DELETE /api/memberships/tiers/:channelId/:tierId
// @access  Private (Channel Owner)
const deleteTier = async (req, res, next) => {
  try {
    const result = await membershipService.deleteTier(
      req.params.channelId,
      req.params.tierId,
      req.user
    );
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Join a channel membership tier (Sandbox checkout)
// @route   POST /api/memberships/join/:channelId
// @access  Private
const joinMembership = async (req, res, next) => {
  try {
    const { tierId, paymentMethod } = req.body;
    const result = await membershipService.joinMembership(
      req.user._id,
      req.params.channelId,
      tierId,
      { paymentMethod }
    );
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Cancel channel membership
// @route   POST /api/memberships/cancel/:channelId
// @access  Private
const cancelMembership = async (req, res, next) => {
  try {
    const result = await membershipService.cancelMembership(
      req.user._id,
      req.params.channelId
    );
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user's membership status for a channel
// @route   GET /api/memberships/status/:channelId
// @access  Public (Optional auth)
const getMembershipStatus = async (req, res, next) => {
  try {
    const status = await membershipService.getMembershipStatus(
      req.user ? req.user._id : null,
      req.params.channelId
    );
    res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get active members roster of a channel
// @route   GET /api/memberships/members/:channelId
// @access  Private (Channel Owner / Admin)
const getChannelMembers = async (req, res, next) => {
  try {
    const result = await membershipService.getChannelMembers(
      req.params.channelId,
      req.user,
      req.query
    );
    res.status(200).json({
      success: true,
      data: result.members,
      pagination: result.pagination,
      totalActiveMembers: result.totalActiveMembers,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getChannelTiers,
  createOrUpdateTier,
  deleteTier,
  joinMembership,
  cancelMembership,
  getMembershipStatus,
  getChannelMembers,
};
