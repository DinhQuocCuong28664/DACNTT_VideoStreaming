const fs = require('fs');
const os = require('os');
const path = require('path');
const { S3Client } = require('@aws-sdk/client-s3');
const { runWithConcurrency, uploadDirectoryToS3 } = require('../src/s3Handler');

/**
 * Tải kết quả HLS lên S3 song song, có giới hạn.
 */
const tick = () => new Promise((resolve) => setImmediate(resolve));

describe('runWithConcurrency', () => {
  it('xử lý hết mọi phần tử, không bao giờ quá giới hạn cùng lúc', async () => {
    let running = 0;
    let peak = 0;
    const seen = [];

    await runWithConcurrency([...Array(20).keys()], 4, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      seen.push(item);
      running -= 1;
    });

    expect(seen.sort((a, b) => a - b)).toEqual([...Array(20).keys()]);
    expect(peak).toBe(4);
  });

  it('thất bại khi một việc lỗi, và các luồng khác thôi nhận việc mới', async () => {
    const started = [];

    await expect(
      runWithConcurrency([...Array(50).keys()], 3, async (item) => {
        started.push(item);
        await tick();
        if (item === 2) throw new Error('S3 PUT failed');
      })
    ).rejects.toThrow('S3 PUT failed');

    // Sau lỗi không còn việc mới nào được bắt đầu: xa mới tới 50.
    await tick();
    expect(started.length).toBeLessThan(10);
  });

  it('danh sách rỗng thì xong ngay', async () => {
    await expect(runWithConcurrency([], 8, async () => {})).resolves.toBeUndefined();
  });
});

/**
 * Đọc hết Body như S3 thật vẫn làm. Bỏ dở stream thì nó mở tệp muộn, sau khi
 * afterEach đã xoá thư mục, và làm sập tiến trình test.
 */
const drain = async (stream) => {
  for await (const _chunk of stream);
};

describe('uploadDirectoryToS3', () => {
  let dir;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hls-'));
    fs.mkdirSync(path.join(dir, '720p'));
    fs.writeFileSync(path.join(dir, 'master.m3u8'), '#EXTM3U');
    for (let i = 0; i < 5; i += 1) {
      fs.writeFileSync(path.join(dir, '720p', `segment_00${i}.ts`), 'x'.repeat(10));
    }
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    jest.restoreAllMocks();
  });

  it('tải mọi tệp với key dùng dấu "/" (kể cả khi chạy trên Windows)', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (command) => {
      await drain(command.input.Body);
      return {};
    });

    const result = await uploadDirectoryToS3(dir, 'processed', 'videos/abc');

    const keys = send.mock.calls.map(([command]) => command.input.Key).sort();
    expect(keys).toEqual([
      'videos/abc/720p/segment_000.ts',
      'videos/abc/720p/segment_001.ts',
      'videos/abc/720p/segment_002.ts',
      'videos/abc/720p/segment_003.ts',
      'videos/abc/720p/segment_004.ts',
      'videos/abc/master.m3u8',
    ]);
    expect(result.fileCount).toBe(6);
    expect(result.totalSize).toBe(7 + 5 * 10);
  });

  it('báo lỗi khi S3 từ chối một tệp, để job bị đánh ERROR thay vì READY thiếu segment', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockImplementation(async (command) => {
      await drain(command.input.Body);
      throw new Error('AccessDenied');
    });

    await expect(uploadDirectoryToS3(dir, 'processed', 'videos/abc')).rejects.toThrow('AccessDenied');
  });
});

describe('các hàm S3 của pipeline chia đoạn', () => {
  const { putJson, getJson, deleteObjects } = require('../src/s3Handler');

  beforeEach(() => {
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());

  it('putJson ghi JSON với đúng Content-Type', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({});
    await putJson('raw', 'work/v/plan.json', { a: 1 });
    expect(send.mock.calls[0][0].input).toMatchObject({
      Bucket: 'raw',
      Key: 'work/v/plan.json',
      Body: '{"a":1}',
      ContentType: 'application/json',
    });
  });

  it('getJson đọc lại đúng đối tượng đã ghi', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ Body: { transformToString: async () => '{"index":3}' } });
    expect(await getJson('raw', 'work/v/chunks/0003.json')).toEqual({ index: 3 });
  });

  it('getJson trả null khi chưa có tệp, nhưng ném lỗi quyền hay mạng (đừng nuốt lỗi thật)', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(Object.assign(new Error('x'), { name: 'NoSuchKey' }));
    expect(await getJson('raw', 'k')).toBeNull();

    jest.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(Object.assign(new Error('x'), { $metadata: { httpStatusCode: 404 } }));
    expect(await getJson('raw', 'k')).toBeNull();

    jest.spyOn(S3Client.prototype, 'send').mockRejectedValueOnce(Object.assign(new Error('Access Denied'), { name: 'AccessDenied' }));
    await expect(getJson('raw', 'k')).rejects.toThrow('Access Denied');
  });

  it('deleteObjects chia theo 1000 khoá mỗi lệnh (giới hạn của S3)', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({});
    const keys = Array.from({ length: 2500 }, (_, i) => `work/v/chunks/${i}.json`);

    const result = await deleteObjects('raw', keys);

    expect(send.mock.calls.map(([c]) => c.input.Delete.Objects.length)).toEqual([1000, 1000, 500]);
    expect(result).toEqual({ deleted: 2500, failed: 0 });
  });

  it('deleteObjects báo số khoá xoá lỗi nhưng không ném (tệp tạm có lifecycle dọn nốt)', async () => {
    jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({ Errors: [{ Key: 'work/v/a.json', Message: 'denied' }] });
    expect(await deleteObjects('raw', ['work/v/a.json', 'work/v/b.json'])).toEqual({ deleted: 1, failed: 1 });
  });

  it('deleteObjects với danh sách rỗng không gọi S3', async () => {
    const send = jest.spyOn(S3Client.prototype, 'send').mockResolvedValue({});
    expect(await deleteObjects('raw', [])).toEqual({ deleted: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
