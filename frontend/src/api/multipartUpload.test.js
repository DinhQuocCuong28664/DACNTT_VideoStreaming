import test from 'node:test';
import assert from 'node:assert/strict';
import { uploadInParts } from './multipartUpload.js';

/**
 * Chạy bằng `npm test` (node:test của Node, không thêm dependency nào).
 *
 * Mạng được giả bằng hai hàm tiêm vào: getPartUrls (xin URL) và putPart (PUT một
 * phần). Thời gian chờ giữa các lần thử được thay bằng hàm ghi lại, nên test
 * không phải ngủ thật.
 */

const MiB = 1024 * 1024;

/** Một "tệp" chỉ cần size và slice; slice trả về đối tượng nhớ khoảng byte của nó. */
const fakeFile = (size) => ({ size, slice: (start, end) => ({ start, end, size: end - start }) });

/** Dựng môi trường giả: ghi lại mọi lời gọi, cho phép chèn lỗi theo từng phần. */
const harness = ({ size, partSize, failures = {}, urlSizeOverride = {}, omitUrlFor = null } = {}) => {
  const partCount = Math.ceil(size / partSize);
  const calls = { urlRequests: [], puts: [], completes: 0, sleeps: [] };
  const attempts = new Map();

  return {
    calls,
    partCount,
    options: {
      file: fakeFile(size),
      partSize,
      partCount,
      sleep: async (ms) => { calls.sleeps.push(ms); },
      getPartUrls: async (partNumbers) => {
        calls.urlRequests.push(partNumbers);
        return partNumbers
          .filter((n) => n !== omitUrlFor)
          .map((n) => ({
            partNumber: n,
            url: `https://s3.example/part-${n}?v=${calls.urlRequests.length}`,
            size: urlSizeOverride[n] ?? Math.min(partSize, size - (n - 1) * partSize),
          }));
      },
      putPart: async ({ url, body, onProgress, signal }) => {
        const n = Number(/part-(\d+)/.exec(url)[1]);
        attempts.set(n, (attempts.get(n) || 0) + 1);
        calls.puts.push({ n, url, body, attempt: attempts.get(n) });
        if (signal?.aborted) throw Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' });
        const plan = failures[n];
        if (plan && attempts.get(n) <= plan.times) throw new Error(plan.message || 'network down');
        onProgress(body.size / 2);
        onProgress(body.size);
      },
      completeUpload: async () => { calls.completes += 1; },
    },
  };
};

test('tải đủ mọi phần, mỗi phần đúng một lần, rồi mới gọi hoàn tất, và báo 100%', async () => {
  const h = harness({ size: 2 * 32 * MiB + 5 * MiB, partSize: 32 * MiB });
  const progress = [];

  await uploadInParts({ ...h.options, onProgress: (p) => progress.push(p) });

  assert.deepEqual(h.calls.puts.map((p) => p.n).sort(), [1, 2, 3]);
  assert.equal(h.calls.completes, 1);
  assert.deepEqual(progress.at(-1), { loaded: 69 * MiB, total: 69 * MiB, percent: 100 });
});

test('mỗi phần được cắt đúng khoảng byte của nó', async () => {
  const h = harness({ size: 2 * 32 * MiB + 5 * MiB, partSize: 32 * MiB });
  await uploadInParts({ ...h.options, concurrency: 1 });

  const ranges = h.calls.puts.map((p) => [p.n, p.body.start, p.body.end]);
  assert.deepEqual(ranges, [
    [1, 0, 32 * MiB],
    [2, 32 * MiB, 64 * MiB],
    [3, 64 * MiB, 69 * MiB],
  ]);
});

