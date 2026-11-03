import { describe, expect, it } from 'vitest';
import { previewVtt } from '../src/roles/analyse.js';

describe('previewVtt', () => {
  const vtt = previewVtt(102, 90, (n) => `sprite_${String(n).padStart(3, '0')}.jpg`);
  const cues = vtt.split('\n\n').slice(1).filter(Boolean);

  it('starts with the WEBVTT header and has one cue per preview frame', () => {
    expect(vtt.startsWith('WEBVTT\n')).toBe(true);
    expect(cues).toHaveLength(102);
  });

  it('maps frames to tiles row by row, ten per row, 100 per sheet', () => {
    expect(cues.at(0)).toBe('00:00:00.000 --> 00:00:10.000\nsprite_000.jpg#xywh=0,0,160,90');
    expect(cues.at(11)).toContain('sprite_000.jpg#xywh=160,90,160,90');
    expect(cues.at(100)).toContain('sprite_001.jpg#xywh=0,0,160,90');
  });

  it('writes hours, minutes and milliseconds', () => {
    expect(previewVtt(400, 90, () => 's.jpg')).toContain('01:06:30.000 --> 01:06:40.000');
  });
});
