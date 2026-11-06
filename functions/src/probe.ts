/**
 * Workflow step "Probe": reads the source headers with ffprobe over a presigned URL, decides
 * the transcode plan, stores it in the work bucket, and returns the small summary the state
 * machine branches on. ffprobe comes from a Lambda layer at /opt/bin/ffprobe.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkflowInput, buildTranscodePlan, summarizeProbe, workPaths, type FfprobeOutput, type TranscodePlan } from '@zelos/shared';
import { required, s3Store, type ObjectStore } from './lib/s3.js';

const run = promisify(execFile);

export interface ProbeOutput {
  mode: TranscodePlan['mode'];
  planKey: string;
  durationSec: number | null;
  hasAudio: boolean;
  rungs: string[];
  /** Number of array children; 0 on the single path. */
  chunkCount: number;
  fallbackReason: string | null;
  /** vCPU and memory for the encode job on the single path, by duration. */
  encode: { vcpu: string; memory: string };
}

export interface ProbeDeps {
  store: ObjectStore;
  ffprobe: (url: string) => Promise<FfprobeOutput>;
  workBucket: string;
  /** Chunk slots that can run at once (Fargate vCPU ceiling / chunk vCPU). */
  parallelSlots: number;
}

/**
 * Task size of the single-path encode. One ffmpeg run decodes once and feeds up to six libx264
 * outputs, so it uses eight threads well. With 1 vCPU a 2-minute 1080p video took 6-9 minutes
 * (S5, 2026-11-04), longer than a 27-minute video on the chunked path. Clips up to a minute stay
 * at 4 vCPU so a burst of short uploads still fits many tasks under the Fargate ceiling.
 */
export function encodeSize(durationSec: number | null): { vcpu: string; memory: string } {
  if (durationSec !== null && durationSec <= 60) return { vcpu: '4', memory: '8192' };
  return { vcpu: '8', memory: '16384' };
}

export async function probe(input: unknown, deps: ProbeDeps): Promise<ProbeOutput> {
  const event = WorkflowInput.parse(input);
  const url = await deps.store.presignGet(event.bucket, event.key, 900);
  const plan = buildTranscodePlan(summarizeProbe(await deps.ffprobe(url)), { parallelSlots: deps.parallelSlots });

  const planKey = workPaths(event.videoId, event.uploadVersion).plan;
  await deps.store.putText(deps.workBucket, planKey, JSON.stringify(plan), 'application/json');

  return {
    mode: plan.mode,
    planKey,
    durationSec: plan.durationSec,
    hasAudio: plan.hasAudio,
    rungs: plan.renditions.map((r) => r.name),
    chunkCount: plan.mode === 'chunked' ? plan.chunkPlan.chunks.length : 0,
    fallbackReason: plan.mode === 'single' ? plan.fallbackReason : null,
    encode: encodeSize(plan.durationSec),
  };
}

async function ffprobeUrl(url: string): Promise<FfprobeOutput> {
  const { stdout } = await run(process.env['FFPROBE_PATH'] ?? '/opt/bin/ffprobe', [
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    '-reconnect', '1',
    '-rw_timeout', '30000000',
    url,
  ], { maxBuffer: 10 * 1024 * 1024, timeout: 120_000 });
  return JSON.parse(stdout) as FfprobeOutput;
}

let deps: ProbeDeps | undefined;

export const handler = async (event: unknown): Promise<ProbeOutput> => {
  deps ??= {
    store: s3Store(),
    ffprobe: ffprobeUrl,
    workBucket: required('WORK_BUCKET'),
    parallelSlots: Number(process.env['CHUNK_PARALLEL_SLOTS'] ?? '4'),
  };
  return probe(event, deps);
};
