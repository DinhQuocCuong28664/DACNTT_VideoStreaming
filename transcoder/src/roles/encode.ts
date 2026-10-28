/**
 * Single-job path: one ffmpeg run writes every rung, then packaging measures and rewrites the
 * playlists, uploads segments and media playlists, and uploads the master last so the CDN
 * never serves a partial video.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NonRetryableError, SEGMENT_SECONDS, type PackageResult } from '@zelos/shared';
import { downloadToFile, progressReporter, putDirectory, putFile, putJson } from '../aws.js';
import { log, requireKey, type JobContext } from '../context.js';
import { singleJobArgs } from '../ffmpeg/args.js';
import { DEFAULT_GUARD, createGuard } from '../ffmpeg/guard.js';
import { runProcess } from '../ffmpeg/run.js';
import { packageLocal } from '../package.js';

export async function encode(ctx: JobContext): Promise<void> {
  const { env, plan } = ctx;
  if (plan.mode !== 'single') throw new NonRetryableError('the encode job runs only for single-job plans');
  const { key, keyInfoPath } = requireKey(ctx);

  const outputDir = join(ctx.scratch, 'out');
  await Promise.all(plan.renditions.map((r) => mkdir(join(outputDir, r.name), { recursive: true })));

  // A local copy: a presigned URL could expire during a multi-hour encode (see aws.ts).
  const inputUrl = join(ctx.scratch, 'source');
  await downloadToFile(env.RAW_BUCKET, env.RAW_KEY, inputUrl);
  const report = progressReporter(env.EVENT_BUS_NAME, { videoId: env.VIDEO_ID, uploadVersion: env.UPLOAD_VERSION, step: 'encode' });
  const guard = createGuard(plan.durationSec, { ...DEFAULT_GUARD, budgetSec: env.JOB_TIMEOUT_SECONDS ?? 8 * 3600 });
  const started = Date.now();
  let encodedSec = 0;

  log(ctx, 'encode started', { rungs: plan.renditions.map((r) => r.name), durationSec: plan.durationSec });
  await runProcess('ffmpeg', singleJobArgs({
    inputUrl,
    videoStreamIndex: plan.videoStreamIndex,
    audioStreamIndex: plan.audioStreamIndex,
    renditions: plan.renditions,
    fps: plan.fps,
    segmentSeconds: SEGMENT_SECONDS,
    outputDir,
    keyInfoPath,
  }), {
    onProgress: (sec) => {
      encodedSec = sec;
      if (plan.durationSec) void report((sec / plan.durationSec) * 95);
    },
    shouldStop: () => guard.check({ elapsedSec: (Date.now() - started) / 1000, encodedSec }),
  });
  log(ctx, 'encode finished', { seconds: Math.round((Date.now() - started) / 1000) });

  const packaged = await packageLocal({
    outputDir,
    renditions: plan.renditions,
    hasAudio: plan.hasAudio,
    fps: plan.fps,
    fpsKnown: plan.fpsKnown,
    key,
    apiBaseUrl: env.API_BASE_URL,
    videoId: env.VIDEO_ID,
    uploadVersion: env.UPLOAD_VERSION,
  });

  const uploaded = await putDirectory(env.PROCESSED_BUCKET, ctx.processed.root, outputDir, (p) => p.endsWith('.ts'));
  await putDirectory(env.PROCESSED_BUCKET, ctx.processed.root, outputDir, (p) => p.endsWith('index.m3u8'));
  const masterPath = join(ctx.scratch, 'master.m3u8');
  await writeFile(masterPath, packaged.master);
  await putFile(env.PROCESSED_BUCKET, ctx.processed.master, masterPath);

  const result: PackageResult = { master: ctx.processed.master, rungs: packaged.rungs, durationSec: plan.durationSec ?? encodedSec };
  await putJson(env.WORK_BUCKET, ctx.work.encodeResult, result);
  await report(100, true);
  log(ctx, 'package uploaded', { segments: uploaded });
}
