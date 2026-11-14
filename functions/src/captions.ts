/**
 * Automatic captions with Amazon Transcribe. Two events reach this function:
 *   - VideoPublished (our bus): check the owner's plan and monthly minutes, reserve them, start a
 *     transcription job on the raw upload and ask Transcribe to write a WebVTT file to the work bucket;
 *   - Transcribe Job State Change (default bus): on COMPLETED copy the file next to the video as a
 *     side-loaded caption track; on FAILED give the reserved minutes back.
 * A video without an audio track, or longer than the plan allows, is skipped and costs nothing.
 * The job name is derived from the video and upload version, so a redelivered event starts nothing.
 */
import { entitlements, processedPaths, rawObjectKey, VideoPublished, workPaths, type PlanSubject } from '@zelos/shared';

/** Transcribe bills per second with a 15-second minimum, and refuses sources over 2 GB. */
export const MIN_BILLED_SECONDS = 15;
export const MAX_SOURCE_BYTES = 2 * 1024 ** 3;

// "Tieng Viet" with its diacritics, built from code points to keep this file ASCII.
const VI_NAME = String.fromCodePoint(0x54, 0x69, 0x1ebf, 0x6e, 0x67, 0x20, 0x56, 0x69, 0x1ec7, 0x74);

/** Languages the recognizer picks from. Labels are each language's own name (escaped to keep the source ASCII). */
export const LANGUAGES = [
  { code: 'vi-VN', lang: 'vi', label: VI_NAME },
  { code: 'en-US', lang: 'en', label: 'English' },
] as const;

export interface CaptionVideo {
  owner: string;
  uploadVersion: number;
  durationSec: number | null;
  /** Language tags of the tracks the video already has, and whether each was made automatically. */
  captions: { lang: string; auto: boolean }[];
}

export interface JobInfo {
  status: string;
  languageCode: string | null;
  failureReason: string | null;
}

export interface CaptionsDeps {
  /** Prefix of every job this environment starts, e.g. `zelos-staging`. */
  jobPrefix: string;
  buckets: { raw: string; work: string; processed: string };
  video(videoId: string): Promise<CaptionVideo | null>;
  hasAudio(videoId: string, uploadVersion: number): Promise<boolean>;
  user(ownerId: string): Promise<PlanSubject | null>;
  /** Source size in bytes, or null when the object is gone. */
  sourceSize(key: string): Promise<number | null>;
  /** Adds seconds to the owner's month unless the limit would be exceeded; false when over. Atomic. */
  reserve(ownerId: string, month: string, seconds: number, limitSeconds: number): Promise<boolean>;
  release(ownerId: string, month: string, seconds: number): Promise<void>;
  /** The job, or null when no job has this name. */
  job(name: string): Promise<JobInfo | null>;
  startJob(input: { name: string; mediaUri: string; outputBucket: string; outputKey: string }): Promise<void>;
  readText(bucket: string, key: string): Promise<string>;
  putCaption(bucket: string, key: string, vtt: string): Promise<void>;
  /** Adds the track unless the owner already has a track of that language; returns whether it was added. */
  addCaption(videoId: string, uploadVersion: number, caption: { lang: string; label: string; path: string }): Promise<boolean>;
  now: () => Date;
  log: (entry: Record<string, unknown>) => void;
}

export type CaptionsResult =
  | { action: 'started'; seconds: number }
  | { action: 'added'; lang: string }
  | { action: 'skipped'; reason: string };

const skip = (reason: string): CaptionsResult => ({ action: 'skipped', reason });
const month = (d: Date): string => d.toISOString().slice(0, 7);

export const jobName = (prefix: string, videoId: string, uploadVersion: number): string => `${prefix}-${videoId}-${uploadVersion}`;

/** Splits `<prefix>-<videoId>-<version>`; null for a job that is not ours. */
export function parseJobName(prefix: string, name: string): { videoId: string; uploadVersion: number } | null {
  if (!name.startsWith(`${prefix}-`)) return null;
  const m = /^([a-f0-9]{24})-(\d+)$/.exec(name.slice(prefix.length + 1));
  return m ? { videoId: m[1] ?? '', uploadVersion: Number(m[2]) } : null;
}

export const billedSeconds = (durationSec: number): number => Math.max(MIN_BILLED_SECONDS, Math.ceil(durationSec));

