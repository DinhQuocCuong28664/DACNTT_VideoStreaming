const mongoose = require('mongoose');
const { updateAvatar } = require('../src/controllers/userController');
const User = require('../src/models/User');
const s3Service = require('../src/services/s3Service');
const avatarModeration = require('../src/services/avatarModeration');

jest.mock('../src/models/User');
jest.mock('../src/services/s3Service');
jest.mock('../src/services/avatarModeration');

const run = async (body, userId) => {
  const req = { body, user: { _id: userId } };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  await updateAvatar(req, res, next);
  return { res, next };
};

describe('Saving a new avatar', () => {
  const userId = new mongoose.Types.ObjectId();
  const key = `avatars/${userId}/1790000000000.png`;

  beforeEach(() => {
    process.env.S3_STATIC_BUCKET_NAME = 'static-bucket';
    s3Service.isAvatarKeyOf.mockReturnValue(true);
    s3Service.getAvatarPublicUrl.mockReturnValue('https://example/avatar.png');
    s3Service.deleteObject.mockResolvedValue();
    User.findByIdAndUpdate.mockResolvedValue({ _id: userId, avatar: 'https://example/avatar.png' });
  });
  afterEach(() => jest.clearAllMocks());

  it('attaches a picture that passes screening', async () => {
    avatarModeration.checkAvatar.mockResolvedValue({ allowed: true, labels: [] });

    const { res, next } = await run({ key }, userId);

    expect(avatarModeration.checkAvatar).toHaveBeenCalledWith({ bucket: 'static-bucket', key });
    expect(User.findByIdAndUpdate).toHaveBeenCalledWith(userId, { avatar: 'https://example/avatar.png' }, expect.anything());
    expect(s3Service.deleteObject).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
  });

  it('deletes a refused picture and keeps the old avatar', async () => {
    avatarModeration.checkAvatar.mockResolvedValue({ allowed: false, reason: 'labels', labels: ['Graphic Violence'] });

    const { next } = await run({ key }, userId);

    expect(s3Service.deleteObject).toHaveBeenCalledWith('static-bucket', key);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422, errorCode: 'AVATAR_REJECTED', messageKey: 'avatar.rejected' }));
  });

  it('explains an unreadable file differently from a violating one', async () => {
    avatarModeration.checkAvatar.mockResolvedValue({ allowed: false, reason: 'unreadable', labels: [] });

    const { next } = await run({ key }, userId);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 422, messageKey: 'avatar.unreadable' }));
  });

  it('deletes the unscreened picture when the check cannot run', async () => {
    avatarModeration.checkAvatar.mockRejectedValue(
      Object.assign(new Error('unavailable'), { statusCode: 503, errorCode: 'AVATAR_CHECK_UNAVAILABLE' })
    );

    const { next } = await run({ key }, userId);

    expect(s3Service.deleteObject).toHaveBeenCalledWith('static-bucket', key);
    expect(User.findByIdAndUpdate).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 503 }));
  });

  it('still reports the refusal when deleting the picture fails', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    avatarModeration.checkAvatar.mockResolvedValue({ allowed: false, reason: 'labels', labels: ['Hate Symbols'] });
    s3Service.deleteObject.mockRejectedValue(new Error('access denied'));

    const { next } = await run({ key }, userId);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 'AVATAR_REJECTED' }));
    spy.mockRestore();
  });

  it('never screens a key outside the user own folder', async () => {
    s3Service.isAvatarKeyOf.mockReturnValue(false);

    const { next } = await run({ key: 'avatars/someone-else/1.png' }, userId);

    expect(avatarModeration.checkAvatar).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });
});
