const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const Video = require('../src/models/Video');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/services/s3Service');

/**
 * Sắp xếp danh sách video trên trang kênh: Mới nhất / Phổ biến / Cũ nhất.
 *
 * Hai điều cần giữ: mỗi kiểu sắp xếp phải kết thúc bằng `_id` để thứ tự xác
 * định khi phân trang bằng skip(), và giá trị lạ từ query string không được
 * lọt thẳng vào truy vấn.
 */
describe('getVideosByUser — sắp xếp trang kênh', () => {
  const ownerId = new mongoose.Types.ObjectId();
  let sortMock;

  beforeEach(() => {
    sortMock = jest.fn().mockReturnThis();
    Video.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: sortMock,
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    });
    Video.countDocuments.mockResolvedValue(0);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('mặc định sắp mới nhất trước', async () => {
    await videoService.getVideosByUser(ownerId, 1, 12, null);
    expect(sortMock).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
  });

  it('"popular" sắp theo lượt xem giảm dần, hoà thì video mới hơn đứng trước', async () => {
    await videoService.getVideosByUser(ownerId, 1, 12, null, 'popular');
    expect(sortMock).toHaveBeenCalledWith({ views: -1, createdAt: -1, _id: -1 });
  });

  it('"oldest" sắp cũ nhất trước', async () => {
    await videoService.getVideosByUser(ownerId, 1, 12, null, 'oldest');
    expect(sortMock).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
  });

  it('mọi kiểu sắp xếp đều có _id làm tiêu chí cuối để phân trang không trùng hay sót', () => {
    for (const spec of Object.values(videoService.USER_VIDEO_SORTS)) {
      const keys = Object.keys(spec);
      expect(keys[keys.length - 1]).toBe('_id');
    }
  });

  it.each(['views', '__proto__', 'constructor', '', 'LATEST'])(
    'giá trị lạ "%s" quay về mặc định thay vì đi thẳng vào truy vấn',
    async (value) => {
      await videoService.getVideosByUser(ownerId, 1, 12, null, value);
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
    }
  );

  it('sắp xếp không làm mất bộ lọc quyền riêng tư với khách', async () => {
    await videoService.getVideosByUser(ownerId, 1, 12, null, 'popular');
    const filter = Video.find.mock.calls[0][0];
    expect(filter.visibility).toBe('public');
    expect(filter.status).toBe('READY');
  });
});
