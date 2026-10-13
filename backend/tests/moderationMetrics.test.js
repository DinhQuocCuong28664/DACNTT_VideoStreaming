const { wilsonInterval } = require('../src/utils/stats');
const moderationService = require('../src/services/moderationService');
const Video = require('../src/models/Video');
const ModerationEvent = require('../src/models/ModerationEvent');
const AuditSample = require('../src/models/AuditSample');

jest.mock('../src/models/Video');
jest.mock('../src/models/Comment');
jest.mock('../src/models/Report');
jest.mock('../src/models/User');
jest.mock('../src/models/ModerationEvent');
jest.mock('../src/models/AuditSample');
jest.mock('../src/services/s3Service');

describe('wilsonInterval', () => {
  it('trả null khi chưa có mẫu thay vì chia cho 0', () => {
    expect(wilsonInterval(0, 0)).toBeNull();
  });

  it('khớp giá trị tham chiếu của khoảng Wilson 95%', () => {
    // 5/20: p̂ = 0,25; khoảng Wilson 95% = [0,1119; 0,4687] (giá trị chuẩn của công thức).
    const ci = wilsonInterval(5, 20);
    expect(ci.value).toBe(0.25);
    expect(ci.low).toBeCloseTo(0.1119, 3);
    expect(ci.high).toBeCloseTo(0.4687, 3);
    expect(ci.n).toBe(20);
  });

  it('mẫu nhỏ cho khoảng rộng: 2/3 không "chắc chắn là 67%"', () => {
    const ci = wilsonInterval(2, 3);
    expect(ci.high - ci.low).toBeGreaterThan(0.5);
  });

  it('0 thành công vẫn có cận trên dương, và cận dưới không âm', () => {
    const ci = wilsonInterval(0, 10);
    expect(ci.value).toBe(0);
    expect(ci.low).toBe(0);
    expect(ci.high).toBeGreaterThan(0.2);
  });

  it('tất cả thành công: cận trên không vượt 1', () => {
    const ci = wilsonInterval(10, 10);
    expect(ci.high).toBeLessThanOrEqual(1);
    expect(ci.low).toBeLessThan(1);
  });

  it('từ chối số thành công ngoài [0, n]', () => {
    expect(() => wilsonInterval(5, 4)).toThrow(RangeError);
    expect(() => wilsonInterval(-1, 4)).toThrow(RangeError);
  });
});

describe('getMetrics', () => {
  // Mỗi hàng giả lập một nhóm của $group: (kết luận máy, trạng thái cuối, người đã xét, nhãn hàng đầu).
  const row = (auto, final, human, label, count) => ({ _id: { auto, final, human, label }, count });

  beforeEach(() => {
    ModerationEvent.aggregate.mockResolvedValue([
      { _id: { outcome: 'false_positive', reasonCode: 'fiction_or_game' }, count: 3 },
      { _id: { outcome: 'false_negative', reasonCode: 'report_upheld' }, count: 1 },
    ]);
    // pending, pass, fail theo thứ tự getMetrics hỏi.
    AuditSample.countDocuments.mockResolvedValueOnce(4).mockResolvedValueOnce(46).mockResolvedValueOnce(2);
  });

  afterEach(() => jest.clearAllMocks());

  it('đếm FP, TP, chưa xét và tính tỉ lệ cùng khoảng tin cậy', async () => {
    Video.aggregate.mockResolvedValue([
      row('blocked', 'approved', true, 'Graphic Violence', 3), // máy gỡ, người khôi phục: FP
      row('blocked', 'blocked', true, 'Graphic Violence', 7), // máy gỡ, người giữ: TP
      row('blocked', 'blocked', false, 'Explicit Nudity', 10), // máy gỡ, chưa ai xét
      row('flagged', 'approved', true, 'Violence', 4), // cờ vô ích
      row('flagged', 'blocked', true, 'Violence', 6), // cờ đúng
      row('flagged', 'flagged', false, 'Violence', 2), // cờ chưa xét
      row('approved', 'blocked', true, null, 2), // máy duyệt, người gỡ: FN đã biết
      row('approved', 'approved', false, null, 500), // duyệt bình thường
      row(null, 'blocked', true, null, 1), // quyết định từ trước khi ghi kết luận của máy
    ]);

    const metrics = await moderationService.getMetrics();

    expect(metrics.autoBlocked).toMatchObject({ reviewed: 10, falsePositive: 3, truePositive: 7, unreviewed: 10 });
    expect(metrics.autoBlocked.coverage).toBe(0.5);
    expect(metrics.autoBlocked.falsePositiveRate.value).toBe(0.3);
    expect(metrics.autoBlocked.falsePositiveRate.n).toBe(10);
    expect(metrics.autoBlocked.falsePositiveRate.low).toBeLessThan(0.3);
    expect(metrics.autoBlocked.falsePositiveRate.high).toBeGreaterThan(0.3);

    expect(metrics.autoFlagged).toMatchObject({ reviewed: 10, confirmed: 6, noise: 4, unreviewed: 2 });
    expect(metrics.autoFlagged.precision.value).toBe(0.6);

    expect(metrics.missed.falseNegative).toBe(2);
    expect(metrics.unclassifiedDecisions).toBe(1);

    // Tỉ lệ FN ước lượng chỉ từ mẫu ngẫu nhiên đã gán nhãn: 2 lọt trên 48 đã xét (4 chưa xét không tính).
    expect(metrics.audit).toMatchObject({ sampled: 52, pending: 4, labelled: 48, failed: 2 });
    expect(metrics.audit.falseNegativeRate.value).toBeCloseTo(2 / 48, 4);
    expect(metrics.audit.falseNegativeRate.n).toBe(48);
  });

  it('tách tỉ lệ gỡ nhầm theo nhãn hàng đầu, nhãn nhiều mẫu nhất lên đầu', async () => {
    Video.aggregate.mockResolvedValue([
      row('blocked', 'approved', true, 'Graphic Violence', 3),
      row('blocked', 'blocked', true, 'Graphic Violence', 7),
      row('blocked', 'blocked', true, 'Explicit Nudity', 2),
      row('blocked', 'blocked', false, 'Explicit Nudity', 5),
    ]);

    const { byLabel } = await moderationService.getMetrics();

    expect(byLabel.map((l) => l.label)).toEqual(['Graphic Violence', 'Explicit Nudity']);
    expect(byLabel[0]).toMatchObject({ reviewed: 10, falsePositive: 3 });
    expect(byLabel[1]).toMatchObject({ reviewed: 2, falsePositive: 0, unreviewed: 5 });
    expect(byLabel[1].falsePositiveRate.value).toBe(0);
  });

  it('chưa có dữ liệu: các tỉ lệ là null, không phải NaN', async () => {
    Video.aggregate.mockResolvedValue([]);
    ModerationEvent.aggregate.mockResolvedValue([]);

    const metrics = await moderationService.getMetrics();

    expect(metrics.autoBlocked.falsePositiveRate).toBeNull();
    expect(metrics.autoBlocked.coverage).toBeNull();
    expect(metrics.autoFlagged.precision).toBeNull();
    expect(metrics.missed.falseNegative).toBe(0);
    expect(metrics.byLabel).toEqual([]);
  });

  it('trả phân bố mã lý do từ nhật ký', async () => {
    Video.aggregate.mockResolvedValue([]);

    const { byReason } = await moderationService.getMetrics();

    expect(byReason[0]).toEqual({ outcome: 'false_positive', reasonCode: 'fiction_or_game', count: 3 });
  });
});
