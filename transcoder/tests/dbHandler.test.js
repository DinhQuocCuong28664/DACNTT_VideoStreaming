/**
 * Kiểm thử cơ chế ghi có điều kiện (idempotent write) chống xử lý trùng.
 *
 * Bối cảnh: nếu container FFmpeg bị treo tạm (không crash hẳn) khiến heartbeat
 * trễ quá visibility timeout của SQS, message có thể được redeliver và một job
 * Batch thứ hai xử lý lại cùng videoId trong khi job đầu tiên vẫn đang chạy
 * hoặc vừa hoàn tất. Bộ test này chứng minh: dù xảy ra tình huống đó, trạng
 * thái cuối cùng của video trong MongoDB vẫn nhất quán — không bị ghi đè bởi
 * job đến sau. Cờ `updated` trả về còn được dùng ở index.js để quyết định có
 * gửi email thông báo hay không — chỉ job thắng cuộc ghi (updated=true) mới
 * được gửi, tránh người dùng nhận email trùng.
 */

const mockVideoModel = {
  findOneAndUpdate: jest.fn(),
  findById: jest.fn(),
};

jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    Schema: actualMongoose.Schema,
    model: jest.fn(() => mockVideoModel),
    connect: jest.fn(),
    disconnect: jest.fn(),
    connection: { readyState: 0 },
  };
});

const { updateVideoReady, updateVideoError } = require('../src/dbHandler');

describe('dbHandler — ghi có điều kiện chống xử lý trùng', () => {
  const videoId = '6a78c10f1c4541ef615cf01d';

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('updateVideoReady', () => {
    it('nên ghi thành công và báo updated=true khi video chưa READY', async () => {
      mockVideoModel.findOneAndUpdate.mockResolvedValue({
        _id: videoId,
        status: 'READY',
        hlsUrl: 'https://cdn/master.m3u8',
      });

      const result = await updateVideoReady(videoId, {
        hlsUrl: 'https://cdn/master.m3u8',
        thumbnailUrl: 'https://cdn/thumb.jpg',
        duration: 120,
      });

      expect(mockVideoModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: videoId, status: { $ne: 'READY' } },
        { $set: { status: 'READY', hlsUrl: 'https://cdn/master.m3u8', thumbnailUrl: 'https://cdn/thumb.jpg', duration: 120 } },
        { new: true }
      );
      expect(result.updated).toBe(true);
      expect(result.video.status).toBe('READY');
    });

    it('nên KHÔNG ghi đè và báo updated=false khi video đã READY từ trước (job trùng lặp)', async () => {
      // findOneAndUpdate không khớp điều kiện status != READY → trả về null
      mockVideoModel.findOneAndUpdate.mockResolvedValue(null);
      mockVideoModel.findById.mockResolvedValue({
        _id: videoId,
        status: 'READY',
        hlsUrl: 'https://cdn/master-that-was-here-first.m3u8',
      });

      const result = await updateVideoReady(videoId, {
        hlsUrl: 'https://cdn/master-from-duplicate-job.m3u8',
      });

      expect(result.updated).toBe(false);
      // Trả về bản ghi hiện có (của job đầu tiên), không phải dữ liệu job trùng vừa gửi
      expect(result.video.hlsUrl).toBe('https://cdn/master-that-was-here-first.m3u8');
    });

    it('nên báo lỗi "Video not found" khi video không tồn tại trong DB', async () => {
      mockVideoModel.findOneAndUpdate.mockResolvedValue(null);
      mockVideoModel.findById.mockResolvedValue(null);

      await expect(
        updateVideoReady(videoId, { hlsUrl: 'https://cdn/master.m3u8' })
      ).rejects.toThrow(`Video not found: ${videoId}`);
    });
  });

  describe('updateVideoError', () => {
    it('nên đánh dấu ERROR và báo updated=true khi video chưa READY', async () => {
      mockVideoModel.findOneAndUpdate.mockResolvedValue({
        _id: videoId,
        status: 'ERROR',
      });

      const result = await updateVideoError(videoId, 'FFmpeg exited with code 1');

      expect(mockVideoModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: videoId, status: { $ne: 'READY' } },
        { $set: { status: 'ERROR' } },
        { new: true }
      );
      expect(result.updated).toBe(true);
      expect(result.video.status).toBe('ERROR');
    });

    it('KHÔNG được hạ video đã READY xuống ERROR khi job trùng lặp thất bại sau, báo updated=false', async () => {
      // Job A đã ghi READY thành công. Job B (bản trùng, chạy chậm hơn) giờ mới
      // thất bại và cố gắng đánh dấu ERROR — phải bị chặn.
      mockVideoModel.findOneAndUpdate.mockResolvedValue(null);
      mockVideoModel.findById.mockResolvedValue({
        _id: videoId,
        status: 'READY',
        hlsUrl: 'https://cdn/master.m3u8',
      });

      const result = await updateVideoError(videoId, 'Lỗi từ job trùng lặp chạy chậm hơn');

      expect(result.updated).toBe(false);
      expect(result.video.status).toBe('READY');
      expect(result.video.hlsUrl).toBe('https://cdn/master.m3u8');
    });

    it('nên báo updated=false, video=null và không ném lỗi khi video không tồn tại', async () => {
      mockVideoModel.findOneAndUpdate.mockResolvedValue(null);
      mockVideoModel.findById.mockResolvedValue(null);

      const result = await updateVideoError(videoId, 'some error');

      expect(result.updated).toBe(false);
      expect(result.video).toBeNull();
    });
  });
});
