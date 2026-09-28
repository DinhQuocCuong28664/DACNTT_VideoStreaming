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

/**
 * Tải lên bằng presigned POST: S3 kiểm tra policy trước khi nhận tệp.
 *
 * Presigned PUT của SDK v3 chỉ ký header `host` — người tải lên tự chọn
 * Content-Type và dung lượng. Các test dưới đây giải mã policy thật do SDK sinh
 * ra (ký ngoại tuyến bằng khoá giả) để chắc chắn các điều kiện nằm trong đó.
 */
describe('createUploadPost — policy do S3 kiểm tra', () => {
  const savedEnv = { ...process.env };

  beforeAll(() => {
    process.env.AWS_REGION = 'ap-southeast-1';
    process.env.AWS_ACCESS_KEY_ID = 'AKIAEXAMPLEEXAMPLE00';
    process.env.AWS_SECRET_ACCESS_KEY = 'example-secret-key-for-offline-signing00';
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  const decodePolicy = (fields) => JSON.parse(Buffer.from(fields.Policy, 'base64').toString('utf8'));

  it('ghim key, Content-Type và khoảng dung lượng', async () => {
    const { url, fields } = await s3Service.createUploadPost({
      bucket: 'raw-bucket',
      key: 'videos/u/v/a.mp4',
      contentType: 'video/mp4',
      maxBytes: 2048,
    });

    expect(url).toContain('raw-bucket');
    expect(fields.key).toBe('videos/u/v/a.mp4');
    expect(fields['Content-Type']).toBe('video/mp4');

    const { conditions } = decodePolicy(fields);
    expect(conditions).toContainEqual({ key: 'videos/u/v/a.mp4' });
    expect(conditions).toContainEqual({ 'Content-Type': 'video/mp4' });
    expect(conditions).toContainEqual(['content-length-range', 1, 2048]);
  });

  it('hết hạn sau 15 phút theo mặc định', async () => {
    const before = Date.now();
    const { fields } = await s3Service.createUploadPost({
      bucket: 'b',
      key: 'k',
      contentType: 'image/png',
      maxBytes: 1,
    });
    const expiresAt = Date.parse(decodePolicy(fields).expiration);

    expect(expiresAt - before).toBeGreaterThan(14 * 60 * 1000);
    expect(expiresAt - before).toBeLessThanOrEqual(15 * 60 * 1000 + 1000);
  });
});

describe('Key ảnh đại diện', () => {
  it('lấy đuôi từ MIME đã kiểm tra, không từ tên tệp', () => {
    expect(s3Service.generateAvatarKey('u1', 'image/png')).toMatch(/^avatars\/u1\/\d+\.png$/);
    expect(s3Service.generateAvatarKey('u1', 'image/jpeg')).toMatch(/\.jpg$/);
  });

  it('từ chối MIME không phải ảnh', () => {
    expect(() => s3Service.generateAvatarKey('u1', 'text/html')).toThrow();
  });

  it('isAvatarKeyOf chỉ nhận key đúng dạng trong thư mục của chính người dùng', () => {
    expect(s3Service.isAvatarKeyOf('u1', 'avatars/u1/1790000000000.webp')).toBe(true);
    expect(s3Service.isAvatarKeyOf('u1', 'avatars/u1/1790000000000.html')).toBe(false);
    expect(s3Service.isAvatarKeyOf('u1', 'avatars/u2/1790000000000.png')).toBe(false);
    expect(s3Service.isAvatarKeyOf('u1', 'avatars/u1/../u2/1.png')).toBe(false);
    expect(s3Service.isAvatarKeyOf('u1', null)).toBe(false);
  });
});
