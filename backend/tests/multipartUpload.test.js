const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');
const Comment = require('../src/models/Comment');
const Report = require('../src/models/Report');
const s3Service = require('../src/services/s3Service');
const limits = require('../src/config/uploadLimits');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/models/Report');
jest.mock('../src/services/s3Service');

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;
const PART = limits.MULTIPART_PART_SIZE_BYTES;

const oid = () => new mongoose.Types.ObjectId();

/** Video nháp đang tải multipart: 2 phần đầy và một phần cuối 5 MiB. */
const makeVideo = (overrides = {}) => ({
  _id: oid(),
  status: 'UPLOADING',
  rawS3Key: 'videos/u/v/a.mp4',
  fileSize: 2 * PART + 5 * MiB,
  multipartUploadId: 'upload-1',
  multipartPartSize: PART,
  save: jest.fn().mockResolvedValue(true),
  ...overrides,
});

/** Video.findOne(...).select(...) trả về `video` (hoặc null). */
const findOneReturns = (video) => {
  Video.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(video) });
};

/** Các phần S3 báo đã nhận, đúng như đã ký. */
const goodParts = (video) =>
  Array.from({ length: limits.countParts(video.fileSize, video.multipartPartSize) }, (_, i) => ({
    partNumber: i + 1,
    etag: `"etag-${i + 1}"`,
    size: limits.partSizeOf(i + 1, video.fileSize, video.multipartPartSize),
  }));

afterEach(() => {
  jest.clearAllMocks();
});

describe('initiateUpload — chọn đường tải lên', () => {
  const userId = oid();
  const createdVideo = () => {
    const video = { _id: oid(), save: jest.fn().mockResolvedValue(true) };
    Video.create.mockResolvedValue(video);
    s3Service.generateS3Key.mockReturnValue('videos/u/v/a.mp4');
    return video;
  };

  it('tệp nhỏ dùng presigned POST, không mở multipart', async () => {
    createdVideo();
    s3Service.generateVideoUploadPost.mockResolvedValue({ url: 'u', fields: {} });

    const result = await videoService.initiateUpload(userId, { filename: 'a.mp4', mimeType: 'video/mp4', fileSize: 50 * MiB });

    expect(s3Service.createMultipartUpload).not.toHaveBeenCalled();
    expect(result.upload).toEqual({ url: 'u', fields: {} });
    expect(result.multipart).toBeUndefined();
  });

  it('không khai dung lượng thì vẫn dùng presigned POST', async () => {
    createdVideo();
    s3Service.generateVideoUploadPost.mockResolvedValue({ url: 'u', fields: {} });

    const result = await videoService.initiateUpload(userId, { filename: 'a.mp4', mimeType: 'video/mp4' });

    expect(s3Service.createMultipartUpload).not.toHaveBeenCalled();
    expect(result.upload).toBeDefined();
  });

  it('tệp lớn mở lượt multipart, lưu uploadId và kích thước phần, trả thông số cho client', async () => {
    const video = createdVideo();
    s3Service.createMultipartUpload.mockResolvedValue('upload-xyz');

    const result = await videoService.initiateUpload(userId, { filename: 'a.mp4', mimeType: 'video/mp4', fileSize: GiB });

    expect(s3Service.createMultipartUpload).toHaveBeenCalledWith({ key: 'videos/u/v/a.mp4', contentType: 'video/mp4' });
    expect(video.multipartUploadId).toBe('upload-xyz');
    expect(video.multipartPartSize).toBe(PART);
    expect(video.rawS3Key).toBe('videos/u/v/a.mp4');
    expect(video.save).toHaveBeenCalledTimes(1);
    expect(result.multipart).toEqual({
      partSize: PART,
      partCount: 32,
      maxPartUrlsPerRequest: limits.MAX_PART_URLS_PER_REQUEST,
    });
    expect(result.upload).toBeUndefined();
    expect(s3Service.generateVideoUploadPost).not.toHaveBeenCalled();
  });

  it('không để lại bản nháp khi S3 từ chối mở lượt tải', async () => {
    const video = createdVideo();
    s3Service.createMultipartUpload.mockRejectedValue(new Error('AccessDenied'));
    Video.deleteOne.mockResolvedValue({ deletedCount: 1 });

    await expect(
      videoService.initiateUpload(userId, { filename: 'a.mp4', mimeType: 'video/mp4', fileSize: GiB })
    ).rejects.toThrow('AccessDenied');

    expect(Video.deleteOne).toHaveBeenCalledWith({ _id: video._id });
  });

  it('trần của presigned POST không vượt 5 GiB dù trần tải lên cao hơn', async () => {
    jest.resetModules();
    process.env.MAX_VIDEO_SIZE_GB = '20';
    try {
      const isolated = require('../src/services/videoService');
      const IsolatedVideo = require('../src/models/Video');
      const isolatedS3 = require('../src/services/s3Service');
      IsolatedVideo.create.mockResolvedValue({ _id: oid(), save: jest.fn().mockResolvedValue(true) });
      isolatedS3.generateS3Key.mockReturnValue('k');
      isolatedS3.generateVideoUploadPost.mockResolvedValue({ url: 'u', fields: {} });

      await isolated.initiateUpload(userId, { filename: 'a.mp4', mimeType: 'video/mp4' });

      expect(isolatedS3.generateVideoUploadPost).toHaveBeenCalledWith('k', 'video/mp4', 5 * GiB);
    } finally {
      delete process.env.MAX_VIDEO_SIZE_GB;
      jest.resetModules();
    }
  });
});

