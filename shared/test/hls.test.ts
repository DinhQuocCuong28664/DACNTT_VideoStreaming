import { createCipheriv } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildMasterPlaylist,
  buildMediaPlaylist,
  measureBandwidth,
  parseMediaPlaylist,
  type MeasuredSegment,
} from '../src/hls/playlist.js';
import { AAC_LC, avcCodecFromBytes, codecsFor, decryptPrefix } from '../src/hls/codecs.js';
import { hasErrors, stitchChunks, type ChunkResult } from '../src/hls/stitch.js';
import { buildChunkPlan } from '../src/media/chunkPlan.js';

describe('parseMediaPlaylist', () => {
  it('reads URIs and durations, skipping tags, blank lines and CRLF', () => {
    const text = '#EXTM3U\r\n#EXTINF:6.000000,\r\n\r\nseg0.ts\r\n#EXTINF:4.5,\r\nseg1.ts\r\n#EXT-X-ENDLIST\r\n';
    expect(parseMediaPlaylist(text)).toEqual([
      { uri: 'seg0.ts', duration: 6 },
      { uri: 'seg1.ts', duration: 4.5 },
    ]);
  });

  it('never takes #EXT-X-ENDLIST for a segment and returns nothing for an empty playlist', () => {
    expect(parseMediaPlaylist('#EXTM3U\n#EXTINF:6,\n#EXT-X-ENDLIST\n')).toEqual([]);
    expect(parseMediaPlaylist('')).toEqual([]);
  });
});

