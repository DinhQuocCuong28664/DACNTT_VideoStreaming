const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/services/s3Service');

/**
 * Kiểm thử endpoint gợi ý video liên quan.
 *
 * Bộ test này nối tiếp `visibility.test.js`: mỗi khi hệ thống mở thêm một
 * đường dẫn truy vấn video mới thì đường dẫn đó cũng phải chịu đúng những
 * ràng buộc riêng tư như các đường dẫn cũ.
 */
describe('getRelatedVideos — gợi ý video liên quan', () => {
  const ownerId = new mongoose.Types.ObjectId();
  const strangerId = new mongoose.Types.ObjectId();
  const currentId = new mongoose.Types.ObjectId();

  const buildCurrentVideo = (overrides = {}) => ({
    _id: currentId,
    user: { _id: ownerId },
    category: 'Công nghệ',
    tags: ['aws'],
    visibility: 'public',
    status: 'READY',
    ...overrides,
  });

  // getVideoById dùng chuỗi Video.findById().populate()
  const mockCurrentVideo = (video) => {
    Video.findById.mockReturnValue({
      populate: jest.fn().mockResolvedValue(video),
    });
  };

  // Danh sách gợi ý dùng chuỗi Video.find().populate().sort().limit()
  const mockFindChain = (result) => ({
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(result),
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Bộ lọc gửi xuống MongoDB', () => {
    beforeEach(() => {
      mockCurrentVideo(buildCurrentVideo());
      Video.find.mockReturnValue(mockFindChain([]));
    });

    it('chỉ lấy video công khai và đã sẵn sàng', async () => {
      await videoService.getRelatedVideos(currentId.toString(), 8);

      const filter = Video.find.mock.calls[0][0];
      expect(filter.visibility).toBe('public');
      expect(filter.status).toBe('READY');
    });

    it('không bao giờ trả về chính video đang xem', async () => {
      await videoService.getRelatedVideos(currentId.toString(), 8);

      const filter = Video.find.mock.calls[0][0];
      expect(filter._id).toEqual({ $ne: currentId });
    });

    it('không để lọt video ở chế độ riêng tư hay chỉ có liên kết', async () => {
      await videoService.getRelatedVideos(currentId.toString(), 8);

      // Mọi truy vấn phát sinh (kể cả truy vấn bù cho đủ số lượng)
      // đều phải khoá cứng visibility = public.
      for (const call of Video.find.mock.calls) {
        expect(call[0].visibility).toBe('public');
        expect(call[0].status).toBe('READY');
      }
    });
  });

  describe('Truy vấn bù khi chưa đủ số lượng', () => {
    it('loại trừ những video đã có trong danh sách trước đó', async () => {
      const already = new mongoose.Types.ObjectId();

      mockCurrentVideo(buildCurrentVideo({ tags: [] }));
      Video.find
        .mockReturnValueOnce(mockFindChain([{ _id: already }]))
        .mockReturnValueOnce(mockFindChain([]));

      await videoService.getRelatedVideos(currentId.toString(), 8);

      expect(Video.find).toHaveBeenCalledTimes(2);
      const backfillFilter = Video.find.mock.calls[1][0];
      expect(backfillFilter._id.$nin.map(String)).toEqual(
        expect.arrayContaining([currentId.toString(), already.toString()])
      );
    });
  });

  describe('Quyền truy cập vào chính video gốc', () => {
    beforeEach(() => {
      Video.find.mockReturnValue(mockFindChain([]));
    });

    it('báo 404 khi video không tồn tại', async () => {
      mockCurrentVideo(null);

      await expect(
        videoService.getRelatedVideos(currentId.toString(), 8)
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('báo 400 khi ID không đúng định dạng ObjectId', async () => {
      await expect(
        videoService.getRelatedVideos('khong-phai-objectid', 8)
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('không tiết lộ sự tồn tại của video riêng tư với khách vãng lai', async () => {
      // `getVideoById` trả 404 cho người không phải chủ sở hữu khi video
      // ở chế độ riêng tư. Đường dẫn gợi ý phải hành xử giống hệt, nếu không
      // kẻ tấn công có thể dò ID nào có thật chỉ bằng cách so sánh 404 với 200,
      // dù nội dung trả về vẫn chỉ toàn video công khai.
      mockCurrentVideo(buildCurrentVideo({ visibility: 'private' }));

      await expect(
        videoService.getRelatedVideos(currentId.toString(), 8, null)
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('không tiết lộ sự tồn tại của video riêng tư với người dùng khác', async () => {
      mockCurrentVideo(buildCurrentVideo({ visibility: 'private' }));

      await expect(
        videoService.getRelatedVideos(currentId.toString(), 8, { _id: strangerId })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('chủ sở hữu vẫn xem được gợi ý cho video riêng tư của chính mình', async () => {
      mockCurrentVideo(buildCurrentVideo({ visibility: 'private' }));

      await expect(
        videoService.getRelatedVideos(currentId.toString(), 8, { _id: ownerId })
      ).resolves.toEqual([]);
    });

    it('video chỉ có liên kết vẫn gợi ý được cho người có đường dẫn', async () => {
      mockCurrentVideo(buildCurrentVideo({ visibility: 'unlisted' }));

      await expect(
        videoService.getRelatedVideos(currentId.toString(), 8, null)
      ).resolves.toEqual([]);
    });
  });
});
