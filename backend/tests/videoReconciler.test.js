const Video = require('../src/models/Video');
const s3Service = require('../src/services/s3Service');
const {
  reconcileStuckVideos,
  STUCK_PROCESSING_MS,
  ABANDONED_UPLOAD_MS,
} = require('../src/services/videoReconciler');

jest.mock('../src/models/Video');
jest.mock('../src/services/s3Service');

/**
 * Bộ đối soát đưa video kẹt ở trạng thái trung gian về trạng thái đúng.
 */
describe('reconcileStuckVideos', () => {
  const NOW = Date.parse('2026-09-28T12:00:00Z');

  const draftsQuery = (drafts) => ({
    limit: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(drafts),
  });

  beforeEach(() => {
    process.env.S3_RAW_BUCKET_NAME = 'raw-bucket';
    Video.updateMany.mockResolvedValue({ modifiedCount: 0 });
    Video.find.mockReturnValue(draftsQuery([]));
    Video.updateOne.mockResolvedValue({ modifiedCount: 1 });
    Video.deleteOne.mockResolvedValue({ deletedCount: 1 });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('đánh ERROR cho video PROCESSING không có lần ghi nào trong 6 giờ', async () => {
    Video.updateMany.mockResolvedValue({ modifiedCount: 2 });

    const result = await reconcileStuckVideos(NOW);

    expect(Video.updateMany).toHaveBeenCalledWith(
      { status: 'PROCESSING', updatedAt: { $lt: new Date(NOW - STUCK_PROCESSING_MS) } },
      { $set: { status: 'ERROR' } }
    );
    expect(result.stuckProcessing).toBe(2);
  });

  it('chỉ xét bản nháp UPLOADING cũ hơn một ngày', async () => {
    await reconcileStuckVideos(NOW);

    expect(Video.find.mock.calls[0][0]).toEqual({
      status: 'UPLOADING',
      createdAt: { $lt: new Date(NOW - ABANDONED_UPLOAD_MS) },
    });
  });

  it('xoá bản nháp chưa từng có tệp nào lên S3, với điều kiện vẫn còn UPLOADING', async () => {
    Video.find.mockReturnValue(draftsQuery([{ _id: 'draft-1', rawS3Key: 'videos/u/draft-1/a.mp4' }]));
    s3Service.objectExists.mockResolvedValue(false);

    const result = await reconcileStuckVideos(NOW);

    expect(s3Service.objectExists).toHaveBeenCalledWith('raw-bucket', 'videos/u/draft-1/a.mp4');
    expect(Video.deleteOne).toHaveBeenCalledWith({ _id: 'draft-1', status: 'UPLOADING' });
    expect(result.deletedDrafts).toBe(1);
  });

  it('giữ lại tệp đã tải lên nhưng không job nào chạy, chỉ đánh ERROR', async () => {
    Video.find.mockReturnValue(draftsQuery([{ _id: 'lost-1', rawS3Key: 'videos/u/lost-1/a.mp4' }]));
    s3Service.objectExists.mockResolvedValue(true);

    const result = await reconcileStuckVideos(NOW);

    expect(Video.deleteOne).not.toHaveBeenCalled();
    expect(Video.updateOne).toHaveBeenCalledWith(
      { _id: 'lost-1', status: 'UPLOADING' },
      { $set: { status: 'ERROR' } }
    );
    expect(result.orphanedUploads).toBe(1);
  });

  it('không xoá gì khi không kiểm tra được S3', async () => {
    Video.find.mockReturnValue(draftsQuery([{ _id: 'draft-2', rawS3Key: 'videos/u/draft-2/a.mp4' }]));
    s3Service.objectExists.mockRejectedValue(new Error('AccessDenied'));
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await reconcileStuckVideos(NOW);

    expect(Video.deleteOne).not.toHaveBeenCalled();
    expect(Video.updateOne).not.toHaveBeenCalled();
    expect(result).toEqual({ stuckProcessing: 0, deletedDrafts: 0, orphanedUploads: 0 });
    console.warn.mockRestore();
  });
});
