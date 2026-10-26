const mongoose = require('mongoose');

/**
 * ChannelMembership Schema
 * Tracks active subscriptions/memberships of viewers to a creator's channel.
 */
const channelMembershipSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true,
    },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Channel ID is required'],
      index: true,
    },
    tier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MembershipTier',
      required: [true, 'Tier ID is required'],
    },
    tierLevel: {
      type: Number,
      default: 1,
    },
    status: {
      type: String,
      enum: ['active', 'cancelled', 'expired'],
      default: 'active',
      index: true,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    autoRenew: {
      type: Boolean,
      default: true,
    },
    paymentMethod: {
      type: String,
      default: 'sandbox_wallet',
    },
    lastPaymentAmount: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound unique index: a user can only have 1 active/cancelled record per channel
channelMembershipSchema.index({ user: 1, channel: 1 }, { unique: true });

// Compound indexes for fast membership authorization check
channelMembershipSchema.index({ user: 1, channel: 1, status: 1, expiresAt: 1 });
channelMembershipSchema.index({ channel: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model('ChannelMembership', channelMembershipSchema);
