const s3Service = require('../src/services/s3Service');

describe('s3Service Unit Tests', () => {
  describe('generateS3Key', () => {
    it('should generate an S3 key incorporating userId, videoId, and sanitized filename', () => {
      const userId = 'user123';
      const videoId = '60c72b2f9b1d8b0015b6d1a1';
      const filename = 'my sample video!.mp4';

      const key = s3Service.generateS3Key(userId, videoId, filename);

      expect(key).toBe('videos/user123/60c72b2f9b1d8b0015b6d1a1/my_sample_video_.mp4');
    });

    it('should sanitize special characters in original filename', () => {
      const key = s3Service.generateS3Key('user1', 'video1', 'test@#$video.mov');
      expect(key).toBe('videos/user1/video1/test___video.mov');
    });
  });
});
