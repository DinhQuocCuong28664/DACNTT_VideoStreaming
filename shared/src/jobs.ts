/**
 * Contracts between the workflow and the transcoder container: the environment a Batch job
 * receives and the results it writes to the work bucket.
 */
import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);

export const TRANSCODER_ROLES = ['analyse', 'encode', 'audio', 'chunk'] as const;
export type TranscoderRole = (typeof TRANSCODER_ROLES)[number];

/** Environment of every job: static settings from the job definition plus per-job overrides. */
export const JobEnvironment = z.object({
  APP_ENV: z.string().min(1),
  RAW_BUCKET: z.string().min(3),
  PROCESSED_BUCKET: z.string().min(3),
  WORK_BUCKET: z.string().min(3),
  KEYS_BUCKET: z.string().min(3),
  EVENT_BUS_NAME: z.string().min(1),
  API_BASE_URL: z.string().url(),
  VIDEO_ID: objectId,
  UPLOAD_VERSION: z.coerce.number().int().positive(),
  RAW_KEY: z.string().min(1),
  /** Set by AWS Batch for array children. */
  AWS_BATCH_JOB_ARRAY_INDEX: z.coerce.number().int().nonnegative().optional(),
  /** 1-based attempt number, set by AWS Batch. */
  AWS_BATCH_JOB_ATTEMPT: z.coerce.number().int().positive().optional(),
  /** Seconds the job may run before Batch stops it; used by the encode guard. */
  JOB_TIMEOUT_SECONDS: z.coerce.number().int().positive().optional(),
});
export type JobEnvironment = z.infer<typeof JobEnvironment>;

/** AES key material stored in the keys bucket (hex, 32 characters each). */
export const KeyMaterial = z.object({
  keyHex: z.string().regex(/^[0-9a-f]{32}$/),
  ivHex: z.string().regex(/^[0-9a-f]{32}$/),
});
export type KeyMaterial = z.infer<typeof KeyMaterial>;

export interface RungOutput {
  name: string;
  width: number;
  height: number;
  bandwidth: { peak: number; average: number; segments: number };
  codecs: string | null;
}

/** Written by the encode job or the stitch function once the master playlist is uploaded. */
export interface PackageResult {
  master: string;
  rungs: RungOutput[];
  durationSec: number;
}

/** Written by the analyse job. */
export interface AnalyseResult {
  thumbnail: string | null;
  previewVtt: string | null;
  moderation: {
    status: 'approved' | 'review' | 'removed';
    labels: { name: string; parentName: string; confidence: number; action: string; timestamp: number; frames: number }[];
    framesAnalyzed: number;
    framesPlanned: number;
    hasViolence: boolean;
    error: string | null;
  } | null;
}

/**
 * Container exit codes. Batch retries a failed attempt unless the container exits with
 * EXIT_NON_RETRYABLE: a bad source, a plan mismatch, an encode that cannot meet its deadline or
 * a chunk told to stop would fail the same way again. Spot reclaims, network and AWS errors
 * exit with EXIT_RETRYABLE and are retried.
 */
export const EXIT_RETRYABLE = 1;
export const EXIT_NON_RETRYABLE = 3;

/** An error that another attempt cannot fix. */
export class NonRetryableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableError';
  }
}
