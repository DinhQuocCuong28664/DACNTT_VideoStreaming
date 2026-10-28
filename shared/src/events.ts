/**
 * Event contracts between the producers and consumers of the transcoding
 * pipeline. Every boundary validates its input with these schemas.
 */
import { z } from 'zod';
import { PROCESSING_STEPS } from './videoState.js';

const objectId = z.string().regex(/^[a-f0-9]{24}$/, 'expected a 24-character hex id');

/** Raw uploads live at raw/{videoId}/{uploadVersion}/source. */
export const RAW_KEY_PATTERN = /^raw\/([a-f0-9]{24})\/(\d+)\/source$/;

export function rawObjectKey(videoId: string, uploadVersion: number): string {
  return `raw/${videoId}/${uploadVersion}/source`;
}

/**
 * User metadata pinned on the raw object by the upload policy. S3 lower-cases
 * the names and drops the `x-amz-meta-` prefix in HeadObject responses.
 */
export const RawObjectMetadata = z.object({
  'video-id': objectId,
  'upload-version': z.coerce.number().int().positive(),
  'owner-id': objectId,
});
export type RawObjectMetadata = z.infer<typeof RawObjectMetadata>;

/** Input of the transcode state machine, built by the starter function. */
export const WorkflowInput = z.object({
  videoId: objectId,
  uploadVersion: z.number().int().positive(),
  ownerId: objectId,
  bucket: z.string().min(3),
  key: z.string().regex(RAW_KEY_PATTERN),
  sizeBytes: z.number().int().nonnegative(),
});
export type WorkflowInput = z.infer<typeof WorkflowInput>;

/** Execution name: one execution per upload version, so duplicate events start nothing. */
export function executionName(videoId: string, uploadVersion: number): string {
  return `${videoId}-${uploadVersion}`;
}

export const EVENT_SOURCE = 'zelos.transcoder';

export const TranscodeProgress = z.object({
  videoId: objectId,
  uploadVersion: z.number().int().positive(),
  step: z.enum(PROCESSING_STEPS),
  /** Share of the current step that is done, 0..100. */
  percent: z.number().min(0).max(100),
});
export type TranscodeProgress = z.infer<typeof TranscodeProgress>;

export const VideoPublished = z.object({
  videoId: objectId,
  ownerId: objectId,
  publishedAt: z.string().datetime(),
});
export type VideoPublished = z.infer<typeof VideoPublished>;
