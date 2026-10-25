const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');

jest.mock('../src/models/Video');
jest.mock('../src/services/s3Service');

describe('HLS AES-128 Encryption Key Service Tests', () => {
  const mockVideoId = new mongoose.Types.ObjectId();
  const mockOwnerId = new mongoose.Types.ObjectId();
  const mockStrangerId = new mongoose.Types.ObjectId();
  const mockKeyHex = '0123456789abcdef0123456789abcdef'; // 16 bytes = 32 hex

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 404 if video is not found', async () => {
    Video.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue(null),
    });

    await expect(videoService.getVideoKey(mockVideoId)).rejects.toMatchObject({
      statusCode: 404,
      message: 'Video not found',
    });
  });

  it('should return 403 if video is private and requester is not owner/admin', async () => {
    Video.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: mockVideoId,
        user: mockOwnerId,
        visibility: 'private',
        encryptionKey: mockKeyHex,
      }),
    });

    await expect(
      videoService.getVideoKey(mockVideoId, { _id: mockStrangerId, role: 'user' })
    ).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'VIDEO_PRIVATE',
    });
  });

  it('should allow owner to get key for private video', async () => {
    Video.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: mockVideoId,
        user: mockOwnerId,
        visibility: 'private',
        encryptionKey: mockKeyHex,
      }),
    });

    const buffer = await videoService.getVideoKey(mockVideoId, { _id: mockOwnerId, role: 'user' });
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBe(16);
    expect(buffer.toString('hex')).toBe(mockKeyHex);
  });

  it('should return 403 if video is blocked by moderation and user is not admin', async () => {
    Video.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: mockVideoId,
        user: mockOwnerId,
        visibility: 'public',
        moderation: { status: 'blocked' },
        encryptionKey: mockKeyHex,
      }),
    });

    await expect(videoService.getVideoKey(mockVideoId, null)).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'VIDEO_REMOVED',
    });
  });

  it('should return 404 if video has no encryption key', async () => {
    Video.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: mockVideoId,
        user: mockOwnerId,
        visibility: 'public',
        encryptionKey: null,
      }),
    });

    await expect(videoService.getVideoKey(mockVideoId, null)).rejects.toMatchObject({
      statusCode: 404,
      errorCode: 'KEY_NOT_FOUND',
    });
  });

  it('should return 16-byte Buffer for public video with valid key', async () => {
    Video.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({
        _id: mockVideoId,
        user: mockOwnerId,
        visibility: 'public',
        encryptionKey: mockKeyHex,
      }),
    });

    const buffer = await videoService.getVideoKey(mockVideoId, null);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBe(16);
    expect(buffer.toString('hex')).toBe(mockKeyHex);
  });
});
