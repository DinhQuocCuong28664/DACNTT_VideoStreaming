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

/**
 * Tải lên multipart: URL ký sẵn cho từng phần.
 *
 * Hai điều dưới đây đã được kiểm chứng với S3 thật khi thiết kế: (1) URL phải ký
 * `content-length`, nếu không S3 nhận phần có dung lượng bất kỳ và trần tải lên
 * không còn nằm ở S3 (có ký thì phần sai dung lượng bị S3 từ chối 403); (2) URL
 * không nên chứa checksum: SDK mới mặc định chèn `x-amz-checksum-crc32=AAAAAA==`
 * (checksum body rỗng). S3 hiện vẫn nhận phần đi kèm giá trị đó, nên (2) là giữ
 * URL sạch chứ không phải chặn một lỗi đang xảy ra.
 */
describe('tải lên multipart', () => {
  const savedEnv = { ...process.env };

  beforeAll(() => {
    process.env.AWS_REGION = 'ap-southeast-1';
    process.env.AWS_ACCESS_KEY_ID = 'test-access-key-id';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-access-key-for-offline-signing';
    process.env.S3_RAW_BUCKET_NAME = 'raw-bucket';
  });

  afterAll(() => {
    process.env = savedEnv;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const sentCommands = () => {
    const calls = [];
    return { calls, spy: jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (cmd) => {
      calls.push({ name: cmd.constructor.name, input: cmd.input });
      return calls.responder ? calls.responder(cmd) : {};
    }) };
  };

  describe('presignUploadPart', () => {
    const sign = async (overrides = {}) =>
      new URL(
        await s3Service.presignUploadPart({
          key: 'videos/u/v/a.mp4',
          uploadId: 'upload-1',
          partNumber: 3,
          contentLength: 33554432,
          ...overrides,
        })
      );

    it('ký content-length: S3 từ chối phần có dung lượng khác', async () => {
      const url = await sign();
      expect(url.searchParams.get('X-Amz-SignedHeaders')).toBe('content-length;host');
    });

    it('trỏ đúng bucket, key, uploadId và số phần', async () => {
      const url = await sign();
      expect(url.hostname).toContain('raw-bucket');
      expect(url.pathname).toBe('/videos/u/v/a.mp4');
      expect(url.searchParams.get('partNumber')).toBe('3');
      expect(url.searchParams.get('uploadId')).toBe('upload-1');
    });

    it('KHÔNG chứa tham số checksum mà trình duyệt không thể đáp ứng', async () => {
      const url = await sign();
      const names = [...url.searchParams.keys()].map((k) => k.toLowerCase());
      expect(names.filter((k) => k.includes('checksum'))).toEqual([]);
    });

    it('hết hạn sau 15 phút theo mặc định', async () => {
      const url = await sign();
      expect(Number(url.searchParams.get('X-Amz-Expires'))).toBe(900);
    });
  });

  describe('createMultipartUpload', () => {
    it('mở lượt tải với Content-Type đã kiểm tra và trả uploadId', async () => {
      const { calls } = sentCommands();
      calls.responder = () => ({ UploadId: 'upload-xyz' });

      await expect(s3Service.createMultipartUpload({ key: 'videos/u/v/a.mp4', contentType: 'video/mp4' })).resolves.toBe('upload-xyz');
      expect(calls[0]).toEqual({
        name: 'CreateMultipartUploadCommand',
        input: { Bucket: 'raw-bucket', Key: 'videos/u/v/a.mp4', ContentType: 'video/mp4' },
      });
    });
  });

  describe('listParts', () => {
    it('đọc hết các trang và trả số phần, ETag, dung lượng', async () => {
      const { calls } = sentCommands();
      const pages = [
        { Parts: [{ PartNumber: 1, ETag: '"a"', Size: 10 }, { PartNumber: 2, ETag: '"b"', Size: 10 }], IsTruncated: true, NextPartNumberMarker: '2' },
        { Parts: [{ PartNumber: 3, ETag: '"c"', Size: 4 }], IsTruncated: false },
      ];
      calls.responder = () => pages.shift();

      const parts = await s3Service.listParts({ key: 'k', uploadId: 'u' });

      expect(parts).toEqual([
        { partNumber: 1, etag: '"a"', size: 10 },
        { partNumber: 2, etag: '"b"', size: 10 },
        { partNumber: 3, etag: '"c"', size: 4 },
      ]);
      expect(calls).toHaveLength(2);
      expect(calls[0].input.PartNumberMarker).toBeUndefined();
      expect(calls[1].input.PartNumberMarker).toBe('2');
    });

    it('lượt tải chưa có phần nào trả mảng rỗng', async () => {
      const { calls } = sentCommands();
      calls.responder = () => ({ IsTruncated: false });
      await expect(s3Service.listParts({ key: 'k', uploadId: 'u' })).resolves.toEqual([]);
    });
  });

  describe('completeMultipartUpload / abortMultipartUpload', () => {
    it('ghép bằng đúng số phần và ETag đã liệt kê', async () => {
      const { calls } = sentCommands();
      await s3Service.completeMultipartUpload({
        key: 'k',
        uploadId: 'u',
        parts: [{ partNumber: 1, etag: '"a"', size: 10 }, { partNumber: 2, etag: '"b"', size: 4 }],
      });
      expect(calls[0]).toEqual({
        name: 'CompleteMultipartUploadCommand',
        input: {
          Bucket: 'raw-bucket',
          Key: 'k',
          UploadId: 'u',
          MultipartUpload: { Parts: [{ PartNumber: 1, ETag: '"a"' }, { PartNumber: 2, ETag: '"b"' }] },
        },
      });
    });

    it('huỷ lượt tải đúng uploadId', async () => {
      const { calls } = sentCommands();
      await s3Service.abortMultipartUpload({ key: 'k', uploadId: 'u' });
      expect(calls[0]).toEqual({
        name: 'AbortMultipartUploadCommand',
        input: { Bucket: 'raw-bucket', Key: 'k', UploadId: 'u' },
      });
    });
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
