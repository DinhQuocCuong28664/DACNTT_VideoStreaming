/**
 * Container entry point: `node dist/main.js <role>`. The role comes from the job definition;
 * the video comes from per-job environment overrides set by the workflow.
 */
import { TRANSCODER_ROLES, type TranscoderRole } from '@zelos/shared';
import { loadContext, log, type JobContext } from './context.js';
import { analyse } from './roles/analyse.js';
import { audio } from './roles/audio.js';
import { chunk } from './roles/chunk.js';
import { encode } from './roles/encode.js';

const ROLES: ReadonlyMap<TranscoderRole, (ctx: JobContext) => Promise<void>> = new Map([
  ['analyse', analyse],
  ['encode', encode],
  ['audio', audio],
  ['chunk', chunk],
]);

async function main(): Promise<void> {
  const role = process.argv.at(2) as TranscoderRole | undefined;
  const run = role && TRANSCODER_ROLES.includes(role) ? ROLES.get(role) : undefined;
  if (!run) throw new Error(`unknown role "${role}"; expected one of ${TRANSCODER_ROLES.join(', ')}`);

  const ctx = await loadContext();
  log(ctx, 'job started', { role, attempt: ctx.env.AWS_BATCH_JOB_ATTEMPT, arrayIndex: ctx.env.AWS_BATCH_JOB_ARRAY_INDEX });
  try {
    await run(ctx);
    log(ctx, 'job finished', { role });
  } finally {
    await ctx.cleanup();
  }
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({
    level: 'error',
    msg: 'job failed',
    role: process.argv.at(2),
    videoId: process.env['VIDEO_ID'],
    error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  }));
  process.exit(1);
});
