const mongoose = require('mongoose');

/**
 * "This viewer already counted a view of this video", until expiresAt.
 *
 * `_id` is `<videoId>:<viewer>` (services/videoService.js registerView). It
 * lives in MongoDB rather than in memory because on Lambda every instance had
 * its own memory: a viewer whose reloads reached different instances was
 * counted again on each of them.
 */
const viewMarkSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false, collection: 'viewmarks' }
);

// Removes marks some time after they expire; registerView compares expiresAt
// itself, so a mark the TTL monitor has not reached yet does not block a view.
viewMarkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('ViewMark', viewMarkSchema);