async function start(event: unknown, deps: CaptionsDeps): Promise<CaptionsResult> {
  const detail = VideoPublished.parse((event as { detail?: unknown }).detail);
  const video = await deps.video(detail.videoId);
  if (!video) return skip('video gone');
  const { uploadVersion } = video;
  if (video.captions.some((c) => !c.auto)) return skip('owner already has captions');
  if (!video.durationSec || video.durationSec <= 0) return skip('no duration');

  const user = await deps.user(video.owner);
  const plan = entitlements(user ?? { createdAt: deps.now() }, deps.now());
  if (plan.autoCaptionMinutes <= 0) return skip('plan has no automatic captions');
  if (video.durationSec > plan.autoCaptionMaxVideoMinutes * 60) return skip('video longer than the plan allows');

  const name = jobName(deps.jobPrefix, detail.videoId, uploadVersion);
  if (await deps.job(name)) return skip('job already exists');
  if (!(await deps.hasAudio(detail.videoId, uploadVersion))) return skip('no audio track');
  const key = rawObjectKey(detail.videoId, uploadVersion);
  const size = await deps.sourceSize(key);
  if (size === null) return skip('source is gone');
  if (size > MAX_SOURCE_BYTES) return skip('source larger than 2 GB');

  const seconds = billedSeconds(video.durationSec);
  const m = month(deps.now());
  const limit = plan.autoCaptionMinutes * 60;
  if (seconds > limit || !(await deps.reserve(video.owner, m, seconds, limit))) return skip('monthly minutes used up');
  try {
    await deps.startJob({ name, mediaUri: `s3://${deps.buckets.raw}/${key}`, outputBucket: deps.buckets.work, outputKey: workPaths(detail.videoId, uploadVersion).captionsPrefix });
  } catch (err) {
    await deps.release(video.owner, m, seconds);
    // Another delivery won the race to create the same job: nothing to do.
    if (err instanceof Error && err.name === 'ConflictException') return skip('job already exists');
    throw err;
  }
  deps.log({ level: 'info', msg: 'captions job started', videoId: detail.videoId, seconds });
  return { action: 'started', seconds };
}

async function finish(event: unknown, deps: CaptionsDeps): Promise<CaptionsResult> {
  const detail = (event as { detail?: { TranscriptionJobName?: string; TranscriptionJobStatus?: string } }).detail ?? {};
  const name = detail.TranscriptionJobName ?? '';
  const ref = parseJobName(deps.jobPrefix, name);
  if (!ref) return skip('not our job');
  const video = await deps.video(ref.videoId);
  const info = await deps.job(name);
  if (!info) return skip('job unknown');

  if (info.status === 'FAILED') {
    // The reservation is given back: a failed job is not the owner's doing and Transcribe does not bill it.
    if (video?.durationSec) await deps.release(video.owner, month(deps.now()), billedSeconds(video.durationSec));
    deps.log({ level: 'warn', msg: 'captions job failed', videoId: ref.videoId, reason: info.failureReason });
    return skip('job failed');
  }
  if (info.status !== 'COMPLETED') return skip(`job ${info.status.toLowerCase()}`);
  if (!video || video.uploadVersion !== ref.uploadVersion) return skip('video gone or replaced');

  const language = LANGUAGES.find((l) => l.code === info.languageCode);
  if (!language) return skip('language not offered');
  if (video.captions.some((c) => c.lang === language.lang)) return skip('owner already has this language');

  const vtt = await deps.readText(deps.buckets.work, workPaths(ref.videoId, ref.uploadVersion).captionVtt(name));
  if (!vtt.trimStart().startsWith('WEBVTT')) return skip('output is not WebVTT');
  const path = processedPaths(ref.videoId, ref.uploadVersion).caption(language.lang);
  await deps.putCaption(deps.buckets.processed, path, vtt);
  const added = await deps.addCaption(ref.videoId, ref.uploadVersion, { lang: language.lang, label: language.label, path });
  deps.log({ level: 'info', msg: 'automatic caption added', videoId: ref.videoId, lang: language.lang, added });
  return added ? { action: 'added', lang: language.lang } : skip('owner added captions meanwhile');
}

export async function handleCaptions(event: unknown, deps: CaptionsDeps): Promise<CaptionsResult> {
  const source = (event as { source?: string }).source;
  return source === 'aws.transcribe' ? finish(event, deps) : start(event, deps);
}

// ── Runtime wiring ────────────────────────────────────────────────────

let runtime: CaptionsDeps | undefined;

