/**
 * Chunked path: encodes each audio bitrate the plan uses exactly once, so every chunk copies
 * the same AAC frames and no packet is repeated or lost at chunk boundaries.
 */
import { join } from 'node:path';
import { downloadToFile, progressReporter, putFile } from '../aws.js';
import { log, type JobContext } from '../context.js';
import { audioJobArgs } from '../ffmpeg/args.js';
import { runProcess } from '../ffmpeg/run.js';

export async function audio(ctx: JobContext): Promise<void> {
  const { env, plan } = ctx;
  if (plan.audioStreamIndex === null) {
    log(ctx, 'source has no audio, nothing to encode');
    return;
  }
  // A local copy: reading a long source through a presigned URL could outlive the credentials.
  const inputUrl = join(ctx.scratch, 'source');
  await downloadToFile(env.RAW_BUCKET, env.RAW_KEY, inputUrl);
  // Audio runs before any chunk; its events carry the chunk count so the bar uses the chunked weights.
  const parts = plan.mode === 'chunked' ? plan.chunkPlan.chunks.length : undefined;
  const report = progressReporter(env.EVENT_BUS_NAME, {
    videoId: env.VIDEO_ID,
    uploadVersion: env.UPLOAD_VERSION,
    step: 'audio',
    ...(parts === undefined ? {} : { parts }),
  });
  const tracks = plan.audioBitratesKbps.length;
  for (const [i, kbps] of plan.audioBitratesKbps.entries()) {
    const outputPath = join(ctx.scratch, `${kbps}k.m4a`);
    await runProcess('ffmpeg', audioJobArgs({ inputUrl, audioStreamIndex: plan.audioStreamIndex, kbps, outputPath }), {
      onProgress: (sec) => {
        if (plan.durationSec) void report(((i + Math.min(1, sec / plan.durationSec)) / tracks) * 100);
      },
    });
    await putFile(env.WORK_BUCKET, ctx.work.audio(kbps), outputPath);
    log(ctx, 'audio track uploaded', { kbps });
  }
  await report(100, true);
}