describe('getUploadConfig', () => {
  it('trả trần và ngưỡng multipart đang áp dụng', () => {
    expect(videoService.getUploadConfig()).toEqual({
      maxVideoSizeBytes: limits.MAX_VIDEO_SIZE_BYTES,
      multipartThresholdBytes: limits.MULTIPART_THRESHOLD_BYTES,
    });
  });
});

describe('getMultipartPartUrls', () => {
  const userId = oid();

  it('cấp URL cho đúng các phần, mỗi URL ký đúng dung lượng của phần đó', async () => {
    const video = makeVideo();
    findOneReturns(video);
    s3Service.presignUploadPart.mockImplementation(async ({ partNumber }) => `https://s3.example/part-${partNumber}`);

    const parts = await videoService.getMultipartPartUrls(video._id, userId, [1, 3]);

    expect(parts).toEqual([
      { partNumber: 1, size: PART, url: 'https://s3.example/part-1' },
      { partNumber: 3, size: 5 * MiB, url: 'https://s3.example/part-3' },
    ]);
    expect(s3Service.presignUploadPart).toHaveBeenCalledWith({
      key: 'videos/u/v/a.mp4',
      uploadId: 'upload-1',
      partNumber: 3,
      contentLength: 5 * MiB,
    });
  });

  it('truy vấn kèm điều kiện chủ sở hữu và đọc được uploadId bị ẩn', async () => {
    const video = makeVideo();
    const select = jest.fn().mockResolvedValue(video);
    Video.findOne.mockReturnValue({ select });
    s3Service.presignUploadPart.mockResolvedValue('u');
    const ownerId = oid();

    await videoService.getMultipartPartUrls(video._id, ownerId, [1]);

    expect(Video.findOne).toHaveBeenCalledWith({ _id: video._id, user: ownerId });
    expect(select).toHaveBeenCalledWith('+multipartUploadId');
  });

  it('404 khi video không tồn tại hoặc không thuộc người gọi', async () => {
    findOneReturns(null);
    await expect(videoService.getMultipartPartUrls(oid(), userId, [1])).rejects.toMatchObject({ statusCode: 404 });
  });

  it('409 khi không có lượt multipart nào đang dở', async () => {
    findOneReturns(makeVideo({ multipartUploadId: undefined }));
    await expect(videoService.getMultipartPartUrls(oid(), userId, [1])).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'NO_MULTIPART_UPLOAD',
    });

    findOneReturns(makeVideo({ status: 'PROCESSING' }));
    await expect(videoService.getMultipartPartUrls(oid(), userId, [1])).rejects.toMatchObject({ statusCode: 409 });
  });

  it.each([
    ['rỗng', []],
    ['không phải mảng', 'all'],
    ['thiếu', undefined],
    ['trùng nhau', [1, 1]],
    ['quá nhiều', Array.from({ length: limits.MAX_PART_URLS_PER_REQUEST + 1 }, (_, i) => i + 1)],
  ])('400 khi danh sách phần %s, và không ký gì', async (_label, partNumbers) => {
    findOneReturns(makeVideo({ fileSize: 100 * PART }));
    await expect(videoService.getMultipartPartUrls(oid(), userId, partNumbers)).rejects.toMatchObject({ statusCode: 400 });
    expect(s3Service.presignUploadPart).not.toHaveBeenCalled();
  });

  it.each([[0], [4], [-1], [1.5], ['1'], [NaN]])('400 khi số phần %p nằm ngoài tệp, và không ký gì', async (bad) => {
    findOneReturns(makeVideo()); // 3 phần
    await expect(videoService.getMultipartPartUrls(oid(), userId, [bad])).rejects.toMatchObject({ statusCode: 400 });
    expect(s3Service.presignUploadPart).not.toHaveBeenCalled();
  });

  it('dùng kích thước phần đã lưu cùng video, không dùng hằng số hiện tại', async () => {
    const video = makeVideo({ fileSize: 15 * MiB, multipartPartSize: 10 * MiB });
    findOneReturns(video);
    s3Service.presignUploadPart.mockResolvedValue('u');

    const parts = await videoService.getMultipartPartUrls(video._id, userId, [1, 2]);

    expect(parts.map((p) => p.size)).toEqual([10 * MiB, 5 * MiB]);
  });
});

