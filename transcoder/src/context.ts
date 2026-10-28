/**
 * Everything a job needs before it starts: validated environment, the transcode plan written by
 * the probe step, a scratch directory and, for roles that write encrypted segments, the AES key
 * with the ffmpeg key-info file.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  JobEnvironment,
  KeyMaterial,
  NonRetryableError,
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
  /** Loaded only for roles that encrypt (encode, chunk). */
  key: KeyMaterial | null;
  processed: ReturnType<typeof processedPaths>;
  work: ReturnType<typeof workPaths>;
  scratch: string;
  /** ffmpeg -hls_key_info_file: key URI, local key path, IV (RFC 8216 explicit IV). */
  keyInfoPath: string | null;
  cleanup: () => Promise<void>;
}

export interface LoadOptions {
  /** Read the AES key and write the ffmpeg key-info file (roles that write segments). */
  withKey: boolean;
}

export async function loadContext(raw: NodeJS.ProcessEnv, options: LoadOptions): Promise<JobContext> {
  const env = JobEnvironment.parse(raw);
  const work = workPaths(env.VIDEO_ID, env.UPLOAD_VERSION);
  const [plan, key] = await Promise.all([
    getJson<TranscodePlan>(env.WORK_BUCKET, work.plan),
    options.withKey
      ? getJson<unknown>(env.KEYS_BUCKET, keyObject(env.VIDEO_ID, env.UPLOAD_VERSION)).then((k) => KeyMaterial.parse(k))
      : Promise.resolve(null),
  ]);

  const scratch = await mkdtemp(join(tmpdir(), 'zelos-'));
  let keyInfoPath: string | null = null;
  if (key) {
    const keyPath = join(scratch, 'video.key');
    keyInfoPath = join(scratch, 'key.info');
    const lines = [keyUri(env.API_BASE_URL, env.VIDEO_ID, env.UPLOAD_VERSION), keyPath, key.ivHex];
    await writeFile(keyPath, Buffer.from(key.keyHex, 'hex'), { mode: 0o600 });
    await writeFile(keyInfoPath, `${lines.join('\n')}\n`, { mode: 0o600 });
  }

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

/** Key material of a role that encrypts; a role loaded without withKey fails loudly. */
export function requireKey(ctx: JobContext): { key: KeyMaterial; keyInfoPath: string } {
  if (!ctx.key || !ctx.keyInfoPath) throw new NonRetryableError('this role needs the AES key; load the context withKey');
  return { key: ctx.key, keyInfoPath: ctx.keyInfoPath };
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
