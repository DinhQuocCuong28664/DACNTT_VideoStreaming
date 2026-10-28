/**
 * End-to-end smoke test of the media pipeline, run inside the image's `smoke` stage (which adds
 * ffprobe) by CI. No AWS: sources are synthetic, keys are local files.
 *
 *   single  : 40 s 720p source -> encode -> package -> decrypt and decode every rung
 *   chunked : 75 s source -> 6 chunks -> stitch -> decode; audio has no repeated packet
 *   preview : keyframe preview frames -> sprite sheets -> WebVTT cues
 */
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  audioBitrates,
  buildChunkPlan,
  buildMediaPlaylist,
  buildTranscodePlan,
  hasErrors,
  parseMediaPlaylist,
  planRenditions,
  stitchChunks,
  summarizeProbe,
  type ChunkResult,
  type MeasuredSegment,
} from '@zelos/shared';
import { audioJobArgs, chunkJobArgs, previewFramesArgs, singleJobArgs, spriteArgs } from './ffmpeg/args.js';
import { runProcess } from './ffmpeg/run.js';
import { packageLocal } from './package.js';
import { previewVtt } from './roles/analyse.js';

let failures = 0;
const check = (ok: boolean, message: string): void => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${message}`);
  if (!ok) failures += 1;
};

const ffmpegQuiet = ['-hide_banner', '-loglevel', 'error', '-y'];

async function makeSource(path: string, seconds: number): Promise<void> {
  await runProcess('ffmpeg', [...ffmpegQuiet,
    '-f', 'lavfi', '-i', `testsrc2=size=1280x720:rate=30000/1001:duration=${seconds}`,
    '-f', 'lavfi', '-i', `sine=frequency=440:sample_rate=48000:duration=${seconds}`,
    '-c:v', 'libx264', '-g', '250', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', path]);
}

const ffprobeJson = async (args: string[]) =>
  JSON.parse(await runProcess('ffprobe', ['-v', 'error', '-print_format', 'json', ...args], { captureStdout: true }));

async function keyFiles(dir: string) {
  const key = { keyHex: randomBytes(16).toString('hex'), ivHex: randomBytes(16).toString('hex') };
  const keyPath = join(dir, 'video.key');
  await writeFile(keyPath, Buffer.from(key.keyHex, 'hex'));
  const info = join(dir, 'key.info');
  await writeFile(info, `${keyPath}\n${keyPath}\n${key.ivHex}\n`);
  return { key, keyPath, info };
}

/** Decodes one rung through its playlist with the local key; returns video seconds and audio pts. */
async function decode(dir: string, keyPath: string) {
  const text = (await readFile(join(dir, 'index.m3u8'), 'utf8')).replace(/URI="[^"]*"/, `URI="${keyPath}"`);
  const local = join(dir, 'local.m3u8');
  await writeFile(local, text);
  const common = ['-allowed_extensions', 'ALL', '-protocol_whitelist', 'file,crypto'];
  const video = await ffprobeJson([...common, '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames,r_frame_rate', local]);
  const audio = await ffprobeJson([...common, '-select_streams', 'a:0', '-show_entries', 'packet=pts_time', local]);
  const stream = video.streams[0];
  const [n, d] = String(stream.r_frame_rate).split('/').map(Number);
  return {
    seconds: Number(stream.nb_read_frames) / ((n ?? 30) / (d ?? 1)),
    audioPts: (audio.packets as { pts_time: string }[]).map((p) => Number(p.pts_time)),
  };
}

const repeatedPackets = (pts: number[]): number => pts.filter((t, i) => i > 0 && t - (pts.at(i - 1) ?? 0) < 0.001).length;

async function single(root: string): Promise<void> {
  const dir = join(root, 'single');
  await mkdir(join(dir, 'out'), { recursive: true });
  const src = join(dir, 'src.mp4');
  await makeSource(src, 40);
  const plan = buildTranscodePlan(summarizeProbe(await ffprobeJson(['-show_format', '-show_streams', src])));
  check(plan.mode === 'single', `40 s source takes the single path (${plan.mode})`);
  check(plan.renditions.map((r) => r.name).join() === '144p,240p,360p,480p,720p', 'rungs stop at the 720p source');
  const { key, keyPath, info } = await keyFiles(dir);
  await Promise.all(plan.renditions.map((r) => mkdir(join(dir, 'out', r.name), { recursive: true })));
  await runProcess('ffmpeg', singleJobArgs({
    inputUrl: src, videoStreamIndex: plan.videoStreamIndex, audioStreamIndex: plan.audioStreamIndex,
    renditions: plan.renditions, fps: plan.fps, segmentSeconds: 6, outputDir: join(dir, 'out'), keyInfoPath: info,
  }));
  const pkg = await packageLocal({ outputDir: join(dir, 'out'), renditions: plan.renditions, hasAudio: true, fps: plan.fps, fpsKnown: true, key, apiBaseUrl: 'https://api.example', videoId: 'a'.repeat(24), uploadVersion: 1 });
  for (const r of pkg.rungs) {
    check(/^avc1\.4d[0-9a-f]{4},mp4a\.40\.2$/.test(r.codecs ?? ''), `${r.name} CODECS ${r.codecs}`);
    const segs = parseMediaPlaylist(await readFile(join(dir, 'out', r.name, 'index.m3u8'), 'utf8'));
    check(segs.slice(0, -1).every((s) => s.duration <= 6.5), `${r.name} segments of about 6 s`);
    const decoded = await decode(join(dir, 'out', r.name), keyPath);
    check(Math.abs(decoded.seconds - 40) < 0.2, `${r.name} decrypts and decodes ${decoded.seconds.toFixed(2)} s`);
  }
  const peaks = pkg.rungs.map((r) => r.bandwidth.peak);
  check(peaks.every((p, i) => i === 0 || p > (peaks.at(i - 1) ?? 0)), 'BANDWIDTH ascends');
}

async function chunked(root: string): Promise<void> {
  const dir = join(root, 'chunked');
  await mkdir(dir, { recursive: true });
  const src = join(dir, 'src.mp4');
  await makeSource(src, 75);
  const summary = summarizeProbe(await ffprobeJson(['-show_format', '-show_streams', src]));
  const fps = summary.video!.fps!;
  const plan = buildChunkPlan({ frameCount: summary.video!.nbFrames!, fps, gopsPerChunk: 2 });
  check(plan.chunks.length === 6, `75 s at 12 s per chunk gives 6 chunks (${plan.chunks.length})`);
  const renditions = planRenditions({ width: 1280, height: 720, durationSec: 75, chunked: true });
  const { key, keyPath, info } = await keyFiles(dir);

  const audio = new Map<number, string>();
  for (const kbps of audioBitrates(renditions)) {
    const p = join(dir, `${kbps}k.m4a`);
    await runProcess('ffmpeg', audioJobArgs({ inputUrl: src, audioStreamIndex: summary.audio!.index, kbps, outputPath: p }));
    audio.set(kbps, p);
  }

  const results: ChunkResult[] = [];
  for (const chunk of plan.chunks) {
    const out = join(dir, `c${chunk.index}`);
    await Promise.all(renditions.map((r) => mkdir(join(out, r.name), { recursive: true })));
    await runProcess('ffmpeg', chunkJobArgs({ videoUrl: src, videoStreamIndex: summary.video!.index, audio, renditions, chunk, fps, segmentSeconds: 6, outputDir: out, keyInfoPath: info }));
    const result: ChunkResult = { index: chunk.index, rungs: {} };
    for (const r of renditions) {
      const entries = parseMediaPlaylist(await readFile(join(out, r.name, 'index.m3u8'), 'utf8'));
      const segments: MeasuredSegment[] = [];
      for (const e of entries) segments.push({ ...e, bytes: (await stat(join(out, r.name, e.uri))).size });
      result.rungs[r.name] = { segments };
    }
    results.push(result);
  }

  const stitched = stitchChunks(plan, renditions.map((r) => r.name), results);
  check(!hasErrors(stitched.issues), `stitch accepts the chunks ${JSON.stringify(stitched.issues)}`);

  const joined = join(dir, 'joined720');
  await mkdir(joined, { recursive: true });
  const segs = stitched.rungs.get('720p') ?? [];
  for (const s of segs) {
    const chunkIndex = Number(s.uri.slice(1, 5));
    await writeFile(join(joined, s.uri), await readFile(join(dir, `c${chunkIndex}`, '720p', s.uri)));
  }
  await writeFile(join(joined, 'index.m3u8'), buildMediaPlaylist(segs, { uri: keyPath, ivHex: key.ivHex }));
  const decoded = await decode(joined, keyPath);
  check(Math.abs(decoded.seconds - 75) < 0.2, `stitched 720p decodes ${decoded.seconds.toFixed(2)} s of 75`);
  check(repeatedPackets(decoded.audioPts) === 0, `no audio packet repeats at chunk boundaries (${repeatedPackets(decoded.audioPts)} found)`);
}

async function preview(root: string): Promise<void> {
  const dir = join(root, 'preview');
  await mkdir(join(dir, 'frames'), { recursive: true });
  await mkdir(join(dir, 'sprites'), { recursive: true });
  const src = join(dir, 'src.mp4');
  await makeSource(src, 125);
  await runProcess('ffmpeg', previewFramesArgs({ inputUrl: src, videoStreamIndex: 0, previewIntervalSec: 10, outputDir: join(dir, 'frames') }));
  const frames = (await readdir(join(dir, 'frames'))).filter((f) => f.startsWith('p_')).length;
  check(frames >= 12 && frames <= 14, `125 s gives one preview frame per 10 s (${frames})`);
  await runProcess('ffmpeg', spriteArgs(join(dir, 'frames'), 10, 10, join(dir, 'sprites', 'sprite_%03d.jpg')));
  const sheets = await readdir(join(dir, 'sprites'));
  check(sheets.length === 1, `one sprite sheet for ${frames} frames (${sheets.length})`);
  const vtt = previewVtt(frames, 90, (n) => `sprite_${n}.jpg`);
  check(vtt.split('-->').length - 1 === frames, 'one WebVTT cue per preview frame');
}

const root = await mkdtemp(join(tmpdir(), 'smoke-'));
await single(root);
await chunked(root);
await preview(root);
console.log(failures === 0 ? 'SMOKE PASSED' : `SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
