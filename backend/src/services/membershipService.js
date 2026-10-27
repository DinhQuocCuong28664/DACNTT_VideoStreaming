const mongoose = require('mongoose');
const MembershipTier = require('../models/MembershipTier');
const ChannelMembership = require('../models/ChannelMembership');
const User = require('../models/User');
const Video = require('../models/Video');
const httpError = require('../utils/httpError');
const { parsePaging } = require('../utils/pagination');

/**
 * Service managing Creator Channel Memberships, Tiers, and Viewer Subscriptions.
 *
 * Payments are a sandbox: joining charges nothing (demo only).
 */

/**
 * The tier a channel offers once its owner publishes members-only content.
 * There is no screen for creators to design tiers yet, so publishing such a
 * video is how a channel opts in. Name and perks are left for the interface to
 * show in the viewer's language (isStandard).
 */
const STANDARD_TIER = {
  name: 'Member',
  price: 50000,
  currency: 'VND',
  level: 1,
  badgeColor: '#10a37f',
  perks: [],
  description: '',
  isActive: true,
  isStandard: true,
};

/**
 * The channel's standard tier, created on first need. The upsert and the
 * unique index one_standard_tier_per_channel keep it to one per channel; a
 * request that loses the race to create it reads the winner's.
 */
const ensureStandardTier = async (channelId) => {
  try {
    return await MembershipTier.findOneAndUpdate(
      { channel: channelId, isStandard: true },
      { $setOnInsert: { ...STANDARD_TIER, channel: channelId } },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err && err.code === 11000) return MembershipTier.findOne({ channel: channelId, isStandard: true });
    throw err;
  }
};

/**
 * Get all active membership tiers of a channel.
 *
 * A channel offers membership only when its owner has created a tier or
 * published a members-only video. Before, a channel with neither still showed
 * a default tier, and the first viewer to join created it on that channel.
 * An empty list now means "this channel does not offer membership".
 */
const getChannelTiers = async (channelId) => {
  if (!channelId) {
    throw httpError(400, 'Channel ID is required');
  }

  const channelExists = await User.exists({ _id: channelId });
  if (!channelExists) {
    throw httpError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');
  }

  const tiers = await MembershipTier.find({ channel: channelId, isActive: true }).sort({ level: 1 });
  if (tiers.length > 0) return tiers;

  const offersMembersContent = await Video.exists({ user: channelId, accessLevel: 'members_only' });
  if (!offersMembersContent) return [];

  // A standard tier the owner switched off stays off.
  const standard = await ensureStandardTier(channelId);
  return standard && standard.isActive ? [standard] : [];
};

/**
 * Creator creates or updates a membership tier for their channel.
 */
const createOrUpdateTier = async (channelId, tierData, creatorUser) => {
  if (!creatorUser || creatorUser._id.toString() !== channelId.toString()) {
    throw httpError(403, 'Only the channel owner can configure membership tiers', 'FORBIDDEN');
  }

  const { name, price, level = 1, perks = [], badgeColor = '#10a37f', description = '' } = tierData;

  if (!name || typeof price !== 'number') {
    throw httpError(400, 'Tier name and valid price are required');
  }

  if (tierData._id) {
    const updated = await MembershipTier.findOneAndUpdate(
      { _id: tierData._id, channel: channelId },
      {
        $set: {
          name: name.trim(),
          price: Math.max(0, price),
          level: Math.max(1, Number(level) || 1),
          perks: Array.isArray(perks) ? perks : [],
          badgeColor: badgeColor || '#10a37f',
          description: description || '',
          isActive: true,
        },
      },
      { returnDocument: 'after', runValidators: true }
    );
    if (!updated) {
      throw httpError(404, 'Tier not found');
    }
    return updated;
  }

  const created = await MembershipTier.create({
    channel: channelId,
    name: name.trim(),
    price: Math.max(0, price),
    level: Math.max(1, Number(level) || 1),
    perks: Array.isArray(perks) ? perks : [],
    badgeColor: badgeColor || '#10a37f',
    description: description || '',
    isActive: true,
  });

  return created;
};

/**
 * Creator deactivates a membership tier.
 */
const deleteTier = async (channelId, tierId, creatorUser) => {
  if (!creatorUser || creatorUser._id.toString() !== channelId.toString()) {
    throw httpError(403, 'Only the channel owner can delete membership tiers', 'FORBIDDEN');
  }

  const tier = await MembershipTier.findOneAndUpdate(
    { _id: tierId, channel: channelId },
    { $set: { isActive: false } },
    { returnDocument: 'after' }
  );

  if (!tier) {
    throw httpError(404, 'Tier not found');
  }

  return { success: true, message: 'Tier deactivated successfully' };
};

