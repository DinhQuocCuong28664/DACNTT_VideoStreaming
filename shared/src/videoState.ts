/**
 * Video lifecycle. Only the workflow `status` function moves a video between
 * processing states; the API only creates drafts and changes publication fields.
 */
export const VIDEO_STATUSES = ['UPLOADING', 'PROCESSING', 'READY', 'SCHEDULED', 'ERROR'] as const;
export type VideoStatus = (typeof VIDEO_STATUSES)[number];

/** Steps reported while a video is PROCESSING, in workflow order. */
export const PROCESSING_STEPS = ['queued', 'probe', 'analyse', 'encode', 'stitch', 'publish'] as const;
export type ProcessingStep = (typeof PROCESSING_STEPS)[number];

const TRANSITIONS: ReadonlyMap<VideoStatus, readonly VideoStatus[]> = new Map<VideoStatus, readonly VideoStatus[]>([
  ['UPLOADING', ['PROCESSING', 'ERROR']],
  // A new upload version restarts processing; a failed run can be retried.
  ['PROCESSING', ['READY', 'SCHEDULED', 'ERROR', 'PROCESSING']],
  ['SCHEDULED', ['READY', 'PROCESSING']],
  ['READY', ['PROCESSING']],
  ['ERROR', ['PROCESSING']],
]);

export function canTransition(from: VideoStatus, to: VideoStatus): boolean {
  return TRANSITIONS.get(from)?.includes(to) ?? false;
}

export const VISIBILITIES = ['public', 'unlisted', 'private', 'password'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const AUDIENCES = ['public', 'members'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const MODERATION_STATUSES = ['pending', 'approved', 'review', 'removed'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];
