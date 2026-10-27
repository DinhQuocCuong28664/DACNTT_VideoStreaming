const mongoose = require('mongoose');

/**
 * One fixed-window rate limit counter, shared by every backend instance.
 *
 * On Lambda each execution environment has its own memory, so an in-memory
 * counter gave every warm instance its own allowance and lost it whenever the
 * instance was recycled. `_id` is the limiter's prefix plus the client key
 * (middleware/mongoRateLimitStore.js).
 */
const rateLimitHitSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    hits: { type: Number, required: true },
    resetAt: { type: Date, required: true },
  },
  { versionKey: false, collection: 'ratelimithits' }
);

// The TTL monitor deletes a counter some time after its window ends (it runs
// about every 60 seconds). The store compares resetAt itself, so a counter
// that lingers is never read as the current window.
rateLimitHitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('RateLimitHit', rateLimitHitSchema);