/**
 * Viewer joins/subscribes to a channel membership tier via Sandbox gateway.
 */
const joinMembership = async (userId, channelId, tierId, paymentData = {}) => {
  if (!userId || !channelId) {
    throw httpError(400, 'User ID and Channel ID are required');
  }

  if (userId.toString() === channelId.toString()) {
    throw httpError(400, 'Cannot join membership on your own channel', 'SELF_MEMBERSHIP');
  }

  const channelExists = await User.exists({ _id: channelId });
  if (!channelExists) {
    throw httpError(404, 'Channel not found', 'CHANNEL_NOT_FOUND');
  }

  // Only a tier this channel actually offers. There is no fallback: falling
  // back used to create a tier on a channel whose owner never offered one.
  if (!tierId || !mongoose.Types.ObjectId.isValid(String(tierId))) {
    throw httpError(400, 'Choose one of the channel\'s membership tiers', 'TIER_REQUIRED');
  }
  const tier = await MembershipTier.findOne({ _id: tierId, channel: channelId, isActive: true });
  if (!tier) {
    throw httpError(404, 'This channel does not offer that membership tier', 'TIER_NOT_FOUND');
  }

  // 30 days active validity period
  const startDate = new Date();
  const expiresAt = new Date(startDate.getTime() + 30 * 24 * 60 * 60 * 1000);

  const membership = await ChannelMembership.findOneAndUpdate(
    { user: userId, channel: channelId },
    {
      $set: {
        tier: tier._id,
        tierLevel: tier.level || 1,
        status: 'active',
        startDate,
        expiresAt,
        autoRenew: true,
        paymentMethod: paymentData.paymentMethod || 'sandbox_wallet',
        lastPaymentAmount: tier.price || 0,
      },
    },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).populate('tier', 'name level price badgeColor perks');

  return {
    isMember: true,
    membership,
    tier,
  };
};

/**
 * Viewer cancels their channel membership.
 */
const cancelMembership = async (userId, channelId) => {
  if (!userId || !channelId) {
    throw httpError(400, 'User ID and Channel ID are required');
  }

  const membership = await ChannelMembership.findOneAndUpdate(
    { user: userId, channel: channelId, status: 'active' },
    {
      $set: {
        status: 'cancelled',
        autoRenew: false,
      },
    },
    { returnDocument: 'after' }
  );

  if (!membership) {
    return {
      isMember: false,
      message: 'No active membership found to cancel',
    };
  }

  return {
    isMember: false,
    message: 'Membership cancelled successfully',
  };
};

/**
 * Check membership status of a viewer on a specific channel.
 */
const getMembershipStatus = async (userId, channelId) => {
  if (!channelId) {
    throw httpError(400, 'Channel ID is required');
  }

  if (!userId) {
    return {
      isMember: false,
      membership: null,
      tier: null,
    };
  }

  const membership = await ChannelMembership.findOne({
    user: userId,
    channel: channelId,
    status: 'active',
    expiresAt: { $gt: new Date() },
  }).populate('tier', 'name level price badgeColor perks');

  return {
    isMember: Boolean(membership),
    membership: membership || null,
    tier: membership ? membership.tier : null,
  };
};

/**
 * Creator retrieves active members list with authoritative counter.
 */
const getChannelMembers = async (channelId, requesterUser, query = {}) => {
  if (!channelId) {
    throw httpError(400, 'Channel ID is required');
  }

  const isOwner = requesterUser && requesterUser._id.toString() === channelId.toString();
  const isAdmin = requesterUser && requesterUser.role === 'admin';

  if (!isOwner && !isAdmin) {
    throw httpError(403, 'Only channel owners can view membership roster', 'FORBIDDEN');
  }

  const { page, limit } = parsePaging(query, 20);
  const filter = {
    channel: channelId,
    status: 'active',
    expiresAt: { $gt: new Date() },
  };

  const [members, total] = await Promise.all([
    ChannelMembership.find(filter)
      .sort({ startDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'username displayName avatar email')
      .populate('tier', 'name level price badgeColor'),
    ChannelMembership.countDocuments(filter),
  ]);

  return {
    members,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit) || 0,
    },
    totalActiveMembers: total,
  };
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
