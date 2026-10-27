const Subscription = require('../models/Subscription');
const User = require('../models/User');
const Video = require('../models/Video');
const httpError = require('../utils/httpError');
const { parsePaging } = require('../utils/pagination');
const { publicListingFilter } = require('../utils/moderation');

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
  } catch (err) {
    if (err.code !== 11000) {
      throw err;
    }
    // Idempotent duplicate key error - continue to synchronize count
  }

  // Authoritatively sync subscriber count from actual Subscription documents
  const subscribersCount = await Subscription.countDocuments({ channel: channelId });
  await User.findByIdAndUpdate(channelId, { subscribers: subscribersCount });

  return {
    isSubscribed: true,
    subscribersCount,
  };
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

  await Subscription.findOneAndDelete({
    subscriber: subscriberId,
    channel: channelId,
  });

  // Authoritatively sync subscriber count from actual Subscription documents
  const subscribersCount = await Subscription.countDocuments({ channel: channelId });
  await User.findByIdAndUpdate(channelId, { subscribers: subscribersCount });

  return {
    isSubscribed: false,
    subscribersCount,
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

  // 2. Query videos from followed channels. The same rule as every public
  // listing: a video under review (flagged) is hidden too, since playing it
  // answers 403 VIDEO_UNDER_REVIEW.
  const filter = {
    user: { $in: channelIds },
    ...publicListingFilter(),
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
