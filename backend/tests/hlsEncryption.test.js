const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');
const ChannelMembership = require('../src/models/ChannelMembership');

jest.mock('../src/models/Video');
jest.mock('../src/models/ChannelMembership');
jest.mock('../src/services/s3Service');

describe('HLS AES-128 Encryption Key Service Tests', () => {
  const mockVideoId = new mongoose.Types.ObjectId();
  const mockOwnerId = new mongoose.Types.ObjectId();
  const mockStrangerId = new mongoose.Types.ObjectId();
  const mockKeyHex = '0123456789abcdef0123456789abcdef'; // 16 bytes = 32 hex
  const stranger = { _id: mockStrangerId, role: 'user' };

  /**
   * getVideoKey reads the video twice: getPlayableVideo loads it with the
   * owner populated, then the key is loaded with select('+encryptionKey').
   */
  let selectKey;
  const mockVideo = (fields) => {
    const doc = fields && {
      _id: mockVideoId,
      user: mockOwnerId,
      visibility: 'public',
      status: 'READY',
      encryptionKey: mockKeyHex,
      ...fields,
    };
    const populated = doc && {
      ...doc,
      user: { _id: mockOwnerId },
      toObject() {
        return { ...this };
      },
    };
    selectKey = jest.fn().mockResolvedValue(doc);
    Video.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(populated),
      select: selectKey,
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    ChannelMembership.exists.mockResolvedValue(null);
  });

  it('should return 404 if video is not found', async () => {
    mockVideo(null);

    await expect(videoService.getVideoKey(mockVideoId)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Video not found',
    });
  });

  it('answers a private video like playback does (404) for a stranger', async () => {
    mockVideo({ visibility: 'private' });

    await expect(videoService.getVideoKey(mockVideoId, stranger)).rejects.toMatchObject({ statusCode: 404 });
    expect(selectKey).not.toHaveBeenCalled();
  });

  it('should allow owner to get key for private video', async () => {
    mockVideo({ visibility: 'private' });

    const buffer = await videoService.getVideoKey(mockVideoId, { _id: mockOwnerId, role: 'user' });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBe(16);
    expect(buffer.toString('hex')).toBe(mockKeyHex);
  });

  it('should return 403 if video is blocked by moderation and user is not admin', async () => {
    mockVideo({ moderation: { status: 'blocked' } });

    await expect(videoService.getVideoKey(mockVideoId, null)).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'VIDEO_REMOVED',
    });
  });

  it('refuses the key of a video under review to viewers', async () => {
    mockVideo({ moderation: { status: 'flagged' } });

    await expect(videoService.getVideoKey(mockVideoId, stranger)).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'VIDEO_UNDER_REVIEW',
    });
  });

  describe('members-only video', () => {
    it('refuses the key to a signed-in viewer who is not a member', async () => {
      mockVideo({ accessLevel: 'members_only', requiredTierLevel: 2 });

      await expect(videoService.getVideoKey(mockVideoId, stranger)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'MEMBERS_ONLY_CONTENT',
      });
      expect(ChannelMembership.exists).toHaveBeenCalledWith(
        expect.objectContaining({
          user: mockStrangerId,
          channel: mockOwnerId,
          status: 'active',
          tierLevel: { $gte: 2 },
        })
      );
      expect(selectKey).not.toHaveBeenCalled();
    });

    it('refuses the key to an anonymous viewer', async () => {
      mockVideo({ accessLevel: 'members_only' });

      await expect(videoService.getVideoKey(mockVideoId, null)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'MEMBERS_ONLY_CONTENT',
      });
      expect(selectKey).not.toHaveBeenCalled();
    });

    it('gives the key to an active member of the required tier', async () => {
      mockVideo({ accessLevel: 'members_only' });
      ChannelMembership.exists.mockResolvedValue({ _id: new mongoose.Types.ObjectId() });

      const buffer = await videoService.getVideoKey(mockVideoId, stranger);
      expect(buffer.toString('hex')).toBe(mockKeyHex);
    });

    it('gives the key to the channel owner', async () => {
      mockVideo({ accessLevel: 'members_only' });

      const buffer = await videoService.getVideoKey(mockVideoId, { _id: mockOwnerId, role: 'user' });
      expect(buffer.toString('hex')).toBe(mockKeyHex);
      expect(ChannelMembership.exists).not.toHaveBeenCalled();
    });
  });

  it('should return 404 if video has no encryption key', async () => {
    mockVideo({ encryptionKey: null });

    await expect(videoService.getVideoKey(mockVideoId, null)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: 'KEY_NOT_FOUND',
    });
  });

  it('should return 16-byte Buffer for public video with valid key', async () => {
    mockVideo({});

    const buffer = await videoService.getVideoKey(mockVideoId, null);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBe(16);
    expect(buffer.toString('hex')).toBe(mockKeyHex);
  });
});