describe('completeMultipartUpload', () => {
  const userId = oid();

  it('ghép bằng các phần S3 đã liệt kê (ETag từ S3), rồi chuyển sang PROCESSING và xoá uploadId', async () => {
    const video = makeVideo();
    findOneReturns(video);
    const parts = goodParts(video);
    s3Service.listParts.mockResolvedValue(parts);
    s3Service.completeMultipartUpload.mockResolvedValue({});

    const result = await videoService.completeMultipartUpload(video._id, userId);

    expect(s3Service.listParts).toHaveBeenCalledWith({ key: 'videos/u/v/a.mp4', uploadId: 'upload-1' });
    expect(s3Service.completeMultipartUpload).toHaveBeenCalledWith({
      key: 'videos/u/v/a.mp4',
      uploadId: 'upload-1',
      parts,
    });
    expect(result.status).toBe('PROCESSING');
    expect(video.multipartUploadId).toBeUndefined();
    expect(video.multipartPartSize).toBeUndefined();
    expect(video.save).toHaveBeenCalled();
  });

  it('video đã qua UPLOADING thì trả nguyên trạng, không đụng tới S3 (gọi lại vô hại)', async () => {
    const video = makeVideo({ status: 'PROCESSING', multipartUploadId: undefined });
    findOneReturns(video);

    await expect(videoService.completeMultipartUpload(video._id, userId)).resolves.toBe(video);
    expect(s3Service.listParts).not.toHaveBeenCalled();
    expect(s3Service.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('404 khi video không tồn tại hoặc không thuộc người gọi', async () => {
    findOneReturns(null);
    await expect(videoService.completeMultipartUpload(oid(), userId)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('409 khi không có lượt multipart nào đang dở', async () => {
    findOneReturns(makeVideo({ multipartUploadId: undefined }));
    await expect(videoService.completeMultipartUpload(oid(), userId)).rejects.toMatchObject({
      statusCode: 409,
      errorCode: 'NO_MULTIPART_UPLOAD',
    });
  });

  it('400 UPLOAD_INCOMPLETE khi thiếu phần, và không ghép', async () => {
    const video = makeVideo();
    findOneReturns(video);
    s3Service.listParts.mockResolvedValue(goodParts(video).slice(0, 2));

    await expect(videoService.completeMultipartUpload(video._id, userId)).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'UPLOAD_INCOMPLETE',
    });
    expect(s3Service.completeMultipartUpload).not.toHaveBeenCalled();
    expect(video.status).toBe('UPLOADING');
    expect(video.save).not.toHaveBeenCalled();
  });

  it('400 khi một phần có dung lượng khác dung lượng đã ký', async () => {
    const video = makeVideo();
    findOneReturns(video);
    const parts = goodParts(video);
    parts[1].size -= 1;
    s3Service.listParts.mockResolvedValue(parts);

    await expect(videoService.completeMultipartUpload(video._id, userId)).rejects.toMatchObject({ errorCode: 'UPLOAD_INCOMPLETE' });
    expect(s3Service.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('400 khi có phần thừa ngoài tệp, hoặc số phần không liền nhau', async () => {
    const video = makeVideo();
    findOneReturns(video);

    s3Service.listParts.mockResolvedValue([...goodParts(video), { partNumber: 4, etag: '"x"', size: PART }]);
    await expect(videoService.completeMultipartUpload(video._id, userId)).rejects.toMatchObject({ errorCode: 'UPLOAD_INCOMPLETE' });

    const gap = goodParts(video);
    gap[2].partNumber = 4;
    s3Service.listParts.mockResolvedValue(gap);
    await expect(videoService.completeMultipartUpload(video._id, userId)).rejects.toMatchObject({ errorCode: 'UPLOAD_INCOMPLETE' });

    expect(s3Service.completeMultipartUpload).not.toHaveBeenCalled();
  });

  it('lượt trước đã ghép xong nhưng chưa kịp ghi DB: nhận ra object đã có và chuyển sang PROCESSING', async () => {
    const video = makeVideo();
    findOneReturns(video);
    s3Service.listParts.mockRejectedValue(Object.assign(new Error('gone'), { name: 'NoSuchUpload' }));
    s3Service.objectExists.mockResolvedValue(true);
    process.env.S3_RAW_BUCKET_NAME = 'raw-bucket';

    const result = await videoService.completeMultipartUpload(video._id, userId);

    expect(s3Service.objectExists).toHaveBeenCalledWith('raw-bucket', 'videos/u/v/a.mp4');
    expect(s3Service.completeMultipartUpload).not.toHaveBeenCalled();
    expect(result.status).toBe('PROCESSING');
  });

  it('S3 không còn lượt tải lẫn object thì báo lỗi thay vì giả vờ thành công', async () => {
    const video = makeVideo();
    findOneReturns(video);
    s3Service.listParts.mockRejectedValue(Object.assign(new Error('gone'), { name: 'NoSuchUpload' }));
    s3Service.objectExists.mockResolvedValue(false);

    await expect(videoService.completeMultipartUpload(video._id, userId)).rejects.toThrow('gone');
    expect(video.status).toBe('UPLOADING');
  });

  it('lỗi S3 khác được ném ra, không bị nuốt', async () => {
    const video = makeVideo();
    findOneReturns(video);
    s3Service.listParts.mockRejectedValue(new Error('AccessDenied'));

    await expect(videoService.completeMultipartUpload(video._id, userId)).rejects.toThrow('AccessDenied');
    expect(s3Service.objectExists).not.toHaveBeenCalled();
  });
});

describe('deleteVideo — dọn lượt multipart dở', () => {
  const userId = oid();

  beforeEach(() => {
    process.env.S3_RAW_BUCKET_NAME = 'raw-bucket';
    process.env.S3_PROCESSED_BUCKET_NAME = 'processed-bucket';
    s3Service.deleteObject.mockResolvedValue();
    s3Service.deleteDirectory.mockResolvedValue();
    Comment.deleteMany.mockResolvedValue({});
    Report.deleteMany.mockResolvedValue({});
    Video.findByIdAndDelete.mockResolvedValue({});
  });

  it('huỷ lượt tải multipart của video nháp trước khi xoá', async () => {
    const video = makeVideo();
    findOneReturns(video);
    s3Service.abortMultipartUpload.mockResolvedValue({});

    await videoService.deleteVideo(video._id, userId);

    expect(s3Service.abortMultipartUpload).toHaveBeenCalledWith({ key: 'videos/u/v/a.mp4', uploadId: 'upload-1' });
    expect(Video.findByIdAndDelete).toHaveBeenCalledWith(video._id);
  });

  it('huỷ lỗi thì vẫn xoá video', async () => {
    const video = makeVideo();
    findOneReturns(video);
    s3Service.abortMultipartUpload.mockRejectedValue(new Error('AccessDenied'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    await videoService.deleteVideo(video._id, userId);

    expect(Video.findByIdAndDelete).toHaveBeenCalledWith(video._id);
    console.warn.mockRestore();
  });

  it('video đã qua UPLOADING không gọi huỷ multipart', async () => {
    const video = makeVideo({ status: 'READY', multipartUploadId: undefined });
    findOneReturns(video);

    await videoService.deleteVideo(video._id, userId);

    expect(s3Service.abortMultipartUpload).not.toHaveBeenCalled();
  });

  it('video nháp tải bằng POST (không có uploadId) không gọi huỷ multipart', async () => {
    const video = makeVideo({ multipartUploadId: undefined });
    findOneReturns(video);

    await videoService.deleteVideo(video._id, userId);

    expect(s3Service.abortMultipartUpload).not.toHaveBeenCalled();
  });
});
