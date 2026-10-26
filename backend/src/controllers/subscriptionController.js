const subscriptionService = require('../services/subscriptionService');

/**
 * @route   POST /api/subscriptions/:channelId
 * @desc    Subscribe to a channel
 * @access  Private
 */
const subscribe = async (req, res, next) => {
  try {
    const result = await subscriptionService.subscribe(req.user._id, req.params.channelId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   DELETE /api/subscriptions/:channelId
 * @desc    Unsubscribe from a channel
 * @access  Private
 */
const unsubscribe = async (req, res, next) => {
  try {
    const result = await subscriptionService.unsubscribe(req.user._id, req.params.channelId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/subscriptions/:channelId/status
 * @desc    Get subscription status of current user for a channel
 * @access  Public / Optional Auth
 */
const getSubscriptionStatus = async (req, res, next) => {
  try {
    const userId = req.user ? req.user._id : null;
    const result = await subscriptionService.getSubscriptionStatus(userId, req.params.channelId);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/subscriptions/channels
 * @desc    Get all channels subscribed by current user
 * @access  Private
 */
const getSubscribedChannels = async (req, res, next) => {
  try {
    const result = await subscriptionService.getSubscribedChannels(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * @route   GET /api/subscriptions/feed
 * @desc    Get video feed from all subscribed channels
 * @access  Private
 */
const getSubscriptionFeed = async (req, res, next) => {
  try {
    const result = await subscriptionService.getSubscriptionFeed(req.user._id, req.query);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  subscribe,
  unsubscribe,
  getSubscriptionStatus,
  getSubscribedChannels,
  getSubscriptionFeed,
};
