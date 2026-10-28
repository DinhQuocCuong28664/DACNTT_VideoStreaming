/**
 * Everything a job needs before it starts: validated environment, the transcode plan written by
 * the probe step, the AES key, and a scratch directory with the ffmpeg key-info file.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JobEnvironment,
  KeyMaterial,
  keyObject,
  keyUri,
  processedPaths,
  workPaths,
  type TranscodePlan,
} from '@zelos/shared';
import { getJson } from './aws.js';

export interface JobContext {
  env: JobEnvironment;
  plan: TranscodePlan;
  key: KeyMaterial;
  processed: ReturnType<typeof processedPaths>;
  work: ReturnType<typeof workPaths>;
  scratch: string;
  /** ffmpeg -hls_key_info_file: key URI, local key path, IV (RFC 8216 explicit IV). */
  keyInfoPath: string;
  cleanup: () => Promise<void>;
}

export async function loadContext(raw: NodeJS.ProcessEnv = process.env): Promise<JobContext> {
  const env = JobEnvironment.parse(raw);
  const work = workPaths(env.VIDEO_ID, env.UPLOAD_VERSION);
  const [plan, key] = await Promise.all([
    getJson<TranscodePlan>(env.WORK_BUCKET, work.plan),
    getJson<unknown>(env.KEYS_BUCKET, keyObject(env.VIDEO_ID, env.UPLOAD_VERSION)).then((k) => KeyMaterial.parse(k)),
  ]);

  const scratch = await mkdtemp(join(tmpdir(), 'zelos-'));
  const keyPath = join(scratch, 'video.key');
  const keyInfoPath = join(scratch, 'key.info');
  await writeFile(keyPath, Buffer.from(key.keyHex, 'hex'), { mode: 0o600 });
  await writeFile(keyInfoPath, `${keyUri(env.API_BASE_URL, env.VIDEO_ID, env.UPLOAD_VERSION)}\n${keyPath}\n${key.ivHex}\n`, { mode: 0o600 });

  return {
    env,
    plan,
    key,
    processed: processedPaths(env.VIDEO_ID, env.UPLOAD_VERSION),
    work,
    scratch,
    keyInfoPath,
    cleanup: () => rm(scratch, { recursive: true, force: true }),
  };
}

/** Structured log line; every line carries the video and upload version. */
export function log(ctx: Pick<JobContext, 'env'> | null, msg: string, extra: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    level: 'info',
    msg,
    ...(ctx ? { videoId: ctx.env.VIDEO_ID, uploadVersion: ctx.env.UPLOAD_VERSION } : {}),
    ...extra,
  }));
}
