/**
 * Chunked path: encodes each audio bitrate the plan uses exactly once, so every chunk copies
 * the same AAC frames and no packet is repeated or lost at chunk boundaries.
 */
import { join } from 'node:path';
import { presignGet, putFile } from '../aws.js';
import { log, type JobContext } from '../context.js';
import { audioJobArgs } from '../ffmpeg/args.js';
import { runProcess } from '../ffmpeg/run.js';

export async function audio(ctx: JobContext): Promise<void> {
  const { env, plan } = ctx;
  if (plan.audioStreamIndex === null) {
    log(ctx, 'source has no audio, nothing to encode');
    return;
  }
  const inputUrl = await presignGet(env.RAW_BUCKET, env.RAW_KEY);
  for (const kbps of plan.audioBitratesKbps) {
    const outputPath = join(ctx.scratch, `${kbps}k.m4a`);
    await runProcess('ffmpeg', audioJobArgs({ inputUrl, audioStreamIndex: plan.audioStreamIndex, kbps, outputPath }));
    await putFile(env.WORK_BUCKET, ctx.work.audio(kbps), outputPath);
    log(ctx, 'audio track uploaded', { kbps });
  }
}
