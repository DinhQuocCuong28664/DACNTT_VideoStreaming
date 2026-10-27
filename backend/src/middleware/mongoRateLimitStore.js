const RateLimitHit = require('../models/RateLimitHit');

/**
 * express-rate-limit store kept in MongoDB, so every backend instance counts
 * against the same window. It keeps the fixed window of the MemoryStore it
 * replaces: a key's first hit opens a window of `windowMs`, and the count
 * starts again at 1 once that window has ended.
 *
 * Each limiter needs its own instance with its own prefix: one request passes
 * both apiLimiter and, say, authLimiter, and express-rate-limit's singleCount
 * check tells their counters apart by prefix.
 */
class MongoRateLimitStore {
  constructor({ prefix }) {
    if (!prefix) throw new Error('MongoRateLimitStore needs a prefix');
    this.prefix = prefix;
    // Counters are shared across instances, not kept per store object.
    this.localKeys = false;
    this.windowMs = 60 * 1000;
  }

  /** express-rate-limit passes the limiter's options once, before the first hit. */
  init(options) {
    this.windowMs = options.windowMs;
  }

  idOf(key) {
    return `${this.prefix}${key}`;
  }

  /**
   * Count one hit in a single atomic round trip: open a new window when none
   * is open, otherwise add one. Two instances counting a key's first hit at
   * once do not create two counters: the filter is an equality on _id, so the
   * server turns the losing insert into an update (MongoDB, "Upsert with
   * Duplicate Values"). $$NOW is the database's clock, the same for every
   * instance.
   */
  async increment(key) {
    const open = { $gt: ['$resetAt', '$$NOW'] };
    const doc = await RateLimitHit.findOneAndUpdate(
      { _id: this.idOf(key) },
      [
        {
          $set: {
            hits: { $cond: [open, { $add: ['$hits', 1] }, 1] },
            resetAt: { $cond: [open, '$resetAt', { $add: ['$$NOW', this.windowMs] }] },
          },
        },
      ],
      // Mongoose 9 refuses update pipelines unless asked for explicitly.
      { upsert: true, returnDocument: 'after', updatePipeline: true, lean: true }
    );
    return { totalHits: doc.hits, resetTime: doc.resetAt };
  }

  /** Used only with skipSuccessfulRequests / skipFailedRequests. */
  async decrement(key) {
    await RateLimitHit.updateOne(
      { _id: this.idOf(key), hits: { $gt: 0 }, resetAt: { $gt: new Date() } },
      { $inc: { hits: -1 } }
    );
  }

  async resetKey(key) {
    await RateLimitHit.deleteOne({ _id: this.idOf(key) });
  }

  /** The current window of a key, or undefined when none is open. */
  async get(key) {
    const doc = await RateLimitHit.findById(this.idOf(key)).lean();
    if (!doc || doc.resetAt <= new Date()) return undefined;
    return { totalHits: doc.hits, resetTime: doc.resetAt };
  }
}

module.exports = MongoRateLimitStore;