test('xin URL theo nhóm, không mỗi phần một lần gọi', async () => {
  const h = harness({ size: 25 * 32 * MiB, partSize: 32 * MiB });
  await uploadInParts({ ...h.options, concurrency: 1, maxPartUrlsPerRequest: 10 });

  assert.deepEqual(h.calls.urlRequests.map((r) => r.length), [10, 10, 5]);
  assert.deepEqual(h.calls.urlRequests[0], [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(h.calls.puts.length, 25);
});

test('không xin trùng URL của một phần khi nhiều luồng chạy song song', async () => {
  const h = harness({ size: 12 * 32 * MiB, partSize: 32 * MiB });
  await uploadInParts({ ...h.options, concurrency: 3, maxPartUrlsPerRequest: 10 });

  const requested = h.calls.urlRequests.flat();
  assert.equal(new Set(requested).size, requested.length, 'mỗi phần chỉ được xin URL một lần khi không có lỗi');
});

test('không bao giờ chạy quá số luồng song song cho phép', async () => {
  const h = harness({ size: 10 * 32 * MiB, partSize: 32 * MiB });
  let running = 0;
  let peak = 0;
  const original = h.options.putPart;
  h.options.putPart = async (args) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    try { await original(args); } finally { running -= 1; }
  };

  await uploadInParts({ ...h.options, concurrency: 3 });

  assert.equal(peak, 3);
});

test('phần lỗi được thử lại với URL mới và chờ tăng dần, các phần khác không bị ảnh hưởng', async () => {
  const h = harness({ size: 3 * 32 * MiB, partSize: 32 * MiB, failures: { 2: { times: 2 } } });

  await uploadInParts({ ...h.options, concurrency: 1 });

  const part2 = h.calls.puts.filter((p) => p.n === 2);
  assert.equal(part2.length, 3);
  assert.equal(new Set(part2.map((p) => p.url)).size, 3, 'mỗi lần thử phải dùng URL mới');
  assert.deepEqual(h.calls.sleeps, [1000, 2000]);
  assert.equal(h.calls.completes, 1);
  assert.equal(h.calls.puts.filter((p) => p.n === 1).length, 1);
});

test('hết số lần thử thì dừng, báo phần nào hỏng và không gọi hoàn tất', async () => {
  const h = harness({ size: 3 * 32 * MiB, partSize: 32 * MiB, failures: { 2: { times: 99, message: 'reset' } } });

  await assert.rejects(
    uploadInParts({ ...h.options, concurrency: 1, maxAttempts: 3 }),
    (err) => /Part 2 failed after 3 attempt/.test(err.message) && /reset/.test(err.message)
  );
  assert.equal(h.calls.completes, 0);
  assert.equal(h.calls.puts.filter((p) => p.n === 2).length, 3);
  assert.equal(h.calls.puts.some((p) => p.n === 3), false, 'không bắt đầu phần mới sau khi đã thất bại');
});

test('một luồng thất bại thì các luồng khác không nhận thêm phần mới', async () => {
  const h = harness({ size: 20 * 32 * MiB, partSize: 32 * MiB, failures: { 1: { times: 99 } } });

  await assert.rejects(uploadInParts({ ...h.options, concurrency: 3, maxAttempts: 1 }));

  assert.ok(h.calls.puts.length < 20, 'phải dừng sớm, không tải hết các phần còn lại');
  assert.equal(h.calls.completes, 0);
});

test('kích thước máy chủ ký khác kích thước trình duyệt cắt thì dừng ngay, không thử lại', async () => {
  const h = harness({ size: 2 * 32 * MiB, partSize: 32 * MiB, urlSizeOverride: { 1: 16 * MiB } });

  await assert.rejects(uploadInParts({ ...h.options, concurrency: 1 }), /Part 1 failed after 1 attempt.*size mismatch/);
  assert.equal(h.calls.puts.length, 0);
  assert.equal(h.calls.sleeps.length, 0);
});

test('máy chủ không trả URL cho phần cần thì báo lỗi, không xin lại mãi', async () => {
  const h = harness({ size: 2 * 32 * MiB, partSize: 32 * MiB, omitUrlFor: 1 });

  await assert.rejects(uploadInParts({ ...h.options, concurrency: 1, maxAttempts: 2 }), /no upload URL for part 1/);
  assert.ok(h.calls.urlRequests.length <= 4, 'số lần xin URL phải hữu hạn');
});

test('huỷ giữa chừng: ném lỗi huỷ, không thử lại, không gọi hoàn tất', async () => {
  const h = harness({ size: 6 * 32 * MiB, partSize: 32 * MiB });
  const controller = new AbortController();
  const original = h.options.putPart;
  h.options.putPart = async (args) => {
    await original(args);
    if (args.url.includes('part-2')) controller.abort();
  };

  await assert.rejects(
    uploadInParts({ ...h.options, concurrency: 1, signal: controller.signal }),
    (err) => err.code === 'ERR_CANCELED' && err.name === 'CanceledError'
  );
  assert.equal(h.calls.completes, 0);
  assert.equal(h.calls.sleeps.length, 0);
  assert.ok(h.calls.puts.length < 6);
});

test('đã huỷ từ trước thì không làm gì cả', async () => {
  const h = harness({ size: 2 * 32 * MiB, partSize: 32 * MiB });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(uploadInParts({ ...h.options, signal: controller.signal }), (err) => err.code === 'ERR_CANCELED');
  assert.equal(h.calls.urlRequests.length, 0);
  assert.equal(h.calls.puts.length, 0);
});

test('tiến độ luôn nằm trong 0-100% và đạt 100% kể cả khi có phần phải thử lại', async () => {
  const h = harness({ size: 2 * 32 * MiB, partSize: 32 * MiB, failures: { 1: { times: 1 } } });
  const seen = [];

  await uploadInParts({ ...h.options, concurrency: 1, onProgress: (p) => seen.push(p) });

  for (const p of seen) {
    assert.ok(p.loaded <= p.total);
    assert.ok(p.percent >= 0 && p.percent <= 100);
  }
  assert.equal(seen.at(-1).percent, 100);
});

test('lỗi khi hoàn tất được báo ra ngoài, không bị nuốt', async () => {
  const h = harness({ size: 32 * MiB, partSize: 32 * MiB });
  h.options.completeUpload = async () => { throw new Error('UPLOAD_INCOMPLETE'); };

  await assert.rejects(uploadInParts(h.options), /UPLOAD_INCOMPLETE/);
});

test('một phần duy nhất vẫn chạy đúng', async () => {
  const h = harness({ size: 10 * MiB, partSize: 32 * MiB });

  await uploadInParts(h.options);

  assert.equal(h.calls.puts.length, 1);
  assert.deepEqual([h.calls.puts[0].body.start, h.calls.puts[0].body.end], [0, 10 * MiB]);
  assert.equal(h.calls.completes, 1);
});
