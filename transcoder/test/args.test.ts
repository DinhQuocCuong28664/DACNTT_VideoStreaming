import { describe, expect, it } from 'vitest';
import { buildChunkPlan, planRenditions } from '@zelos/shared';
import {
  audioJobArgs,
  chunkJobArgs,
  forceKeyFramesExpr,
  frameAtArgs,
  previewFramesArgs,
  singleJobArgs,
  videoEncodeArgs,
} from '../src/ffmpeg/args.js';

const renditions = planRenditions({ width: 1920, height: 1080, durationSec: 60 });
const ntsc = { num: 30000, den: 1001 };
const url = 'https://bucket.s3.amazonaws.com/raw/x?X-Amz-Signature=abc';

const valueAfter = (args: string[], flag: string): string[] =>
  args.flatMap((a, i) => (a === flag ? [args.at(i + 1) ?? ''] : []));

describe('videoEncodeArgs', () => {
  const top = renditions.at(-1)!;

  it('scales to the planned size with square pixels, 8-bit 4:2:0 and no -level', () => {
    const args = videoEncodeArgs(top);
    expect(valueAfter(args, '-vf')).toEqual(['scale=1920:1080,setsar=1']);
    expect(valueAfter(args, '-pix_fmt')).toEqual(['yuv420p']);
    expect(args).not.toContain('-level');
    expect(valueAfter(args, '-profile:v')).toEqual(['main']);
  });

  it('uses capped CRF with the rung VBV settings', () => {
    const args = videoEncodeArgs(top);
    expect(valueAfter(args, '-crf')).toEqual(['22']);
    expect(valueAfter(args, '-maxrate')).toEqual(['4500k']);
    expect(valueAfter(args, '-bufsize')).toEqual(['9000k']);
  });

  it('trims and restarts timestamps before scaling for chunks', () => {
    expect(valueAfter(videoEncodeArgs(top, { trimEnd: 300, restartPts: true }), '-vf')).toEqual([
      'trim=end=300.000000,setpts=PTS-STARTPTS,scale=1920:1080,setsar=1',
    ]);
  });
});

describe('singleJobArgs', () => {
  const args = singleJobArgs({
    inputUrl: url,
    videoStreamIndex: 0,
    audioStreamIndex: 1,
    renditions,
    fps: ntsc,
    segmentSeconds: 6,
    outputDir: '/tmp/out',
    keyInfoPath: '/tmp/key.info',
  });

  it('reads the source once', () => {
    expect(args.filter((a) => a === '-i')).toHaveLength(1);
    expect(args).toContain('-reconnect');
  });

  it('gives every rung the same keyframe rules from the real frame rate', () => {
    expect(new Set(valueAfter(args, '-force_key_frames'))).toEqual(new Set([forceKeyFramesExpr(6)]));
    expect(valueAfter(args, '-g')).toEqual(Array(6).fill('180'));
    expect(valueAfter(args, '-keyint_min')).toEqual(Array(6).fill('180'));
    expect(valueAfter(args, '-sc_threshold')).toEqual(Array(6).fill('0'));
  });

  it('writes one encrypted HLS output per rung into its own directory', () => {
    expect(valueAfter(args, '-hls_key_info_file')).toEqual(Array(6).fill('/tmp/key.info'));
    expect(valueAfter(args, '-hls_segment_filename').at(0)).toBe('/tmp/out/144p/seg_%05d.ts');
    expect(args.filter((a) => a.endsWith('/index.m3u8'))).toHaveLength(6);
  });

  it('maps audio and encodes it per rung bitrate only when the source has sound', () => {
    expect(valueAfter(args, '-b:a')).toEqual(['64k', '64k', '64k', '64k', '128k', '128k']);
    const silent = singleJobArgs({
      inputUrl: url, videoStreamIndex: 0, audioStreamIndex: null, renditions, fps: ntsc,
      segmentSeconds: 6, outputDir: '/o', keyInfoPath: null,
    });
    expect(silent).not.toContain('-c:a');
    expect(silent).not.toContain('-hls_key_info_file');
  });
});

describe('chunkJobArgs', () => {
  const plan = buildChunkPlan({ frameCount: 30 * 3600, fps: { num: 30, den: 1 }, gopsPerChunk: 50 });
  const full = planRenditions({ width: 1920, height: 1080, durationSec: 3600, chunked: true });
  const audio = new Map([[64, 'https://w/64k.m4a'], [128, 'https://w/128k.m4a']]);
  const build = (index: number) => chunkJobArgs({
    videoUrl: url, videoStreamIndex: 0, audio, renditions: full, chunk: plan.chunks.at(index)!,
    fps: { num: 30, den: 1 }, segmentSeconds: 6, outputDir: '/o', keyInfoPath: '/k',
  });

  it('seeks the video and both audio tracks to the chunk windows', () => {
    const args = build(1);
    const chunk = plan.chunks.at(1)!;
    expect(valueAfter(args, '-ss')).toEqual([chunk.seekSeconds.toFixed(6), chunk.audioSeekSeconds.toFixed(6), chunk.audioSeekSeconds.toFixed(6)]);
    expect(args.filter((a) => a === '-i')).toHaveLength(3);
  });

  it('copies the matching audio track per rung and offsets output timestamps', () => {
    const args = build(1);
    expect(valueAfter(args, '-map').filter((m) => m.endsWith(':a:0'))).toEqual(['1:a:0', '1:a:0', '1:a:0', '1:a:0', '2:a:0', '2:a:0']);
    expect(new Set(valueAfter(args, '-output_ts_offset'))).toEqual(new Set([plan.chunks.at(1)!.tsOffsetSeconds.toFixed(6)]));
    expect(valueAfter(args, '-hls_segment_filename').at(0)).toBe('/o/144p/c0001_%03d.ts');
  });

  it('never seeks chunk 0 and leaves the last chunk without -t', () => {
    expect(build(0)).not.toContain('-ss');
    expect(build(plan.chunks.length - 1)).not.toContain('-t');
  });

  it('keeps every chunk keyframe-aligned without scene cuts', () => {
    expect(new Set(valueAfter(build(2), '-g'))).toEqual(new Set(['180']));
    expect(new Set(valueAfter(build(2), '-sc_threshold'))).toEqual(new Set(['0']));
  });
});

describe('other jobs', () => {
  it('encodes stereo AAC-LC audio at the requested bitrate', () => {
    const args = audioJobArgs({ inputUrl: url, audioStreamIndex: 2, kbps: 128, outputPath: '/o/a.m4a' });
    expect(valueAfter(args, '-map')).toEqual(['0:2']);
    expect(valueAfter(args, '-b:a')).toEqual(['128k']);
    expect(valueAfter(args, '-ac')).toEqual(['2']);
  });

  it('decodes only keyframes for preview frames', () => {
    const args = previewFramesArgs({ inputUrl: url, videoStreamIndex: 0, previewIntervalSec: 10, outputDir: '/p' });
    expect(args.indexOf('-skip_frame')).toBeLessThan(args.indexOf('-i'));
    expect(valueAfter(args, '-vf')).toEqual(['fps=1/10,scale=160:-2']);
  });

  it('seeks before the input for a single frame', () => {
    const args = frameAtArgs(url, 0, 12.5, '/f.jpg');
    expect(args.indexOf('-ss')).toBeLessThan(args.indexOf('-i'));
    expect(valueAfter(args, '-frames:v')).toEqual(['1']);
  });
});
