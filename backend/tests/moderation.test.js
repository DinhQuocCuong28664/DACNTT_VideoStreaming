const mongoose = require('mongoose');
const videoService = require('../src/services/videoService');
const moderationService = require('../src/services/moderationService');
const { requireAdmin } = require('../src/middleware/auth');
const Video = require('../src/models/Video');
const Report = require('../src/models/Report');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/models/Report');
jest.mock('../src/models/User');
jest.mock('../src/services/s3Service');

/**
 * Kiểm duyệt nội dung phía backend.
 *
 * Nhóm test quan trọng nhất ở đây là "video bị gỡ không lọt ra ngoài qua bất
 * kỳ đường nào" — cùng tinh thần với visibility.test.js cho video riêng tư:
 * danh sách trang chủ, trang kênh, video liên quan, xem trực tiếp theo ID và
 * cấp quyền phát đều phải chặn.
 */
describe('Kiểm duyệt nội dung', () => {
  const ownerId = new mongoose.Types.ObjectId();
  const viewerId = new mongoose.Types.ObjectId();
  const adminId = new mongoose.Types.ObjectId();
  const videoId = new mongoose.Types.ObjectId().toString();

  const owner = { _id: ownerId, role: 'user' };
  const viewer = { _id: viewerId, role: 'user' };
  const admin = { _id: adminId, role: 'admin' };

  const buildVideo = (overrides = {}) => ({
    _id: videoId,
    user: { _id: ownerId },
    visibility: 'public',
    status: 'READY',
    ...overrides,
  });

  const mockFindByIdReturning = (video) => {
    Video.findById.mockReturnValue({ populate: jest.fn().mockResolvedValue(video) });
  };

  const mockFindChain = () => {
    Video.find.mockReturnValue({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockResolvedValue([]),
    });
    Video.countDocuments.mockResolvedValue(0);
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Danh sách công khai loại video bị gỡ hoặc chờ rà soát', () => {
    beforeEach(mockFindChain);

    it('trang chủ lọc bỏ flagged và blocked', async () => {
      await videoService.getAllVideos(1, 12, null, 'tìm');

      const filter = Video.find.mock.calls[0][0];
      expect(filter['moderation.status']).toEqual({ $nin: ['flagged', 'blocked'] });
      expect(filter.visibility).toBe('public');
      expect(filter.status).toBe('READY');
    });

    it('trang kênh của người khác cũng lọc bỏ', async () => {
      await videoService.getVideosByUser(ownerId, 1, 12, viewerId);

      const filter = Video.find.mock.calls[0][0];
      expect(filter['moderation.status']).toEqual({ $nin: ['flagged', 'blocked'] });
      expect(filter.user).toBe(ownerId);
    });

    it('chủ kênh vẫn thấy video của mình bị gỡ — đó là nơi duy nhất họ biết điều này', async () => {
      await videoService.getVideosByUser(ownerId, 1, 12, ownerId);

      const filter = Video.find.mock.calls[0][0];
      expect(filter).toEqual({ user: ownerId });
    });

    it('video liên quan lọc bỏ ở cả truy vấn chính lẫn truy vấn bù', async () => {
      mockFindByIdReturning(buildVideo({ category: 'Game', tags: [] }));

      await videoService.getRelatedVideos(videoId, 8, viewer);

      expect(Video.find).toHaveBeenCalledTimes(2);
      for (const [filter] of Video.find.mock.calls) {
        expect(filter['moderation.status']).toEqual({ $nin: ['flagged', 'blocked'] });
      }
    });
  });

  describe('getVideoById — xem trực tiếp theo ID', () => {
    it('trả 403 VIDEO_REMOVED cho người xem khi video đã bị gỡ', async () => {
      mockFindByIdReturning(buildVideo({ moderation: { status: 'blocked' } }));

      await expect(videoService.getVideoById(videoId, viewer)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'VIDEO_REMOVED',
      });
    });

    it('trả 403 VIDEO_UNDER_REVIEW khi video đang chờ rà soát', async () => {
      mockFindByIdReturning(buildVideo({ moderation: { status: 'flagged' } }));

      await expect(videoService.getVideoById(videoId, null)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'VIDEO_UNDER_REVIEW',
      });
    });

    it('video riêng tư bị gỡ vẫn trả 404, không để lộ sự tồn tại qua mã kiểm duyệt', async () => {
      mockFindByIdReturning(buildVideo({ visibility: 'private', moderation: { status: 'blocked' } }));

      await expect(videoService.getVideoById(videoId, viewer)).rejects.toMatchObject({ statusCode: 404 });
    });

    it('video tải lên trước khi có kiểm duyệt (không có trường moderation) vẫn xem được', async () => {
      mockFindByIdReturning(buildVideo());

      await expect(videoService.getVideoById(videoId, viewer)).resolves.toBeDefined();
    });

    it('chủ video vẫn mở được trang video của mình khi bị gỡ', async () => {
      mockFindByIdReturning(buildVideo({ moderation: { status: 'blocked' } }));

      await expect(videoService.getVideoById(videoId, owner)).resolves.toBeDefined();
    });

    it('quản trị viên xem được cả video bị gỡ lẫn video riêng tư để rà soát', async () => {
      mockFindByIdReturning(buildVideo({ visibility: 'private', moderation: { status: 'blocked' } }));

      await expect(videoService.getVideoById(videoId, admin)).resolves.toBeDefined();
    });
  });

  describe('getPlayableVideo — cấp quyền phát (Signed Cookie)', () => {
    it('chủ video KHÔNG phát được video đã bị gỡ', async () => {
      mockFindByIdReturning(buildVideo({ moderation: { status: 'blocked' } }));

      await expect(videoService.getPlayableVideo(videoId, owner)).rejects.toMatchObject({
        statusCode: 403,
        errorCode: 'VIDEO_REMOVED',
      });
    });

    it('chủ video vẫn phát được video đang chờ rà soát', async () => {
      mockFindByIdReturning(buildVideo({ moderation: { status: 'flagged' } }));

      await expect(videoService.getPlayableVideo(videoId, owner)).resolves.toBeDefined();
    });

    it('quản trị viên phát được video bị gỡ để xem xét khiếu nại', async () => {
      mockFindByIdReturning(buildVideo({ moderation: { status: 'blocked' } }));

      await expect(videoService.getPlayableVideo(videoId, admin)).resolves.toBeDefined();
    });
  });

  describe('registerView', () => {
    it('không cộng lượt xem cho video bị gỡ (quản trị viên phát để rà soát)', async () => {
      Video.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({ user: ownerId, status: 'READY', views: 3, moderation: { status: 'blocked' } }),
      });

      const result = await videoService.registerView(videoId, admin, '1.1.1.1');

      expect(result).toEqual({ counted: false, views: 3 });
      expect(Video.findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('createReport — người xem báo cáo', () => {
    beforeEach(() => {
      mockFindByIdReturning(buildVideo());
    });

    it('từ chối lý do không nằm trong danh sách', async () => {
      await expect(
        moderationService.createReport(videoId, viewer, { reason: 'boring' })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(Report.create).not.toHaveBeenCalled();
    });

    it('từ chối mô tả quá 500 ký tự', async () => {
      await expect(
        moderationService.createReport(videoId, viewer, { reason: 'other', details: 'x'.repeat(501) })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('không cho báo cáo video của chính mình', async () => {
      await expect(
        moderationService.createReport(videoId, owner, { reason: 'violent' })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('không báo cáo được video mình không xem được (không dò được video riêng tư)', async () => {
      mockFindByIdReturning(buildVideo({ visibility: 'private' }));

      await expect(
        moderationService.createReport(videoId, viewer, { reason: 'violent' })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(Report.create).not.toHaveBeenCalled();
    });

    it('báo cáo hợp lệ được lưu và cộng bộ đếm báo cáo mở', async () => {
      Report.create.mockResolvedValue({});

      const result = await moderationService.createReport(videoId, viewer, {
        reason: 'violent',
        details: '  cảnh đánh nhau ở phút 2  ',
      });

      expect(result).toEqual({ alreadyReported: false });
      expect(Report.create).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'violent', details: 'cảnh đánh nhau ở phút 2', reporter: viewerId })
      );
      expect(Video.updateOne).toHaveBeenCalledWith(
        { _id: videoId },
        { $inc: { 'moderation.openReports': 1 } }
      );
    });

    it('báo cáo lặp lại của cùng người không cộng thêm vào bộ đếm', async () => {
      Report.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

      const result = await moderationService.createReport(videoId, viewer, { reason: 'violent' });

      expect(result).toEqual({ alreadyReported: true });
      expect(Video.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('decide — quyết định của quản trị viên', () => {
    const mockUpdateChain = (result) => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(result),
      };
      Video.findByIdAndUpdate.mockReturnValue(chain);
    };

    beforeEach(() => {
      Video.exists.mockResolvedValue({ _id: videoId });
      Report.updateMany.mockResolvedValue({});
      Report.countDocuments.mockResolvedValue(0);
      mockUpdateChain({ _id: videoId });
    });

    it('từ chối quyết định không hợp lệ', async () => {
      await expect(
        moderationService.decide(videoId, admin, { decision: 'delete' })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(Video.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('gỡ video: báo cáo mở chuyển sang actioned, ghi lại ai quyết định', async () => {
      await moderationService.decide(videoId, admin, { decision: 'block', note: 'Bạo lực thật' });

      expect(Report.updateMany).toHaveBeenCalledWith(
        { video: videoId, status: 'open' },
        { $set: expect.objectContaining({ status: 'actioned', resolvedBy: adminId }) }
      );
      const [, update] = Video.findByIdAndUpdate.mock.calls[0];
      expect(update.$set).toMatchObject({
        'moderation.status': 'blocked',
        'moderation.source': 'admin',
        'moderation.reviewedBy': adminId,
        'moderation.note': 'Bạo lực thật',
        'moderation.openReports': 0,
      });
    });

    it('giữ lại video: báo cáo mở chuyển sang dismissed', async () => {
      await moderationService.decide(videoId, admin, { decision: 'approve' });

      expect(Report.updateMany).toHaveBeenCalledWith(
        { video: videoId, status: 'open' },
        { $set: expect.objectContaining({ status: 'dismissed' }) }
      );
      expect(Video.findByIdAndUpdate.mock.calls[0][1].$set['moderation.status']).toBe('approved');
    });

    it('đếm lại báo cáo mở thay vì gán cứng 0', async () => {
      // Một báo cáo đến giữa hai lệnh ghi vẫn phải giữ video trong hàng rà soát.
      Report.countDocuments.mockResolvedValue(1);

      await moderationService.decide(videoId, admin, { decision: 'approve' });

      expect(Video.findByIdAndUpdate.mock.calls[0][1].$set['moderation.openReports']).toBe(1);
    });

    it('trả 404 khi video không tồn tại', async () => {
      Video.exists.mockResolvedValue(null);

      await expect(
        moderationService.decide(videoId, admin, { decision: 'block' })
      ).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('requireAdmin', () => {
    const createRes = () => {
      const res = {};
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);
      return res;
    };

    it('chặn người dùng thường với 403', () => {
      const res = createRes();
      const next = jest.fn();

      requireAdmin({ user: viewer, headers: {} }, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    });

    it('cho quản trị viên đi qua', () => {
      const next = jest.fn();

      requireAdmin({ user: admin, headers: {} }, createRes(), next);

      expect(next).toHaveBeenCalled();
    });
  });
});
