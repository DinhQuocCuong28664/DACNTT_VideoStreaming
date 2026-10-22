const User = require('../models/User');
const httpError = require('../utils/httpError');

/**
 * Editing one's own profile: username, display name and channel description.
 *
 * A username may change twice in fourteen days, the rule YouTube applies to
 * handles. The old name is free for others at once, as on GitHub; nothing in
 * the app links by username (channels use /channel/:userId), so no redirect is
 * needed.
 */
const USERNAME_MIN = 3;
const USERNAME_MAX = 30;
const DISPLAY_NAME_MAX = 50;
const CHANNEL_DESCRIPTION_MAX = 1000;
const USERNAME_CHANGES_PER_WINDOW = 2;
const USERNAME_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const USERNAME_HISTORY_KEPT = 10;

const optionalText = (value, field, max) => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw httpError(400, `${field} must be a string`);
  const text = value.trim();
  if (text.length > max) throw httpError(400, `${field} cannot exceed ${max} characters`);
  return text;
};

/** Changes inside the window that ends at `now`. */
const recentChanges = (changes, now) =>
  (changes || []).filter((c) => c.changedAt && now - new Date(c.changedAt).getTime() < USERNAME_WINDOW_MS);

/**
 * How many username changes are left now, and when the next one frees up.
 * @returns {{ remaining: number, resetsAt: Date|null }}
 */
const usernameAllowance = (changes, now = Date.now()) => {
  const recent = recentChanges(changes, now);
  const remaining = Math.max(0, USERNAME_CHANGES_PER_WINDOW - recent.length);
  if (remaining > 0 || recent.length === 0) return { remaining, resetsAt: null };
  const oldest = Math.min(...recent.map((c) => new Date(c.changedAt).getTime()));
  return { remaining, resetsAt: new Date(oldest + USERNAME_WINDOW_MS) };
};

const usernameTaken = () => httpError.localized(409, 'profile.usernameTaken', 'USERNAME_TAKEN');

/**
 * Applies the fields that are present. Returns the updated user and the
 * username allowance after the change.
 */
const updateProfile = async (userId, input = {}, now = new Date()) => {
  const username = optionalText(input.username, 'Username', USERNAME_MAX);
  const displayName = optionalText(input.displayName, 'Display name', DISPLAY_NAME_MAX);
  const channelDescription = optionalText(input.channelDescription, 'Channel description', CHANNEL_DESCRIPTION_MAX);

  if (username !== undefined && username.length < USERNAME_MIN) {
    throw httpError(400, `Username must be at least ${USERNAME_MIN} characters`);
  }

  const current = await User.findById(userId).select('+usernameChanges');
  if (!current) throw httpError(404, 'User not found');

  const set = {};
  if (displayName !== undefined) set.displayName = displayName;
  if (channelDescription !== undefined) set.channelDescription = channelDescription;

  const update = {};
  let changes = current.usernameChanges || [];
  const renaming = username !== undefined && username !== current.username;

  if (renaming) {
    if (usernameAllowance(changes, now.getTime()).remaining === 0) {
      throw httpError.localized(429, 'profile.usernameLimit', 'USERNAME_CHANGE_LIMIT');
    }
    if (await User.exists({ username, _id: { $ne: current._id } })) throw usernameTaken();

    set.username = username;
    const entry = { from: current.username, to: username, changedAt: now };
    update.$push = { usernameChanges: { $each: [entry], $slice: -USERNAME_HISTORY_KEPT } };
    changes = [...changes, entry].slice(-USERNAME_HISTORY_KEPT);
  }

  if (Object.keys(set).length === 0) {
    return { user: current, username: usernameAllowance(changes, now.getTime()) };
  }
  update.$set = set;

  let updated;
  try {
    // Matching the old username makes two renames racing each other fail
    // instead of both passing the allowance check.
    updated = await User.findOneAndUpdate({ _id: current._id, username: current.username }, update, {
      returnDocument: 'after',
      runValidators: true,
    });
  } catch (err) {
    if (err && err.code === 11000) throw usernameTaken();
    throw err;
  }
  if (!updated) throw httpError.localized(409, 'profile.changedMeanwhile', 'PROFILE_CHANGED');

  return { user: updated, username: usernameAllowance(changes, now.getTime()) };
};

module.exports = {
  updateProfile,
  usernameAllowance,
  USERNAME_CHANGES_PER_WINDOW,
  USERNAME_WINDOW_MS,
};
