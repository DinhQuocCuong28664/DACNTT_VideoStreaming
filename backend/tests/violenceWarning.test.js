const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');
const s3Service = require('../src/services/s3Service');

jest.mock('../src/models/Video');
jest.mock('../src/services/s3Service');

describe('Violence Warning Feature Tests', () => {
  const mockUserId = new mongoose.Types.ObjectId();
  const mockVideoId = new mongoose.Types.ObjectId();

  beforeEach(() => {
    jest.clearAllMocks();
    s3Service.generateS3Key.mockReturnValue('raw/videos/user/test.mp4');
    s3Service.generatePresignedPutUrl = jest.fn().mockResolvedValue('https://s3.amazonaws.com/upload-url');
  });

  it('should persist hasViolence: true when initiated with violence flag', async () => {
    const mockDoc = {
      _id: mockVideoId,
      title: 'Action Scene',
      hasViolence: true,
      status: 'UPLOADING',
      save: jest.fn().mockResolvedValue(true),
    };
    Video.create.mockResolvedValue(mockDoc);

    const result = await videoService.initiateUpload(mockUserId, {
      title: 'Action Scene',
      filename: 'action.mp4',
      mimeType: 'video/mp4',
      fileSize: 1024 * 1024,
      hasViolence: true,
    });

    expect(Video.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Action Scene',
        hasViolence: true,
      })
    );
    expect(result.video.hasViolence).toBe(true);
  });

  it('should default hasViolence to false if omitted', async () => {
    const mockDoc = {
      _id: mockVideoId,
      title: 'Peaceful Nature',
      hasViolence: false,
      status: 'UPLOADING',
      save: jest.fn().mockResolvedValue(true),
    };
    Video.create.mockResolvedValue(mockDoc);

    const result = await videoService.initiateUpload(mockUserId, {
      title: 'Peaceful Nature',
      filename: 'nature.mp4',
      mimeType: 'video/mp4',
      fileSize: 1024 * 1024,
    });

    expect(Video.create).toHaveBeenCalledWith(
      expect.objectContaining({
        hasViolence: false,
      })
    );
    expect(result.video.hasViolence).toBe(false);
  });

  it('should allow updating hasViolence via updateVideo', async () => {
    const mockDoc = {
      _id: mockVideoId,
      user: mockUserId,
      title: 'Boxing Match',
      hasViolence: false,
      save: jest.fn().mockResolvedValue(true),
    };

    Video.findOne.mockResolvedValue(mockDoc);

    const updated = await videoService.updateVideo(mockVideoId, mockUserId, {
      hasViolence: true,
    });

    expect(mockDoc.hasViolence).toBe(true);
    expect(mockDoc.save).toHaveBeenCalled();
    expect(updated.hasViolence).toBe(true);
  });
});

describe('the violence warning automatic moderation set', () => {
  const ownerId = new mongoose.Types.ObjectId();
  const videoId = new mongoose.Types.ObjectId();
  const doc = (labels, hasViolence = true) => ({
    _id: videoId,
    user: ownerId,
    hasViolence,
    moderation: { status: 'approved', labels },
    save: jest.fn().mockResolvedValue(true),
  });

  afterEach(() => jest.clearAllMocks());

  it.each([
    ['an L2 label', [{ name: 'Graphic Violence', parentName: 'Violence', confidence: 96 }]],
    ['an L3 label alone', [{ name: 'Physical Violence', parentName: 'Graphic Violence', confidence: 93 }]],
  ])('cannot be switched off by the owner when moderation found %s', async (_, labels) => {
    const video = doc(labels);
    Video.findOne.mockResolvedValue(video);

    await expect(videoService.updateVideo(videoId, ownerId, { hasViolence: false, title: 'renamed' })).rejects.toMatchObject({
      statusCode: 403,
      errorCode: 'VIOLENCE_WARNING_LOCKED',
    });
    expect(video.hasViolence).toBe(true);
    expect(video.title).toBeUndefined();
    expect(video.save).not.toHaveBeenCalled();
  });

  it('still lets the owner change other fields and keep the warning on', async () => {
    const video = doc([{ name: 'Graphic Violence', parentName: 'Violence' }]);
    Video.findOne.mockResolvedValue(video);

    await videoService.updateVideo(videoId, ownerId, { title: 'renamed', hasViolence: true });

    expect(video.title).toBe('renamed');
    expect(video.hasViolence).toBe(true);
    expect(video.save).toHaveBeenCalled();
  });

  it('lets the owner remove a warning they set themselves', async () => {
    const video = doc([{ name: 'Smoking', parentName: 'Drugs & Tobacco Paraphernalia & Use' }]);
    Video.findOne.mockResolvedValue(video);

    await videoService.updateVideo(videoId, ownerId, { hasViolence: false });

    expect(video.hasViolence).toBe(false);
    expect(video.save).toHaveBeenCalled();
  });
});
