/**
 * Chunked path: one child of the array job encodes one window of every rung, uploads its
 * segments, and writes its result last. A child whose last attempt fails writes the abort
 * marker so its siblings stop early instead of encoding a video that can no longer publish.
 */
import { mkdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { NonRetryableError, SEGMENT_SECONDS, parseMediaPlaylist, type ChunkResult, type MeasuredSegment } from '@zelos/shared';
import { exists, presignGet, progressReporter, putDirectory, putJson } from '../aws.js';
import { log, requireKey, type JobContext } from '../context.js';
import { chunkJobArgs } from '../ffmpeg/args.js';
import { runProcess } from '../ffmpeg/run.js';

/** Matches the retry_strategy of the job definition. */
const MAX_ATTEMPTS = 3;

export class AbortedError extends NonRetryableError {
  constructor() {
    super('another chunk failed for good; stopping early');
    this.name = 'AbortedError';
  }
}

export async function chunk(ctx: JobContext): Promise<void> {
  const { env, plan } = ctx;
  if (plan.mode !== 'chunked') throw new NonRetryableError('the chunk job runs only for chunked plans');
  const index = env.AWS_BATCH_JOB_ARRAY_INDEX;
  const item = index === undefined ? undefined : plan.chunkPlan.chunks.at(index);
  if (index === undefined || !item || item.index !== index) throw new NonRetryableError(`chunk index ${index} is not in the plan`);

  if (await exists(env.WORK_BUCKET, ctx.work.abortMarker)) throw new AbortedError();
  const { keyInfoPath } = requireKey(ctx);

  try {
    const outputDir = join(ctx.scratch, 'out');
    await Promise.all(plan.renditions.map((r) => mkdir(join(outputDir, r.name), { recursive: true })));

    const videoUrl = await presignGet(env.RAW_BUCKET, env.RAW_KEY);
    const audio = new Map<number, string>();
    for (const kbps of plan.audioBitratesKbps) audio.set(kbps, await presignGet(env.WORK_BUCKET, ctx.work.audio(kbps)));

    let lastAbortCheck = Date.now();
    let aborted = false;
    await runProcess('ffmpeg', chunkJobArgs({
      videoUrl,
      videoStreamIndex: plan.videoStreamIndex,
      audio,
      renditions: plan.renditions,
      chunk: item,
      fps: plan.fps,
      segmentSeconds: SEGMENT_SECONDS,
      outputDir,
      keyInfoPath,
    }), {
      onProgress: () => {
        if (Date.now() - lastAbortCheck < 30_000) return;
        lastAbortCheck = Date.now();
        void exists(env.WORK_BUCKET, ctx.work.abortMarker).then((yes) => { aborted = yes; });
      },
      shouldStop: () => (aborted ? new AbortedError() : null),
    });

    const result: ChunkResult = { index, rungs: {} };
    for (const r of plan.renditions) {
      const dir = join(outputDir, r.name);
      const entries = parseMediaPlaylist(await readFile(join(dir, 'index.m3u8'), 'utf8'));
      const segments: MeasuredSegment[] = [];
      for (const e of entries) segments.push({ ...e, bytes: (await stat(join(dir, e.uri))).size });
      result.rungs[r.name] = { segments };
    }

    await putDirectory(env.PROCESSED_BUCKET, ctx.processed.root, outputDir, (p) => p.endsWith('.ts'));
    await putJson(env.WORK_BUCKET, ctx.work.chunkResult(index), result);
    // Chunks finish in any order: report this chunk as done, the status function counts them.
    await progressReporter(env.EVENT_BUS_NAME, {
      videoId: env.VIDEO_ID,
      uploadVersion: env.UPLOAD_VERSION,
      step: 'encode',
      part: index,
      parts: plan.chunkPlan.chunks.length,
    })(100, true);
    log(ctx, 'chunk done', { index });
  } catch (err) {
    // Tell the siblings to stop when this chunk will not be tried again.
    const final = err instanceof NonRetryableError || (env.AWS_BATCH_JOB_ATTEMPT ?? 1) >= MAX_ATTEMPTS;
    if (!(err instanceof AbortedError) && final) {
      await putJson(env.WORK_BUCKET, ctx.work.abortMarker, { index, error: String(err) }).catch(() => undefined);
    }
    throw err;
  }
}