async function createRuntime(): Promise<CaptionsDeps> {
  const [{ SecretsManagerClient, GetSecretValueCommand }, { MongoClient, ObjectId }, s3, tr, { required }] = await Promise.all([
    import('@aws-sdk/client-secrets-manager'),
    import('mongodb'),
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/client-transcribe'),
    import('./lib/s3.js'),
  ]);
  const secret = JSON.parse((await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: required('API_SECRET_ARN') }))).SecretString ?? '{}') as { mongodbUri: string };
  const db = new MongoClient(secret.mongodbUri, { maxPoolSize: 2, maxIdleTimeMS: 60_000 }).db(required('DB_NAME'));
  const s3c = new s3.S3Client({});
  const transcribe = new tr.TranscribeClient({});
  const buckets = { raw: required('RAW_BUCKET'), work: required('WORK_BUCKET'), processed: required('PROCESSED_BUCKET') };

  return {
    jobPrefix: `zelos-${required('APP_ENV')}`,
    buckets,
    async video(videoId) {
      const v = await db.collection('videos').findOne({ _id: new ObjectId(videoId) }, { projection: { owner: 1, uploadVersion: 1, durationSec: 1, captions: 1 } });
      if (!v) return null;
      const captions = (v['captions'] as { lang: string; auto?: boolean }[] | undefined) ?? [];
      return { owner: String(v['owner']), uploadVersion: Number(v['uploadVersion']), durationSec: typeof v['durationSec'] === 'number' ? v['durationSec'] : null, captions: captions.map((c) => ({ lang: c.lang, auto: c.auto === true })) };
    },
    async hasAudio(videoId, uploadVersion) {
      try {
        const out = await s3c.send(new s3.GetObjectCommand({ Bucket: buckets.work, Key: workPaths(videoId, uploadVersion).plan }));
        return (JSON.parse(await out.Body!.transformToString()) as { hasAudio?: boolean }).hasAudio === true;
      } catch (err) {
        // The work files expire after a week. A video published later (scheduled) gets no automatic captions.
        if (err instanceof Error && err.name === 'NoSuchKey') return false;
        throw err;
      }
    },
    async user(ownerId) {
      const u = await db.collection('users').findOne({ _id: new ObjectId(ownerId) }, { projection: { createdAt: 1, billing: 1 } });
      return u ? { createdAt: u['createdAt'] as Date, billing: (u['billing'] as PlanSubject['billing']) ?? null } : null;
    },
    async sourceSize(key) {
      try {
        return Number((await s3c.send(new s3.HeadObjectCommand({ Bucket: buckets.raw, Key: key }))).ContentLength ?? 0);
      } catch (err) {
        if (err instanceof Error && (err.name === 'NotFound' || err.name === 'NoSuchKey')) return null;
        throw err;
      }
    },
    async reserve(ownerId, m, seconds, limitSeconds) {
      const _id = `${ownerId}:${m}`;
      try {
        // When the month's document exists and is too full the filter misses and the upsert hits the
        // same _id, which MongoDB reports as a duplicate key: that is "over the limit".
        await db.collection<{ _id: string }>('captionUsage').updateOne(
          { _id, seconds: { $lte: limitSeconds - seconds } } as never,
          { $inc: { seconds }, $setOnInsert: { owner: ownerId, month: m } } as never,
          { upsert: true },
        );
        return true;
      } catch (err) {
        if ((err as { code?: number }).code === 11000) return false;
        throw err;
      }
    },
    async release(ownerId, m, seconds) {
      await db.collection<{ _id: string }>('captionUsage').updateOne({ _id: `${ownerId}:${m}` }, { $inc: { seconds: -seconds } } as never);
    },
    async job(name) {
      try {
        const out = (await transcribe.send(new tr.GetTranscriptionJobCommand({ TranscriptionJobName: name }))).TranscriptionJob;
        return out ? { status: String(out.TranscriptionJobStatus), languageCode: out.LanguageCode ?? null, failureReason: out.FailureReason ?? null } : null;
      } catch (err) {
        if (err instanceof Error && err.name === 'BadRequestException') return null; // "job does not exist"
        throw err;
      }
    },
    async startJob({ name, mediaUri, outputBucket, outputKey }) {
      await transcribe.send(new tr.StartTranscriptionJobCommand({
        TranscriptionJobName: name,
        Media: { MediaFileUri: mediaUri },
        IdentifyLanguage: true,
        LanguageOptions: LANGUAGES.map((l) => l.code),
        OutputBucketName: outputBucket,
        OutputKey: outputKey,
        Subtitles: { Formats: ['vtt'] },
      }));
    },
    async readText(bucket, key) {
      return (await s3c.send(new s3.GetObjectCommand({ Bucket: bucket, Key: key }))).Body!.transformToString();
    },
    async putCaption(bucket, key, vtt) {
      await s3c.send(new s3.PutObjectCommand({ Bucket: bucket, Key: key, Body: vtt, ContentType: 'text/vtt; charset=utf-8' }));
    },
    async addCaption(videoId, uploadVersion, caption) {
      const res = await db.collection('videos').updateOne(
        { _id: new ObjectId(videoId), uploadVersion, 'captions.lang': { $ne: caption.lang } },
        { $push: { captions: { ...caption, auto: true } } as never, $set: { updatedAt: new Date() } },
      );
      return res.modifiedCount === 1;
    },
    now: () => new Date(),
    log: (entry) => console.log(JSON.stringify(entry)),
  };
}

export const handler = async (event: unknown): Promise<CaptionsResult> => {
  runtime ??= await createRuntime();
  return handleCaptions(event, runtime);
};
