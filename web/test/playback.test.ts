import { describe, expect, it } from 'vitest';
import { addWatched, cueAt, embedCode, parseSpriteVtt, parseStartTime, qualityLabel, reachedView, signUrl, viewThreshold, withStartTime } from '../src/lib/playback';

describe('view rule', () => {
  it('needs 30 seconds, or the whole of a shorter video', () => {
    expect(viewThreshold(600)).toBe(30);
    expect(viewThreshold(8)).toBe(7.5);
    expect(viewThreshold(Number.NaN)).toBe(30);
    expect(viewThreshold(30.09)).toBeCloseTo(29.59);
    expect(reachedView(29.9, 600)).toBe(false);
    expect(reachedView(30, 600)).toBe(true);
  });

  it('adds only real playback, not seeks or stalls', () => {
    expect(addWatched(10, 5, 5.25, true)).toBe(10.25);
    expect(addWatched(10, 5, 60, true)).toBe(10);
    expect(addWatched(10, 5, 4, true)).toBe(10);
    expect(addWatched(10, 5, 5.25, false)).toBe(10);
    expect(addWatched(10, null, 5.25, true)).toBe(10);
  });
});

describe('start time links', () => {
  it('reads seconds and h/m/s in order, and refuses anything else', () => {
    expect(parseStartTime('90')).toBe(90);
    expect(parseStartTime('1m30s')).toBe(90);
    expect(parseStartTime('1h2m3s')).toBe(3723);
    expect(parseStartTime('2m')).toBe(120);
    expect(parseStartTime('3s1m')).toBeNull();
    expect(parseStartTime('1m1m')).toBeNull();
    expect(parseStartTime('abc')).toBeNull();
    expect(parseStartTime('')).toBeNull();
    expect(parseStartTime(null)).toBeNull();
  });

  it('writes ?t= only for whole positive seconds', () => {
    expect(withStartTime('https://web.test/watch/a?t=5', 61.9)).toBe('https://web.test/watch/a?t=61');
    expect(withStartTime('https://web.test/watch/a?t=5', 0)).toBe('https://web.test/watch/a');
  });
});

describe('signed CDN URLs', () => {
  const q = { Policy: 'p', Signature: 's', 'Key-Pair-Id': 'K' };
  it('adds the policy to CDN URLs only, never to the API', () => {
    expect(signUrl('https://cdn.test/videos/a/v1/master.m3u8', 'https://cdn.test', q)).toBe('https://cdn.test/videos/a/v1/master.m3u8?Policy=p&Signature=s&Key-Pair-Id=K');
    expect(signUrl('https://api.test/v1/videos/a/key?v=1', 'https://cdn.test', q)).toBe('https://api.test/v1/videos/a/key?v=1');
  });
});

describe('seek preview sprites', () => {
  it('reads cues with xywh fragments relative to the VTT', () => {
    const vtt = 'WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nsprite_000.jpg#xywh=0,0,160,90\n\n00:00:05.000 --> 00:00:10.000\nsprite_000.jpg#xywh=160,0,160,90\n';
    const cues = parseSpriteVtt(vtt, 'https://cdn.test/videos/a/v1/preview/thumbnails.vtt');
    expect(cues).toHaveLength(2);
    expect(cues[1]).toEqual({ start: 5, end: 10, url: 'https://cdn.test/videos/a/v1/preview/sprite_000.jpg', x: 160, y: 0, w: 160, h: 90 });
    expect(cueAt(cues, 7)?.x).toBe(160);
    expect(cueAt(cues, 11)).toBeUndefined();
  });
});

describe('quality labels', () => {
  it('names portrait and wide frames by their 16:9 equivalent', () => {
    expect(qualityLabel(1920, 1080)).toBe('1080p');
    expect(qualityLabel(1080, 1920)).toBe('1080p');
    expect(qualityLabel(1920, 800)).toBe('1080p');
    expect(qualityLabel(256, 144)).toBe('144p');
  });
});

describe('embedCode', () => {
  it('builds an iframe for the embed route and escapes the title', () => {
    const code = embedCode('https://v2-staging.zelostech.site', 'abc123', 'Tom & "Jerry" <live>');
    expect(code).toContain('src="https://v2-staging.zelostech.site/embed/abc123"');
    expect(code).toContain('title="Tom &amp; &quot;Jerry&quot; &lt;live&gt;"');
    expect(code).toContain('allowfullscreen');
  });
});
