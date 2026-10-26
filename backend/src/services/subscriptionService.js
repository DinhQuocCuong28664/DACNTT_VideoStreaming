const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Video = require('../models/Video');
const httpError = require('../utils/httpError');
const { parsePaging } = require('../utils/pagination');

/**
 * Service managing user-to-channel subscriptions and the subscription video feed.
 */

/**
 * Subscribe a user to a channel.
 * Idempotent: If already subscribed, returns existing status without creating duplicates.
 */
const subscribe = async (subscriberId, channelId) => {
  if (!subscriberId || !channelId) {
    throw httpError(400, 'Subscriber ID and Channel ID are required');
  }

  if (subscriberId.toString() === channelId.toString()) {
    throw httpError(400, 'Cannot subscribe to your own channel', 'SELF_SUBSCRIPTION');
  }

  const channelExists = await User.exists({ _id: channelId });
  if (!channelExists) {
    throw httpError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');
  }

  try {
    await Subscription.create({
      subscriber: subscriberId,
      channel: channelId,
    });

    // Atomically increment subscriber count
    const updatedChannel = await User.findByIdAndUpdate(
      channelId,
      { $inc: { subscribers: 1 } },
      { new: true, select: 'subscribers' }
    );

    return {
      isSubscribed: true,
      subscribersCount: updatedChannel ? updatedChannel.subscribers : 0,
    };
  } catch (err) {
    if (err.code === 11000) {
      // Already subscribed (idempotent duplicate key error)
      const currentChannel = await User.findById(channelId).select('subscribers');
      return {
        isSubscribed: true,
        subscribersCount: currentChannel ? currentChannel.subscribers : 0,
      };
    }
    throw err;
  }
};

/**
 * Unsubscribe a user from a channel.
 * Idempotent: If not subscribed, returns isSubscribed: false without negative counter.
 */
const unsubscribe = async (subscriberId, channelId) => {
  if (!subscriberId || !channelId) {
    throw httpError(400, 'Subscriber ID and Channel ID are required');
  }

  if (subscriberId.toString() === channelId.toString()) {
    throw httpError(400, 'Cannot unsubscribe from your own channel', 'SELF_UNSUBSCRIPTION');
  }

  const deleted = await Subscription.findOneAndDelete({
    subscriber: subscriberId,
    channel: channelId,
  });

  if (deleted) {
    // Atomically decrement subscriber count ensuring >= 0
    const updatedChannel = await User.findByIdAndUpdate(
      channelId,
      [
        {
          $set: {
            subscribers: {
              $max: [0, { $subtract: ['$subscribers', 1] }],
            },
          },
        },
      ],
      { new: true }
    );

    return {
      isSubscribed: false,
      subscribersCount: updatedChannel ? updatedChannel.subscribers : 0,
    };
  }

  const currentChannel = await User.findById(channelId).select('subscribers');
  return {
    isSubscribed: false,
    subscribersCount: currentChannel ? currentChannel.subscribers : 0,
  };
};

/**
 * Get subscription status for a viewer relative to a channel.
 */
const getSubscriptionStatus = async (subscriberId, channelId) => {
  if (!channelId) {
    throw httpError(400, 'Channel ID is required');
  }

  const channel = await User.findById(channelId).select('subscribers');
  if (!channel) {
    throw httpError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');
  }

  if (!subscriberId) {
    return {
      isSubscribed: false,
      subscribersCount: channel.subscribers || 0,
    };
  }

  const exists = await Subscription.exists({
    subscriber: subscriberId,
    channel: channelId,
  });

  return {
    isSubscribed: Boolean(exists),
    subscribersCount: channel.subscribers || 0,
  };
};

/**
 * Get list of channels a user is subscribed to (with pagination).
 */
const getSubscribedChannels = async (subscriberId, query = {}) => {
  const { page, limit } = parsePaging(query, 20);

  const total = await Subscription.countDocuments({ subscriber: subscriberId });

  const subs = await Subscription.find({ subscriber: subscriberId })
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .populate('channel', 'username displayName avatar subscribers channelDescription');

  const channels = subs.map((s) => s.channel).filter(Boolean);

  return {
    channels,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 0,
    },
  };
};

/**
 * Get video feed from all subscribed channels (latest uploads).
 */
const getSubscriptionFeed = async (subscriberId, query = {}) => {
  const { page, limit } = parsePaging(query, 12);

  // 1. Fetch channel IDs followed by user
  const subs = await Subscription.find({ subscriber: subscriberId }).select('channel');
  const channelIds = subs.map((s) => s.channel);

  if (channelIds.length === 0) {
    return {
      videos: [],
      pagination: {
        page,
        limit,
        total: 0,
        pages: 0,
      },
    };
  }

  // 2. Query videos from followed channels
  const filter = {
    user: { $in: channelIds },
    status: 'READY',
    visibility: 'public',
    'moderation.status': { $ne: 'blocked' },
  };

  const [videos, total] = await Promise.all([
    Video.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'username displayName avatar subscribers'),
    Video.countDocuments(filter),
  ]);

  return {
    videos,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 0,
    },
  };
};

module.exports = {
  subscribe,
  unsubscribe,
  getSubscriptionStatus,
  getSubscribedChannels,
  getSubscriptionFeed,
};
