const mongoose = require('mongoose');
const auditService = require('../src/services/auditService');
const moderationService = require('../src/services/moderationService');
const Video = require('../src/models/Video');
const AuditSample = require('../src/models/AuditSample');

jest.mock('../src/models/Video');
jest.mock('../src/models/AuditSample');
jest.mock('../src/models/User');
jest.mock('../src/services/moderationService');

/**
 * Kiểm tra mẫu ngẫu nhiên: nguồn duy nhất của tỉ lệ false negative ước lượng.
 *
 * Điều cần giữ: mẫu chỉ lấy từ video do MÁY duyệt và chưa có báo cáo (không đếm vi phạm đã biết
 * thành ước lượng), một video vào mẫu một lần, và `fail` gỡ video qua `decide` để vào nhật ký.
 */
describe('Kiểm tra mẫu', () => {
  const admin = { _id: new mongoose.Types.ObjectId(), role: 'admin' };
  const operator = { _id: new mongoose.Types.ObjectId(), role: 'operator' };
  const sampleId = new mongoose.Types.ObjectId().toString();
  const videoId = new mongoose.Types.ObjectId().toString();

  afterEach(() => jest.clearAllMocks());

  describe('createSample', () => {
    it.each([0, -1, 101, 2.5, 'abc', undefined, null])('từ chối cỡ mẫu %p', async (size) => {
      await expect(auditService.createSample(admin, { size })).rejects.toMatchObject({ statusCode: 400 });
      expect(Video.aggregate).not.toHaveBeenCalled();
    });

    it('chỉ lấy video công khai, READY, do máy duyệt, chưa có báo cáo mở và chưa từng vào mẫu', async () => {
      const seen = [new mongoose.Types.ObjectId()];
      AuditSample.distinct.mockResolvedValue(seen);
      Video.aggregate.mockResolvedValue([{ _id: new mongoose.Types.ObjectId() }]);
      AuditSample.insertMany.mockResolvedValue([]);

      await auditService.createSample(admin, { size: 10 });

      const pipeline = Video.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match).toEqual({
        status: 'READY',
        visibility: 'public',
        'moderation.status': 'approved',
        'moderation.source': { $ne: 'admin' },
        'moderation.openReports': { $not: { $gt: 0 } },
        _id: { $nin: seen },
      });
      expect(pipeline[1]).toEqual({ $sample: { size: 10 } });
    });

    it('ghi mọi video của lượt mẫu cùng một mã lượt và người lấy mẫu', async () => {
      const ids = [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()];
      AuditSample.distinct.mockResolvedValue([]);
      Video.aggregate.mockResolvedValue(ids.map((_id) => ({ _id })));
      AuditSample.insertMany.mockResolvedValue([]);

      const result = await auditService.createSample(admin, { size: 5 });

      const docs = AuditSample.insertMany.mock.calls[0][0];
      expect(docs).toHaveLength(2);
      expect(new Set(docs.map((d) => d.batch)).size).toBe(1);
      expect(docs.every((d) => d.drawnBy === admin._id)).toBe(true);
      expect(result).toMatchObject({ requested: 5, drawn: 2, batch: docs[0].batch });
    });

    it('không có video hợp lệ: không tạo lượt rỗng', async () => {
      AuditSample.distinct.mockResolvedValue([]);
      Video.aggregate.mockResolvedValue([]);

      const result = await auditService.createSample(admin, { size: 5 });

      expect(result).toEqual({ batch: null, requested: 5, drawn: 0 });
      expect(AuditSample.insertMany).not.toHaveBeenCalled();
    });
  });

  describe('listSamples', () => {
    const chain = () => ({
      populate: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([]),
    });

    it('từ chối trạng thái lạ', async () => {
      await expect(auditService.listSamples(operator, { status: 'all' })).rejects.toMatchObject({ statusCode: 400 });
    });

    it('operator không nhận email chủ video, admin nhận', async () => {
      const c = chain();
      AuditSample.find.mockReturnValue(c);
      AuditSample.countDocuments.mockResolvedValue(0);

      await auditService.listSamples(operator, {});
      expect(c.populate.mock.calls[0][0].populate.select).toBe('username displayName avatar');

      c.populate.mockClear();
      await auditService.listSamples(admin, {});
      expect(c.populate.mock.calls[0][0].populate.select).toBe('username displayName avatar email');
    });
  });

  describe('labelSample', () => {
    const claim = (doc) => AuditSample.findOneAndUpdate.mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) });

    beforeEach(() => {
      moderationService.decide.mockResolvedValue({});
      AuditSample.updateOne.mockResolvedValue({});
    });

    it('pass: ghi nhãn và không đụng tới video', async () => {
      claim({ _id: sampleId, video: videoId, status: 'pass' });

      await auditService.labelSample(sampleId, operator, { result: 'pass' });

      expect(AuditSample.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: sampleId, status: 'pending' },
        { $set: expect.objectContaining({ status: 'pass', labeledBy: operator._id }) },
        expect.anything()
      );
      expect(moderationService.decide).not.toHaveBeenCalled();
    });

    it('fail: gỡ video qua decide với lý do audit_failed', async () => {
      claim({ _id: sampleId, video: videoId, status: 'fail' });

      await auditService.labelSample(sampleId, operator, { result: 'fail', note: 'có cảnh bạo lực ở phút 3' });

      expect(moderationService.decide).toHaveBeenCalledWith(videoId, operator, {
        decision: 'block',
        reasonCode: 'audit_failed',
        note: 'có cảnh bạo lực ở phút 3',
      });
    });

    it('đã gán nhãn rồi: 404, không gỡ lần hai', async () => {
      claim(null);

      await expect(auditService.labelSample(sampleId, operator, { result: 'fail' })).rejects.toMatchObject({ statusCode: 404 });
      expect(moderationService.decide).not.toHaveBeenCalled();
    });

    it('gỡ video lỗi: mẫu trở về pending để gán lại', async () => {
      claim({ _id: sampleId, video: videoId, status: 'fail' });
      moderationService.decide.mockRejectedValue(new Error('db down'));

      await expect(auditService.labelSample(sampleId, operator, { result: 'fail' })).rejects.toThrow('db down');

      expect(AuditSample.updateOne).toHaveBeenCalledWith(
        { _id: sampleId },
        { $set: { status: 'pending' }, $unset: { labeledBy: '', labeledAt: '' } }
      );
    });

    it('từ chối kết quả lạ và ghi chú quá dài', async () => {
      await expect(auditService.labelSample(sampleId, operator, { result: 'maybe' })).rejects.toMatchObject({ statusCode: 400 });
      await expect(
        auditService.labelSample(sampleId, operator, { result: 'pass', note: 'a'.repeat(501) })
      ).rejects.toMatchObject({ statusCode: 400 });
      expect(AuditSample.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });
});