describe('buildMediaPlaylist', () => {
  const segs = [
    { uri: 'a.ts', duration: 6.006 },
    { uri: 'b.ts', duration: 6.4 },
    { uri: 'c.ts', duration: 2.1 },
  ];

  it('round-trips through the parser in order', () => {
    expect(parseMediaPlaylist(buildMediaPlaylist(segs))).toEqual(segs);
  });

  it('keeps every rounded EXTINF at or below TARGETDURATION', () => {
    const text = buildMediaPlaylist(segs);
    const target = Number(/#EXT-X-TARGETDURATION:(\d+)/.exec(text)![1]);
    for (const s of segs) expect(Math.round(s.duration)).toBeLessThanOrEqual(target);
    expect(text.trimEnd().endsWith('#EXT-X-ENDLIST')).toBe(true);
  });

  it('writes one key tag with the explicit IV before the first segment, and none without a key', () => {
    const withKey = buildMediaPlaylist(segs, { uri: 'https://api.example/v1/videos/x/key', ivHex: '00'.repeat(15) + '01' });
    expect(withKey.match(/#EXT-X-KEY/g)).toHaveLength(1);
    expect(withKey.indexOf('#EXT-X-KEY')).toBeLessThan(withKey.indexOf('#EXTINF'));
    expect(withKey).toContain('IV=0x00000000000000000000000000000001');
    expect(buildMediaPlaylist(segs)).not.toContain('#EXT-X-KEY');
  });
});

describe('measureBandwidth', () => {
  const seg = (bytes: number, duration: number): MeasuredSegment => ({ uri: 'x', bytes, duration });

  it('keeps peak and average apart and rounds the peak up', () => {
    const bw = measureBandwidth([seg(750_000, 6), seg(1_500_001, 6)])!;
    expect(bw.peak).toBe(Math.ceil((1_500_001 * 8) / 6));
    expect(bw.average).toBe(Math.round(((750_000 + 1_500_001) * 8) / 12));
  });

  it('uses the real duration of a short last segment', () => {
    expect(measureBandwidth([seg(100_000, 6), seg(100_000, 1)])!.peak).toBe(800_000);
  });

  it('skips empty or zero-length segments and returns null when nothing is measurable', () => {
    expect(measureBandwidth([seg(0, 6), seg(100, 0)])).toBeNull();
    expect(measureBandwidth([])).toBeNull();
  });
});

describe('buildMasterPlaylist', () => {
  const bw = (peak: number) => ({ peak, average: peak - 1000, segments: 3 });

  it('lists variants in ascending bandwidth with quoted CODECS', () => {
    const text = buildMasterPlaylist([
      { uri: '720p/index.m3u8', width: 1280, height: 720, bandwidth: bw(2_400_000), frameRate: 29.97, codecs: 'avc1.4d401f,mp4a.40.2' },
      { uri: '360p/index.m3u8', width: 640, height: 360, bandwidth: bw(700_000), frameRate: 29.97, codecs: 'avc1.4d401e,mp4a.40.2' },
    ]);
    expect(text.indexOf('360p')).toBeLessThan(text.indexOf('720p'));
    expect(text).toContain('CODECS="avc1.4d401f,mp4a.40.2"');
    expect(text).toContain('FRAME-RATE=29.970');
  });

  it('leaves CODECS out of a variant whose codecs could not be read', () => {
    const text = buildMasterPlaylist([{ uri: 'a/index.m3u8', width: 2, height: 2, bandwidth: bw(1000), frameRate: null, codecs: null }]);
    expect(text).not.toContain('CODECS');
    expect(text).not.toContain('FRAME-RATE');
  });
});

describe('codecs', () => {
  // Access unit delimiter (NAL 9), then an SPS (NAL 7) with profile 0x4d, flags 0x40, level 0x1f.
  const sample = Uint8Array.from([0x47, 0x00, 0x00, 0x00, 0x01, 0x09, 0xf0, 0x00, 0x00, 0x01, 0x67, 0x4d, 0x40, 0x1f, 0xec]);

  it('reads profile, constraints and level from the SPS, not from the NAL before it', () => {
    expect(avcCodecFromBytes(sample)).toBe('avc1.4d401f');
  });

  it('reads a four-byte start code', () => {
    expect(avcCodecFromBytes(Uint8Array.from([0, 0, 0, 1, 0x67, 0x64, 0x00, 0x28]))).toBe('avc1.640028');
  });

  it('returns null for a truncated SPS or no SPS', () => {
    expect(avcCodecFromBytes(Uint8Array.from([0, 0, 1, 0x67, 0x4d]))).toBeNull();
    expect(avcCodecFromBytes(Uint8Array.from([0, 0, 1, 0x09, 0xf0]))).toBeNull();
    expect(avcCodecFromBytes(new Uint8Array())).toBeNull();
  });

  it('adds AAC-LC only for videos with sound, and gives nothing when the video codec is unknown', () => {
    expect(codecsFor(sample, true)).toBe(`avc1.4d401f,${AAC_LC}`);
    expect(codecsFor(sample, false)).toBe('avc1.4d401f');
    expect(codecsFor(new Uint8Array(4), true)).toBeNull();
  });

  it('decrypts the leading blocks of an AES-128 segment', () => {
    const key = Buffer.alloc(16, 7);
    const iv = Buffer.alloc(16, 1);
    const plain = Buffer.concat([Buffer.from(sample), Buffer.alloc(49, 0xaa)]);
    const cipher = createCipheriv('aes-128-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
    const prefix = decryptPrefix(encrypted.subarray(0, 40), key, iv);
    expect(prefix).toHaveLength(32);
    expect(avcCodecFromBytes(prefix)).toBe('avc1.4d401f');
  });
});

describe('stitchChunks', () => {
  const fps = { num: 30, den: 1 };
  // 3 chunks of 2 GOPs (12 s each); the last is open-ended.
  const plan = buildChunkPlan({ frameCount: 30 * 36, fps, gopsPerChunk: 2 });
  const rungs = ['360p', '720p'];
  const segs = (n: number, duration = 6) =>
    Array.from({ length: n }, (_, i) => ({ uri: `s${i}.ts`, duration, bytes: 1000 }));
  const result = (index: number, n = 2, duration = 6): ChunkResult => ({
    index,
    rungs: { '360p': { segments: segs(n, duration) }, '720p': { segments: segs(n, duration) } },
  });

  it('joins chunks in order when they match the plan', () => {
    const out = stitchChunks(plan, rungs, [result(2), result(0), result(1)]);
    expect(out.issues).toEqual([]);
    expect(out.rungs.get('720p')).toHaveLength(6);
  });

  it('refuses a missing chunk result', () => {
    expect(hasErrors(stitchChunks(plan, rungs, [result(0), result(2)]).issues)).toBe(true);
  });

  it('refuses an empty middle chunk but accepts an empty last chunk', () => {
    expect(hasErrors(stitchChunks(plan, rungs, [result(0), result(1, 0), result(2)]).issues)).toBe(true);
    expect(hasErrors(stitchChunks(plan, rungs, [result(0), result(1), result(2, 0)]).issues)).toBe(false);
  });

  it('refuses rungs with different segment boundaries', () => {
    const bad = result(1);
    bad.rungs['720p'] = { segments: [{ uri: 'a', duration: 5, bytes: 1 }, { uri: 'b', duration: 7, bytes: 1 }] };
    expect(hasErrors(stitchChunks(plan, rungs, [result(0), bad, result(2)]).issues)).toBe(true);
  });

  it('warns on one extra frame and fails at three frames or more of drift', () => {
    const oneFrame = stitchChunks(plan, rungs, [result(0, 2, 6 + 1 / 60), result(1), result(2)]).issues;
    expect(oneFrame.map((i) => i.level)).toEqual(['warning']);
    // Two segments, each two frames long: four frames over the chunk.
    const fourFrames = stitchChunks(plan, rungs, [result(0, 2, 6 + 2 / 30), result(1), result(2)]).issues;
    expect(hasErrors(fourFrames)).toBe(true);
  });

  it('flags a chunk index outside the plan', () => {
    expect(hasErrors(stitchChunks(plan, rungs, [result(0), result(1), result(2), result(7)]).issues)).toBe(true);
  });
});
