const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema(
  {
    subscriber: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Subscriber ID is required'],
      index: true,
    },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Channel ID is required'],
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false,
    versionKey: false,
  }
);

// Compound unique index: prevents a user from subscribing to the same channel multiple times
subscriptionSchema.index({ subscriber: 1, channel: 1 }, { unique: true });

// Compound index for fetching feed/history sorted by time
subscriptionSchema.index({ subscriber: 1, createdAt: -1 });
subscriptionSchema.index({ channel: 1, createdAt: -1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);
