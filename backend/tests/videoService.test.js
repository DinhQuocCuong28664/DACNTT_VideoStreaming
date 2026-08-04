const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');
const Comment = require('../src/models/Comment');
const s3Service = require('../src/services/s3Service');

// Mock dependencies
jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/services/s3Service');

describe('videoService Unit Tests', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initiateUpload', () => {
    it('should create DB record first with UPLOADING status, generate S3 key with _id, and return uploadUrl', async () => {
      const mockVideoId = new mongoose.Types.ObjectId();
      const mockUserId = new mongoose.Types.ObjectId();

      const mockCreatedVideo = {
        _id: mockVideoId,
        title: 'Test Video',
        user: mockUserId,
        status: 'UPLOADING',
        save: jest.fn().mockResolvedValue(true),
      };

      Video.create.mockResolvedValue(mockCreatedVideo);
      s3Service.generateS3Key.mockReturnValue(`videos/${mockUserId}/${mockVideoId}/sample.mp4`);
      s3Service.generatePresignedUploadUrl.mockResolvedValue('https://s3.amazonaws.com/presigned-url');

      const result = await videoService.initiateUpload(mockUserId, {
        title: 'Test Video',
        filename: 'sample.mp4',
        mimeType: 'video/mp4',
      });

      expect(Video.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Video',
          user: mockUserId,
          status: 'UPLOADING',
        })
      );
      expect(s3Service.generateS3Key).toHaveBeenCalledWith(
        mockUserId,
        mockVideoId.toString(),
        'sample.mp4'
      );
      expect(mockCreatedVideo.rawS3Key).toBe(`videos/${mockUserId}/${mockVideoId}/sample.mp4`);
      expect(mockCreatedVideo.save).toHaveBeenCalled();
      expect(result.uploadUrl).toBe('https://s3.amazonaws.com/presigned-url');
    });
  });

  describe('getVideoById security checks', () => {
    const videoId = new mongoose.Types.ObjectId().toString();
    const ownerId = new mongoose.Types.ObjectId();
    const otherUserId = new mongoose.Types.ObjectId();

    const mockVideo = {
      _id: videoId,
      user: { _id: ownerId },
      visibility: 'public',
      status: 'READY',
    };

    it('should return video for public READY video when unauthenticated', async () => {
      Video.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockVideo),
      });

      const video = await videoService.getVideoById(videoId, null);
      expect(video).toEqual(mockVideo);
    });

    it('should throw 400 error for unauthenticated user accessing PROCESSING video', async () => {
      const processingVideo = { ...mockVideo, status: 'PROCESSING' };
      Video.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(processingVideo),
      });

      await expect(videoService.getVideoById(videoId, null)).rejects.toThrow(
        'Video is still processing'
      );
    });

    it('should throw 404 error for unauthenticated user accessing private video', async () => {
      const privateVideo = { ...mockVideo, visibility: 'private' };
      Video.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(privateVideo),
      });

      await expect(videoService.getVideoById(videoId, { _id: otherUserId })).rejects.toThrow(
        'Video not found'
      );
    });

    it('should allow owner to access their own private and PROCESSING video', async () => {
      const privateProcessingVideo = { ...mockVideo, visibility: 'private', status: 'PROCESSING' };
      Video.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(privateProcessingVideo),
      });

      const video = await videoService.getVideoById(videoId, { _id: ownerId });
      expect(video).toEqual(privateProcessingVideo);
    });
  });

  describe('deleteComment authorization', () => {
    const commentId = new mongoose.Types.ObjectId().toString();
    const commentAuthorId = new mongoose.Types.ObjectId();
    const videoOwnerId = new mongoose.Types.ObjectId();
    const strangerId = new mongoose.Types.ObjectId();

    const mockComment = {
      _id: commentId,
      user: commentAuthorId,
      video: { _id: 'vid123', user: videoOwnerId },
    };

    it('should allow comment author to delete comment', async () => {
      Comment.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockComment),
      });
      Comment.findByIdAndDelete.mockResolvedValue(mockComment);

      const deleted = await videoService.deleteComment(commentId, commentAuthorId);
      expect(deleted).toEqual(mockComment);
    });

    it('should allow video owner to delete comment', async () => {
      Comment.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockComment),
      });
      Comment.findByIdAndDelete.mockResolvedValue(mockComment);

      const deleted = await videoService.deleteComment(commentId, videoOwnerId);
      expect(deleted).toEqual(mockComment);
    });

    it('should throw 403 error if a stranger tries to delete comment', async () => {
      Comment.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(mockComment),
      });

      await expect(videoService.deleteComment(commentId, strangerId)).rejects.toThrow(
        'Not authorized to delete this comment'
      );
    });
  });

  describe('confirmUpload idempotency', () => {
    const videoId = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId();

    it('should transition status from UPLOADING to PROCESSING', async () => {
      const uploadingVideo = {
        _id: videoId,
        user: userId,
        status: 'UPLOADING',
        save: jest.fn().mockResolvedValue(true),
      };

      Video.findOne.mockResolvedValue(uploadingVideo);

      const updated = await videoService.confirmUpload(videoId, userId);
      expect(uploadingVideo.status).toBe('PROCESSING');
      expect(uploadingVideo.save).toHaveBeenCalled();
      expect(updated).toEqual(uploadingVideo);
    });

    it('should be idempotent and return video without throwing error if status is already PROCESSING or READY', async () => {
      const readyVideo = {
        _id: videoId,
        user: userId,
        status: 'READY',
        save: jest.fn(),
      };

      Video.findOne.mockResolvedValue(readyVideo);

      const result = await videoService.confirmUpload(videoId, userId);
      expect(readyVideo.save).not.toHaveBeenCalled();
      expect(result).toEqual(readyVideo);
    });
  });

  describe('getAllVideos search regex safety', () => {
    it('should safely escape special regex characters in search query without crashing', async () => {
      Video.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            skip: jest.fn().mockReturnValue({
              limit: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
      Video.countDocuments.mockResolvedValue(0);

      const result = await videoService.getAllVideos(1, 12, 'Tất cả', '[test] (search) *+?');
      expect(result.videos).toEqual([]);
      expect(Video.find).toHaveBeenCalled();
    });
  });
});
