/**
 * One pass over the source for everything that is not encoding: moderation frames checked with
 * Rekognition, the default thumbnail, and the seek-preview sprite sheets with their WebVTT map.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  DEFAULT_THRESHOLDS,
  buildSamplePlan,
  evaluateFrames,
  type AnalyseResult,
  type FrameAnalysis,
} from '@zelos/shared';
import { detectModerationLabels, presignGet, progressReporter, putFile, putJson } from '../aws.js';
import { log, type JobContext } from '../context.js';
import { frameAtArgs, previewFramesArgs, spriteArgs } from '../ffmpeg/args.js';
import { runProcess } from '../ffmpeg/run.js';

const PREVIEW_INTERVAL_SEC = 10;
const TILE_WIDTH = 160;
const COLUMNS = 10;
const ROWS = 10;

const vttTime = (sec: number): string => {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.toFixed(3).padStart(6, '0')}`;
};

/** WebVTT cues pointing at one tile of a sprite sheet each (media fragment #xywh). */
export function previewVtt(frameCount: number, tileHeight: number, spriteName: (n: number) => string): string {
  const lines = ['WEBVTT', ''];
  const perSheet = COLUMNS * ROWS;
  for (let i = 0; i < frameCount; i += 1) {
    const sheet = Math.floor(i / perSheet);
    const pos = i % perSheet;
    const x = (pos % COLUMNS) * TILE_WIDTH;
    const y = Math.floor(pos / COLUMNS) * tileHeight;
    lines.push(`${vttTime(i * PREVIEW_INTERVAL_SEC)} --> ${vttTime((i + 1) * PREVIEW_INTERVAL_SEC)}`);
    lines.push(`${spriteName(sheet)}#xywh=${x},${y},${TILE_WIDTH},${tileHeight}`, '');
  }
  return lines.join('\n');
}

export async function analyse(ctx: JobContext): Promise<void> {
  const { env, plan } = ctx;
  const inputUrl = await presignGet(env.RAW_BUCKET, env.RAW_KEY);
  const report = progressReporter(env.EVENT_BUS_NAME, { videoId: env.VIDEO_ID, uploadVersion: env.UPLOAD_VERSION, step: 'analyse' });
  const top = plan.renditions.at(-1)!;
  const tileHeight = Math.max(2, Math.round((TILE_WIDTH * top.height) / top.width / 2) * 2);

  // Moderation frames, a few at a time.
  const samples = buildSamplePlan(plan.durationSec);
  const framesDir = join(ctx.scratch, 'frames');
  await mkdir(framesDir, { recursive: true });
  const moderationEnabled = process.env['MODERATION_ENABLED'] !== 'false';
  const analysed: FrameAnalysis[] = [];
  const queue = samples.map((t, i) => ({ t, i }));
  const worker = async (): Promise<void> => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const path = join(framesDir, `m_${job.i}.jpg`);
      try {
        await runProcess('ffmpeg', frameAtArgs(inputUrl, plan.videoStreamIndex, job.t, path));
        if (moderationEnabled) {
          const r = await detectModerationLabels(await readFile(path), DEFAULT_THRESHOLDS.reviewConfidence - 10);
          analysed.push({ timestamp: job.t, labels: r.labels, contentTypes: r.contentTypes });
        }
      } catch (err) {
        log(ctx, 'frame skipped', { timestamp: job.t, error: String(err) });
      }
      void report((analysed.length / samples.length) * 60);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));

  // Thumbnail: the sample closest to 10% into the video avoids black intros.
  const thumbAt = plan.durationSec ? plan.durationSec * 0.1 : 0;
  const thumbPath = join(ctx.scratch, 'thumbnail.jpg');
  let thumbnail: string | null = null;
  try {
    await runProcess('ffmpeg', frameAtArgs(inputUrl, plan.videoStreamIndex, thumbAt, thumbPath));
    await putFile(env.PROCESSED_BUCKET, ctx.processed.thumbnail, thumbPath);
    thumbnail = ctx.processed.thumbnail;
  } catch (err) {
    log(ctx, 'thumbnail failed', { error: String(err) });
  }

  // Seek-preview sprites from keyframes only.
  let previewVttKey: string | null = null;
  try {
    const previewDir = join(ctx.scratch, 'preview');
    await mkdir(previewDir, { recursive: true });
    await runProcess('ffmpeg', previewFramesArgs({ inputUrl, videoStreamIndex: plan.videoStreamIndex, previewIntervalSec: PREVIEW_INTERVAL_SEC, outputDir: previewDir }));
    const frames = (await readdir(previewDir)).filter((f) => f.startsWith('p_')).length;
    if (frames > 0) {
      const spritesDir = join(ctx.scratch, 'sprites');
      await mkdir(spritesDir, { recursive: true });
      await runProcess('ffmpeg', spriteArgs(previewDir, COLUMNS, ROWS, join(spritesDir, 'sprite_%03d.jpg')));
      // ffmpeg numbers image sequences from 1; the VTT uses the uploaded names from 0.
      const sheets = (await readdir(spritesDir)).sort();
      for (const [n, name] of sheets.entries()) await putFile(env.PROCESSED_BUCKET, ctx.processed.sprite(n), join(spritesDir, name));
      const vttPath = join(ctx.scratch, 'thumbnails.vtt');
      await writeFile(vttPath, previewVtt(frames, tileHeight, (n) => ctx.processed.sprite(n).split('/').at(-1)!));
      await putFile(env.PROCESSED_BUCKET, ctx.processed.previewVtt, vttPath);
      previewVttKey = ctx.processed.previewVtt;
    }
  } catch (err) {
    log(ctx, 'preview sprites failed', { error: String(err) });
  }

  const verdict = moderationEnabled ? evaluateFrames(analysed, samples.length) : null;
  const result: AnalyseResult = {
    thumbnail,
    previewVtt: previewVttKey,
    moderation: verdict && {
      status: verdict.status,
      labels: verdict.labels,
      framesAnalyzed: verdict.framesAnalyzed,
      framesPlanned: verdict.framesPlanned,
      hasViolence: verdict.hasViolence,
      error: verdict.error,
    },
  };
  await putJson(env.WORK_BUCKET, ctx.work.analyseResult, result);
  await report(100, true);
  log(ctx, 'analyse done', { moderation: verdict?.status ?? 'disabled', framesAnalyzed: verdict?.framesAnalyzed });
}
