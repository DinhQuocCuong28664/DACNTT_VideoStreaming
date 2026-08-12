const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/services/s3Service');

/**
 * Bộ kiểm thử kiểm soát quyền riêng tư của video.
 *
 * Đây là nhóm test quan trọng nhất về mặt bảo mật của đề tài: nó bảo đảm rằng
 * video ở chế độ riêng tư không bị lộ ra ngoài qua bất kỳ đường dẫn truy vấn nào
 * (danh sách trang chủ, trang kênh cá nhân, hay truy vấn trực tiếp theo ID).
 */
describe('Kiểm soát quyền riêng tư của video', () => {
  const ownerId = new mongoose.Types.ObjectId();
  const otherUserId = new mongoose.Types.ObjectId();
  const videoId = new mongoose.Types.ObjectId().toString();

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getAllVideos — danh sách công khai', () => {
    beforeEach(() => {
      Video.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      });
      Video.countDocuments.mockResolvedValue(0);
    });

    it('nên luôn lọc chỉ lấy video công khai và đã sẵn sàng', async () => {
      await videoService.getAllVideos();

      const filter = Video.find.mock.calls[0][0];
      expect(filter.visibility).toBe('public');
      expect(filter.status).toBe('READY');
    });

    it('nên giữ nguyên điều kiện lọc quyền riêng tư ngay cả khi có tìm kiếm', async () => {
      await videoService.getAllVideos(1, 12, null, 'từ khóa');

      const filter = Video.find.mock.calls[0][0];
      expect(filter.visibility).toBe('public');
      expect(filter.status).toBe('READY');
    });

    it('nên giữ nguyên điều kiện lọc quyền riêng tư khi lọc theo danh mục', async () => {
      await videoService.getAllVideos(1, 12, 'Âm nhạc', null);

      const filter = Video.find.mock.calls[0][0];
      expect(filter.visibility).toBe('public');
      expect(filter.category).toBe('Âm nhạc');
    });

    it('nên thoát ký tự đặc biệt trong từ khóa để tránh lỗi biểu thức chính quy', async () => {
      await videoService.getAllVideos(1, 12, null, 'a+b(c)[d]');

      const filter = Video.find.mock.calls[0][0];
      // Nếu không thoát ký tự, RegExp sẽ hiểu sai hoặc ném lỗi cú pháp
      expect(filter.$or[0].title.source).toContain('\\+');
      expect(filter.$or[0].title.source).toContain('\\(');
    });
  });

  describe('getVideosByUser — trang kênh cá nhân', () => {
    beforeEach(() => {
      Video.find.mockReturnValue({
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([]),
      });
      Video.countDocuments.mockResolvedValue(0);
    });

    it('nên cho chủ kênh xem toàn bộ video của mình, kể cả video riêng tư', async () => {
      await videoService.getVideosByUser(ownerId, 1, 12, ownerId);

      const filter = Video.find.mock.calls[0][0];
      expect(filter.user).toBe(ownerId);
      expect(filter.visibility).toBeUndefined();
      expect(filter.status).toBeUndefined();
    });

    it('nên chỉ cho người khác xem video công khai và đã sẵn sàng', async () => {
      await videoService.getVideosByUser(ownerId, 1, 12, otherUserId);

      const filter = Video.find.mock.calls[0][0];
      expect(filter.visibility).toBe('public');
      expect(filter.status).toBe('READY');
    });

    it('nên chỉ cho khách vãng lai xem video công khai', async () => {
      await videoService.getVideosByUser(ownerId, 1, 12, null);

      const filter = Video.find.mock.calls[0][0];
      expect(filter.visibility).toBe('public');
      expect(filter.status).toBe('READY');
    });
  });

  describe('getVideoById — truy vấn trực tiếp theo ID', () => {
    const buildMockVideo = (overrides = {}) => ({
      _id: videoId,
      user: { _id: ownerId },
      visibility: 'public',
      status: 'READY',
      ...overrides,
    });

    const mockFindByIdReturning = (video) => {
      Video.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue(video),
      });
    };

    it('nên trả về 404 cho video riêng tư khi người truy cập là khách vãng lai', async () => {
      mockFindByIdReturning(buildMockVideo({ visibility: 'private' }));

      await expect(videoService.getVideoById(videoId, null)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it('nên trả về 404 cho video riêng tư khi người truy cập không phải chủ sở hữu', async () => {
      mockFindByIdReturning(buildMockVideo({ visibility: 'private' }));

      await expect(
        videoService.getVideoById(videoId, { _id: otherUserId })
      ).rejects.toMatchObject({ statusCode: 404 });
    });

    it('nên dùng thông báo lỗi "not found" thay vì "forbidden" để không tiết lộ sự tồn tại của video', async () => {
      mockFindByIdReturning(buildMockVideo({ visibility: 'private' }));

      const error = await videoService
        .getVideoById(videoId, { _id: otherUserId })
        .catch((e) => e);

      expect(error.message).toBe('Video not found');
      expect(error.statusCode).toBe(404);
    });

    it('nên cho phép chủ sở hữu xem video riêng tư của chính mình', async () => {
      const video = buildMockVideo({ visibility: 'private' });
      mockFindByIdReturning(video);

      const result = await videoService.getVideoById(videoId, { _id: ownerId });

      expect(result).toBe(video);
    });

    it('nên cho phép chủ sở hữu xem video của mình khi đang xử lý', async () => {
      const video = buildMockVideo({ status: 'PROCESSING' });
      mockFindByIdReturning(video);

      const result = await videoService.getVideoById(videoId, { _id: ownerId });

      expect(result).toBe(video);
    });

    it('nên báo lỗi 400 khi người khác truy cập video chưa chuyển mã xong', async () => {
      mockFindByIdReturning(buildMockVideo({ status: 'PROCESSING' }));

      await expect(
        videoService.getVideoById(videoId, { _id: otherUserId })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('nên cho phép khách vãng lai xem video công khai đã sẵn sàng', async () => {
      const video = buildMockVideo();
      mockFindByIdReturning(video);

      const result = await videoService.getVideoById(videoId, null);

      expect(result).toBe(video);
    });

    it('nên trả về 404 khi video không tồn tại', async () => {
      mockFindByIdReturning(null);

      await expect(videoService.getVideoById(videoId, null)).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('registerView — chống đếm trùng lượt xem', () => {
    const mockVideoDoc = (overrides = {}) => ({
      _id: videoId,
      user: ownerId,
      status: 'READY',
      views: 10,
      ...overrides,
    });

    beforeEach(() => {
      Video.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockVideoDoc()),
      });
      Video.findByIdAndUpdate.mockResolvedValue({ views: 11 });
    });

    it('không nên tính lượt xem của chính chủ video', async () => {
      const result = await videoService.registerView(videoId, { _id: ownerId }, '1.2.3.4');

      expect(result.counted).toBe(false);
      expect(Video.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('không nên tính lượt xem cho video chưa chuyển mã xong', async () => {
      Video.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockVideoDoc({ status: 'PROCESSING' })),
      });

      const result = await videoService.registerView(videoId, null, '1.2.3.4');

      expect(result.counted).toBe(false);
      expect(Video.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('nên tính lượt xem đầu tiên của một người dùng khác', async () => {
      const result = await videoService.registerView(videoId, { _id: otherUserId }, '1.2.3.4');

      expect(result.counted).toBe(true);
      expect(result.views).toBe(11);
      expect(Video.findByIdAndUpdate).toHaveBeenCalledWith(
        videoId,
        { $inc: { views: 1 } },
        expect.any(Object)
      );
    });

    it('không nên tính lượt xem lặp lại của cùng một người trong cửa sổ thời gian', async () => {
      const nguoiXem = { _id: new mongoose.Types.ObjectId() };

      const lanDau = await videoService.registerView(videoId, nguoiXem, '1.2.3.4');
      const lanHai = await videoService.registerView(videoId, nguoiXem, '1.2.3.4');

      expect(lanDau.counted).toBe(true);
      expect(lanHai.counted).toBe(false);
      expect(Video.findByIdAndUpdate).toHaveBeenCalledTimes(1);
    });

    it('nên phân biệt khách vãng lai theo địa chỉ IP', async () => {
      const khachA = await videoService.registerView(videoId, null, '10.0.0.1');
      const khachB = await videoService.registerView(videoId, null, '10.0.0.2');

      expect(khachA.counted).toBe(true);
      expect(khachB.counted).toBe(true);
      expect(Video.findByIdAndUpdate).toHaveBeenCalledTimes(2);
    });

    it('nên báo lỗi 404 khi video không tồn tại', async () => {
      Video.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null),
      });

      await expect(videoService.registerView(videoId, null, '1.2.3.4')).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });
});
