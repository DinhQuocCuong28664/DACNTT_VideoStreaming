const { S3Client } = require('@aws-sdk/client-s3');
const s3Service = require('../src/services/s3Service');

describe('objectExists', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('true khi HeadObject thành công', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({});
    await expect(s3Service.objectExists('b', 'k')).resolves.toBe(true);
  });

  it('false khi S3 trả 404', async () => {
    const notFound = Object.assign(new Error('NotFound'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } });
    jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(notFound);
    await expect(s3Service.objectExists('b', 'k')).resolves.toBe(false);
  });

  it('ném lỗi khác ra ngoài thay vì coi là không có tệp', async () => {
    const denied = Object.assign(new Error('AccessDenied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } });
    jest.spyOn(S3Client.prototype, 'send').mockRejectedValue(denied);
    await expect(s3Service.objectExists('b', 'k')).rejects.toThrow('AccessDenied');
  });
});

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
