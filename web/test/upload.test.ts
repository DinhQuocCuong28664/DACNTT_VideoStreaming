import { describe, expect, it } from 'vitest';
import { formatEta, uploadInParts, UploadCancelled, type PartUrl } from '../src/lib/upload';

const MB = 1024 * 1024;
const file = (size: number) => new Blob([new Uint8Array(size)]);

function server(partSize: number, total: number) {
  const requests: number[][] = [];
  const getPartUrls = async (nums: number[]): Promise<PartUrl[]> => {
    requests.push(nums);
    return nums.map((n) => ({ partNumber: n, size: Math.min(partSize, total - (n - 1) * partSize), url: `u${n}-${requests.length}` }));
  };
  return { requests, getPartUrls };
}

describe('multipart upload', () => {
  it('uploads every part once with the right size and reports 100 %', async () => {
    const total = 5 * MB + 3;
    const s = server(MB, total);
    const sizes = new Map<number, number>();
    const progress: number[] = [];
    await uploadInParts({
      file: file(total), partSize: MB, partCount: 6, getPartUrls: s.getPartUrls,
      putPart: async (url, body, onProgress) => { sizes.set(Number(url.slice(1).split('-')[0]), body.size); onProgress(body.size); },
      onProgress: (p) => progress.push(p.percent),
    });
    expect([...sizes.keys()].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(sizes.get(6)).toBe(3);
    expect(progress.at(-1)).toBe(100);
    // URLs are fetched in batches, not one request per part.
    expect(s.requests.length).toBeLessThan(6);
  });

  it('retries a failed part with a fresh URL', async () => {
    const total = 2 * MB;
    const s = server(MB, total);
    let failures = 0;
    const used: string[] = [];
    await uploadInParts({
      file: file(total), partSize: MB, partCount: 2, getPartUrls: s.getPartUrls, sleep: async () => undefined,
      putPart: async (url) => { used.push(url); if (url.startsWith('u2') && failures === 0) { failures += 1; throw new Error('boom'); } },
    });
    const part2 = used.filter((u) => u.startsWith('u2'));
    expect(part2).toHaveLength(2);
    expect(part2[0]).not.toBe(part2[1]);
  });

  it('gives up after the last attempt and refuses a size mismatch at once', async () => {
    const total = MB;
    await expect(uploadInParts({
      file: file(total), partSize: MB, partCount: 1, sleep: async () => undefined, maxAttempts: 3,
      getPartUrls: server(MB, total).getPartUrls, putPart: async () => { throw new Error('down'); },
    })).rejects.toThrow(/after 3 attempt/);
    let calls = 0;
    await expect(uploadInParts({
      file: file(total), partSize: MB, partCount: 1, sleep: async () => undefined,
      getPartUrls: async (n) => n.map((p) => ({ partNumber: p, size: 7, url: 'x' })), putPart: async () => { calls += 1; },
    })).rejects.toThrow(/size mismatch/);
    expect(calls).toBe(0);
  });

  it('stops on cancel', async () => {
    const ctl = new AbortController();
    ctl.abort();
    await expect(uploadInParts({ file: file(MB), partSize: MB, partCount: 1, signal: ctl.signal, getPartUrls: server(MB, MB).getPartUrls, putPart: async () => undefined }))
      .rejects.toBeInstanceOf(UploadCancelled);
  });
});

describe('eta', () => {
  it('reads as hours, minutes or seconds', () => {
    expect(formatEta(42)).toBe('42s');
    expect(formatEta(125)).toBe('2m 5s');
    expect(formatEta(3 * 3600 + 120)).toBe('3h 2m');
  });
});
