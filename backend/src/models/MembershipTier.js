const mongoose = require('mongoose');

/**
 * MembershipTier Schema
 * Defines the membership tiers configured by a creator for their channel.
 */
const membershipTierSchema = new mongoose.Schema(
  {
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Channel ID is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Tier name is required'],
      trim: true,
      maxlength: [50, 'Tier name cannot exceed 50 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    currency: {
      type: String,
      default: 'VND',
      uppercase: true,
      trim: true,
    },
    level: {
      type: Number,
      default: 1,
      min: [1, 'Tier level must be at least 1'],
    },
    badgeColor: {
      type: String,
      default: '#10a37f', // Brand emerald or custom hex
      trim: true,
    },
    perks: {
      type: [String],
      default: [],
    },
    description: {
      type: String,
      maxlength: [300, 'Description cannot exceed 300 characters'],
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for efficient lookup
membershipTierSchema.index({ channel: 1, level: 1 });
membershipTierSchema.index({ channel: 1, isActive: 1 });

module.exports = mongoose.model('MembershipTier', membershipTierSchema);
