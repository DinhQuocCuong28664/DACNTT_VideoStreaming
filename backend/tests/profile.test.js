const mongoose = require('mongoose');
const profileService = require('../src/services/profileService');
const User = require('../src/models/User');

jest.mock('../src/models/User');

const DAY = 24 * 60 * 60 * 1000;

describe('Profile editing', () => {
  const userId = new mongoose.Types.ObjectId();
  const now = new Date('2026-10-22T12:00:00Z');

  const current = (overrides = {}) => ({
    _id: userId,
    username: 'oldname',
    displayName: 'Old',
    channelDescription: '',
    usernameChanges: [],
    ...overrides,
  });
  const findCurrent = (user) => {
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
  };

  beforeEach(() => {
    User.exists.mockResolvedValue(null);
    User.findOneAndUpdate.mockImplementation(async (filter, update) => ({ _id: userId, ...update.$set }));
  });
  afterEach(() => jest.clearAllMocks());

  it('renames the user and records the change', async () => {
    findCurrent(current());

    const result = await profileService.updateProfile(userId, { username: '  newname ' }, now);

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: userId, username: 'oldname' },
      {
        $set: { username: 'newname' },
        $push: { usernameChanges: { $each: [{ from: 'oldname', to: 'newname', changedAt: now }], $slice: -10 } },
      },
      expect.objectContaining({ runValidators: true })
    );
    expect(result.user.username).toBe('newname');
    expect(result.username.remaining).toBe(1);
  });

  it('allows two renames in fourteen days and refuses the third', async () => {
    findCurrent(
      current({
        usernameChanges: [
          { from: 'a', to: 'b', changedAt: new Date(now - 10 * DAY) },
          { from: 'b', to: 'oldname', changedAt: new Date(now - 2 * DAY) },
        ],
      })
    );

    await expect(profileService.updateProfile(userId, { username: 'third' }, now)).rejects.toMatchObject({
      statusCode: 429,
      errorCode: 'USERNAME_CHANGE_LIMIT',
    });
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('frees a rename once the oldest change leaves the window', async () => {
    findCurrent(
      current({
        usernameChanges: [
          { from: 'a', to: 'b', changedAt: new Date(now - 15 * DAY) },
          { from: 'b', to: 'oldname', changedAt: new Date(now - 2 * DAY) },
        ],
      })
    );

    const result = await profileService.updateProfile(userId, { username: 'fresh' }, now);
    expect(result.user.username).toBe('fresh');
    expect(result.username.remaining).toBe(0);
    expect(result.username.resetsAt).toEqual(new Date(now - 2 * DAY + 14 * DAY));
  });

  it('refuses a username that someone else has', async () => {
    findCurrent(current());
    User.exists.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

    await expect(profileService.updateProfile(userId, { username: 'taken' }, now)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'USERNAME_TAKEN',
    });
  });

  it('turns a duplicate key from a racing registration into USERNAME_TAKEN', async () => {
    findCurrent(current());
    User.findOneAndUpdate.mockRejectedValue(Object.assign(new Error('dup'), { code: 11000 }));

    await expect(profileService.updateProfile(userId, { username: 'raced' }, now)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'USERNAME_TAKEN',
    });
  });

  it('reports a concurrent rename instead of passing the allowance twice', async () => {
    findCurrent(current());
    User.findOneAndUpdate.mockResolvedValue(null);

    await expect(profileService.updateProfile(userId, { username: 'second' }, now)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'PROFILE_CHANGED',
    });
  });

  it('keeps the same username without using up a change', async () => {
    findCurrent(current());

    await profileService.updateProfile(userId, { username: 'oldname', displayName: 'New Name' }, now);

    expect(User.exists).not.toHaveBeenCalled();
    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      { _id: userId, username: 'oldname' },
      { $set: { displayName: 'New Name' } },
      expect.anything()
    );
  });

  it('updates the display name and channel description only', async () => {
    findCurrent(current());

    await profileService.updateProfile(userId, { displayName: ' Cuong ', channelDescription: 'About me' }, now);

    expect(User.findOneAndUpdate).toHaveBeenCalledWith(
      expect.anything(),
      { $set: { displayName: 'Cuong', channelDescription: 'About me' } },
      expect.anything()
    );
  });

  it('validates lengths and types before touching the database', async () => {
    const cases = [
      { username: 'ab' },
      { username: 'x'.repeat(31) },
      { username: { $ne: 'x' } },
      { displayName: 'x'.repeat(51) },
      { channelDescription: 'x'.repeat(1001) },
    ];
    for (const input of cases) {
      await expect(profileService.updateProfile(userId, input, now)).rejects.toMatchObject({ statusCode: 400 });
    }
    expect(User.findById).not.toHaveBeenCalled();
  });

  it('returns the user unchanged when nothing is sent', async () => {
    const user = current();
    findCurrent(user);

    const result = await profileService.updateProfile(userId, {}, now);

    expect(result.user).toBe(user);
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('reports the allowance with no history', () => {
    expect(profileService.usernameAllowance(undefined, now.getTime())).toEqual({ remaining: 2, resetsAt: null });
  });
});
