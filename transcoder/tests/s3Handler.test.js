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
