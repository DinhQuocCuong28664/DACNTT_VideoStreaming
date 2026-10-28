/** Video documents. The workflow `status` function owns the processing fields. */
import type { ObjectId } from 'mongodb';
import type { Audience, ModerationStatus, Visibility, VideoStatus } from '@zelos/shared';

export interface UploadInfo {
  mode: 'post' | 'multipart';
  size: number;
  contentType: string;
  fileName: string;
  partSize: number | null;
  uploadId: string | null;
  startedAt: Date;
  completedAt: Date | null;
}

export interface Caption { lang: string; label: string; path: string }
export interface Chapter { startSec: number; title: string }

export interface VideoDoc {
  _id: ObjectId;
  owner: ObjectId;
  /** Owner's display name at the time of the last edit, for search. */
  channelName: string;
  title: string;
  description: string;
  tags: string[];
  category: string | null;
  status: VideoStatus;
  step: string;
  processingProgress: number;
  uploadVersion: number;
  visibility: Visibility;
  passwordHash: string | null;
  audience: Audience;
  publishAt: Date | null;
  scheduleName: string | null;
  upload: UploadInfo;
  hlsPath: string | null;
  renditions: unknown[];
  durationSec: number | null;
  thumbnail: string | null;
  customThumbnail: string | null;
  previewVtt: string | null;
  captions: Caption[];
  chapters: Chapter[];
  moderation: { status: ModerationStatus; source?: string; labels?: unknown[]; checkedAt?: Date; reasonCode?: string } ;
  hasViolence: boolean;
  counters: { views: number; likes: number; dislikes: number; comments: number };
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  processedAt: Date | null;
}

export const GIB = 1024 ** 3;
export const MIB = 1024 ** 2;
/** Above this a browser upload switches from one presigned POST to multipart (S3 single PUT/POST limit). */
export const POST_MAX_BYTES = 5 * GIB;
/** Nothing larger is accepted, whatever the configuration says. */
export const HARD_CAP_BYTES = 20 * GIB;
export const PART_SIZE = 32 * MIB;

/** Accepted containers, keyed by extension; a generic browser type falls back to the extension. */
export const VIDEO_TYPES: ReadonlyMap<string, string> = new Map([
  ['mp4', 'video/mp4'], ['m4v', 'video/x-m4v'], ['mov', 'video/quicktime'], ['mkv', 'video/x-matroska'],
  ['webm', 'video/webm'], ['avi', 'video/x-msvideo'], ['mpeg', 'video/mpeg'], ['mpg', 'video/mpeg'],
  ['3gp', 'video/3gpp'], ['flv', 'video/x-flv'], ['ts', 'video/mp2t'], ['wmv', 'video/x-ms-wmv'],
]);
const ACCEPTED_TYPES = new Set(VIDEO_TYPES.values());

/** Returns the content type to pin on the object, or null when the file is not an accepted video. */
export function videoContentType(fileName: string, declared: string): string | null {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]?.toLowerCase();
  const byExt = ext ? VIDEO_TYPES.get(ext) : undefined;
  if (!byExt) return null;
  const type = declared.toLowerCase().split(';')[0]?.trim() ?? '';
  if (type === '' || type === 'application/octet-stream') return byExt;
  return ACCEPTED_TYPES.has(type) ? type : null;
}

export const partCount = (size: number, partSize: number) => Math.ceil(size / partSize);
export const partSizeOf = (n: number, size: number, partSize: number) =>
  n < partCount(size, partSize) ? partSize : size - (n - 1) * partSize;
