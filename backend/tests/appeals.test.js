const mongoose = require('mongoose');
const appealService = require('../src/services/appealService');
const moderationService = require('../src/services/moderationService');
const Video = require('../src/models/Video');
const Appeal = require('../src/models/Appeal');

jest.mock('../src/models/Video');
jest.mock('../src/models/Appeal');
jest.mock('../src/models/User');
jest.mock('../src/services/moderationService');

/**
 * Khiếu nại của chủ video.
 *
 * Điều cần giữ: chỉ chủ video khiếu nại được và không dò được video của người khác; mỗi quyết định
 * một lần; kết quả đi qua `decide` để khôi phục theo khiếu nại được đếm là false positive như mọi
 * quyết định khác.
 */
describe('Khiếu nại', () => {
  const ownerId = new mongoose.Types.ObjectId();
  const otherId = new mongoose.Types.ObjectId();
  const videoId = new mongoose.Types.ObjectId().toString();
  const appealId = new mongoose.Types.ObjectId().toString();

  const owner = { _id: ownerId, role: 'user' };
  const operator = { _id: new mongoose.Types.ObjectId(), role: 'operator' };
  const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin' };

  const videoLookup = (video) => {
    Video.findById.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(video) }),
    });
  };
  const blockedByMachine = {
    user: ownerId,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    moderation: { status: 'blocked', source: 'auto', checkedAt: new Date('2026-10-01T01:00:00Z') },
  };

  afterEach(() => jest.clearAllMocks());

  describe('createAppeal', () => {
    it('chủ video khiếu nại video bị máy gỡ: ghi mốc quyết định và nguồn', async () => {
      videoLookup(blockedByMachine);
      Appeal.create.mockResolvedValue({ _id: appealId });

      await appealService.createAppeal(videoId, owner, { message: '  Đây là cảnh trong game  ' });

      expect(Appeal.create).toHaveBeenCalledWith({
        video: videoId,
        owner: ownerId,
        message: 'Đây là cảnh trong game',
        decisionAt: blockedByMachine.moderation.checkedAt,
        decisionSource: 'auto',
      });
    });

    it('lấy mốc quyết định của người khi video do người gỡ', async () => {
      const reviewedAt = new Date('2026-10-05T00:00:00Z');
      videoLookup({ ...blockedByMachine, moderation: { status: 'blocked', source: 'admin', reviewedAt, checkedAt: new Date('2026-10-01T01:00:00Z') } });
      Appeal.create.mockResolvedValue({});

      await appealService.createAppeal(videoId, owner, { message: 'xin xét lại' });

      expect(Appeal.create.mock.calls[0][0]).toMatchObject({ decisionAt: reviewedAt, decisionSource: 'admin' });
    });

    it('không phải chủ video: 404, không lộ video tồn tại', async () => {
      videoLookup(blockedByMachine);

      await expect(
        appealService.createAppeal(videoId, { _id: otherId, role: 'user' }, { message: 'x' })
      ).rejects.toMatchObject({ statusCode: 404 });
      expect(Appeal.create).not.toHaveBeenCalled();
    });

    it('video không tồn tại: 404', async () => {
      videoLookup(null);

      await expect(appealService.createAppeal(videoId, owner, { message: 'x' })).rejects.toMatchObject({ statusCode: 404 });
    });

    it.each(['approved', 'flagged', undefined])('video đang %s thì không có gì để khiếu nại', async (status) => {
      videoLookup({ ...blockedByMachine, moderation: status ? { status, source: 'auto' } : undefined });

      await expect(appealService.createAppeal(videoId, owner, { message: 'x' })).rejects.toMatchObject({ statusCode: 400 });
      expect(Appeal.create).not.toHaveBeenCalled();
    });

    it('bắt buộc có nội dung và giới hạn độ dài', async () => {
      videoLookup(blockedByMachine);

      await expect(appealService.createAppeal(videoId, owner, { message: '   ' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(appealService.createAppeal(videoId, owner, {})).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        appealService.createAppeal(videoId, owner, { message: 'a'.repeat(501) })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('một khiếu nại cho mỗi quyết định: gửi lại trả 409', async () => {
      videoLookup(blockedByMachine);
      Appeal.create.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));

      await expect(appealService.createAppeal(videoId, owner, { message: 'x' })).rejects.toMatchObject({
        statusCode: 409,
        errorCode: 'APPEAL_ALREADY_FILED',
      });
    });

    it('từ chối ID không hợp lệ trước khi chạm DB', async () => {
      await expect(appealService.createAppeal('abc', owner, { message: 'x' })).rejects.toMatchObject({ statusCode: 400 });
      expect(Video.findById).not.toHaveBeenCalled();
    });
  });

  describe('listAppeals', () => {
    const chain = (rows) => {
      const c = {
        select: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(rows),
      };
      return c;
    };

    it('từ chối trạng thái lạ thay vì đưa vào truy vấn', async () => {
      await expect(appealService.listAppeals(operator, { status: { $ne: 'x' } })).rejects.toMatchObject({ statusCode: 400 });
      expect(Appeal.find).not.toHaveBeenCalled();
    });

    it('khiếu nại chờ xếp cũ nhất trước; operator không nhận email chủ video', async () => {
      const c = chain([]);
      Appeal.find.mockReturnValue(c);
      Appeal.countDocuments.mockResolvedValue(0);

      await appealService.listAppeals(operator, { status: 'open' });

      expect(c.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
      expect(c.populate).toHaveBeenCalledWith('owner', 'username displayName avatar');
    });

    it('admin nhận email chủ video', async () => {
      const c = chain([]);
      Appeal.find.mockReturnValue(c);
      Appeal.countDocuments.mockResolvedValue(0);

      await appealService.listAppeals(admin, { status: 'open' });

      expect(c.populate).toHaveBeenCalledWith('owner', 'username displayName avatar email');
    });
  });

  describe('resolveAppeal', () => {
    const claimed = (overrides = {}) => ({ _id: appealId, video: videoId, owner: ownerId, status: 'upheld', decisionSource: 'auto', ...overrides });
    const claim = (doc) => Appeal.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) });

    beforeEach(() => {
      moderationService.decide.mockResolvedValue({});
      Appeal.updateOne.mockResolvedValue({});
    });

    it('chấp nhận: khôi phục video qua decide với lý do appeal_upheld', async () => {
      claim(claimed());

      await appealService.resolveAppeal(appealId, operator, { decision: 'uphold', note: 'đúng là cảnh trong game' });

      expect(moderationService.decide).toHaveBeenCalledWith(videoId, operator, {
        decision: 'approve',
        reasonCode: 'appeal_upheld',
        note: 'đúng là cảnh trong game',
      });
    });

    it('nhận khiếu nại bằng cập nhật có điều kiện status open để hai người không xử lý hai lần', async () => {
      claim(claimed());

      await appealService.resolveAppeal(appealId, operator, { decision: 'uphold' });

      expect(Appeal.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: appealId, status: 'open' },
        { $set: expect.objectContaining({ status: 'upheld', resolvedBy: operator._id }) },
        expect.anything()
      );
    });

    it('bác khiếu nại với video do máy gỡ: ghi một quyết định gỡ của người (xác nhận kết luận của máy)', async () => {
      claim(claimed({ status: 'rejected', decisionSource: 'auto' }));

      await appealService.resolveAppeal(appealId, operator, { decision: 'reject', note: 'đúng là bạo lực thật' });

      expect(moderationService.decide).toHaveBeenCalledWith(videoId, operator, {
        decision: 'block',
        reasonCode: 'policy_violation',
        note: 'đúng là bạo lực thật',
      });
    });

    it('bác khiếu nại với video do người gỡ: không ghi quyết định mới vì không có gì đổi', async () => {
      claim(claimed({ status: 'rejected', decisionSource: 'admin' }));

      await appealService.resolveAppeal(appealId, operator, { decision: 'reject' });

      expect(moderationService.decide).not.toHaveBeenCalled();
    });

    it('khiếu nại đã được xử lý hoặc không có: 404 và không đụng tới video', async () => {
      claim(null);

      await expect(appealService.resolveAppeal(appealId, operator, { decision: 'uphold' })).rejects.toMatchObject({ statusCode: 404 });
      expect(moderationService.decide).not.toHaveBeenCalled();
    });

    it('decide lỗi (ví dụ operator lật quyết định của admin): khiếu nại trở về open', async () => {
      claim(claimed());
      moderationService.decide.mockRejectedValue(Object.assign(new Error('Only an admin can change'), { statusCode: 403 }));

      await expect(appealService.resolveAppeal(appealId, operator, { decision: 'uphold' })).rejects.toMatchObject({ statusCode: 403 });

      expect(Appeal.updateOne).toHaveBeenCalledWith(
        { _id: appealId },
        { $set: { status: 'open' }, $unset: { resolvedBy: '', resolvedAt: '' } }
      );
    });

    it('từ chối quyết định lạ trước khi chạm DB', async () => {
      await expect(appealService.resolveAppeal(appealId, operator, { decision: 'delete' })).rejects.toMatchObject({ statusCode: 400 });
      expect(Appeal.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
