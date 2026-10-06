const limits = require('../src/config/uploadLimits');

const MiB = 1024 * 1024;
const GiB = 1024 * MiB;

describe('resolveMaxVideoSizeBytes — trần tải lên theo biến môi trường', () => {
  it('mặc định 2 GiB khi không đặt MAX_VIDEO_SIZE_GB', () => {
    expect(limits.resolveMaxVideoSizeBytes({})).toBe(2 * GiB);
    expect(limits.DEFAULT_MAX_VIDEO_SIZE_BYTES).toBe(2 * GiB);
  });

  it('đọc được giá trị hợp lệ, kể cả số lẻ', () => {
    expect(limits.resolveMaxVideoSizeBytes({ MAX_VIDEO_SIZE_GB: '8' })).toBe(8 * GiB);
    expect(limits.resolveMaxVideoSizeBytes({ MAX_VIDEO_SIZE_GB: '0.5' })).toBe(0.5 * GiB);
  });

  it('không bao giờ vượt trần cứng 20 GiB, dù cấu hình cao hơn', () => {
    expect(limits.resolveMaxVideoSizeBytes({ MAX_VIDEO_SIZE_GB: '20' })).toBe(20 * GiB);
    expect(limits.resolveMaxVideoSizeBytes({ MAX_VIDEO_SIZE_GB: '500' })).toBe(20 * GiB);
  });

  it('giá trị sai (rỗng, chữ, 0, âm) quay về mặc định thay vì mở rộng hay chặn hết', () => {
    for (const bad of ['', 'abc', '0', '-3', 'NaN']) {
      expect(limits.resolveMaxVideoSizeBytes({ MAX_VIDEO_SIZE_GB: bad })).toBe(2 * GiB);
    }
  });
});

describe('usesMultipart — chọn đường tải lên theo dung lượng khai', () => {
  it('tệp nhỏ hoặc đúng ngưỡng dùng presigned POST', () => {
    expect(limits.usesMultipart(50 * MiB)).toBe(false);
    expect(limits.usesMultipart(limits.MULTIPART_THRESHOLD_BYTES)).toBe(false);
  });

  it('lớn hơn ngưỡng dù một byte thì dùng multipart', () => {
    expect(limits.usesMultipart(limits.MULTIPART_THRESHOLD_BYTES + 1)).toBe(true);
    expect(limits.usesMultipart(10 * GiB)).toBe(true);
  });

  it('không khai dung lượng thì dùng presigned POST (S3 vẫn ép trần bằng policy)', () => {
    expect(limits.usesMultipart(undefined)).toBe(false);
    expect(limits.usesMultipart(null)).toBe(false);
    expect(limits.usesMultipart(NaN)).toBe(false);
  });
});

describe('chia phần', () => {
  const part = limits.MULTIPART_PART_SIZE_BYTES;

  it('phần là 32 MiB, nằm trong giới hạn 5 MiB - 5 GiB của S3', () => {
    expect(part).toBe(32 * MiB);
    expect(part).toBeGreaterThanOrEqual(5 * MiB);
    expect(part).toBeLessThanOrEqual(5 * GiB);
  });

  it('trần cứng 20 GiB là 640 phần, dưới giới hạn 10.000 phần và 1.000 phần của một trang ListParts', () => {
    const count = limits.countParts(limits.HARD_MAX_VIDEO_SIZE_BYTES);
    expect(count).toBe(640);
    expect(count).toBeLessThan(1000);
  });

  it('countParts làm tròn lên', () => {
    expect(limits.countParts(part)).toBe(1);
    expect(limits.countParts(part + 1)).toBe(2);
    expect(limits.countParts(3 * part)).toBe(3);
  });

  it('mọi phần đúng bằng kích thước phần, trừ phần cuối là phần còn lại', () => {
    const size = 2 * part + 5 * MiB;
    expect(limits.partSizeOf(1, size)).toBe(part);
    expect(limits.partSizeOf(2, size)).toBe(part);
    expect(limits.partSizeOf(3, size)).toBe(5 * MiB);
  });

  it('tệp chia hết thì phần cuối cũng đầy', () => {
    expect(limits.partSizeOf(3, 3 * part)).toBe(part);
  });

  it('tổng dung lượng các phần luôn bằng dung lượng tệp', () => {
    for (const size of [1, part - 1, part, part + 1, 7 * part + 123, 600 * MiB + 1, 20 * GiB]) {
      const count = limits.countParts(size);
      let sum = 0;
      for (let n = 1; n <= count; n += 1) sum += limits.partSizeOf(n, size);
      expect(sum).toBe(size);
    }
  });

  it('số phần ngoài tệp hoặc không phải số nguyên thì trả null, không bao giờ ký', () => {
    const size = 2 * part;
    for (const bad of [0, -1, 3, 1.5, NaN, undefined, '1', null]) {
      expect(limits.partSizeOf(bad, size)).toBeNull();
    }
  });

  it('dùng được kích thước phần lưu cùng video, không phụ thuộc hằng số hiện tại', () => {
    expect(limits.partSizeOf(2, 15 * MiB, 10 * MiB)).toBe(5 * MiB);
    expect(limits.countParts(15 * MiB, 10 * MiB)).toBe(2);
  });
});
