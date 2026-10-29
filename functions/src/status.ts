/**
 * The only writer of processing state (ADR-02). Called by the workflow (start, publish, fail)
 * and by EventBridge (progress events from the containers). Every write is guarded by the upload
 * version, so a late event of an older run never touches a newer one.
 */
import { randomBytes } from 'node:crypto';
import {
  EVENT_SOURCE,
  TranscodeProgress,
  applyProgress,
  emptyProgress,
  keyObject,
  overallPercent,
  workPaths,
  type AnalyseResult,
  type PackageResult,
  type ProgressState,
} from '@zelos/shared';
import { z } from 'zod';

const objectId = z.string().regex(/^[a-f0-9]{24}$/);
const Ref = z.object({ videoId: objectId, uploadVersion: z.number().int().positive() });

const StartInput = Ref.extend({ action: z.literal('start'), chunkCount: z.number().int().nonnegative().optional() });
const PublishInput = Ref.extend({ action: z.literal('publish') });
const FailInput = Ref.extend({
  action: z.literal('fail'),
  // Step Functions Catch output: { Error, Cause }.
  error: z.object({ Error: z.string().optional(), Cause: z.string().optional() }).passthrough(),
});
/** Sent by the one-time EventBridge Scheduler schedule of a scheduled video (§4.4). */
const ReleaseInput = Ref.extend({ action: z.literal('release') });
const WorkflowAction = z.discriminatedUnion('action', [StartInput, PublishInput, FailInput, ReleaseInput]);

/** Fields of a video document this function reads or writes. */
export interface VideoDoc {
  _id: string;
  owner: string;
  status: string;
  uploadVersion: number;
  publishAt?: Date | null;
  progress?: ProgressState;
  visibility?: string;
  moderationStatus?: string;
}

/** Narrow persistence interface, so the handler can be tested without a database. */
export interface VideoStore {
  /** Moves an UPLOADING/ERROR/PROCESSING video of this version to PROCESSING; null when it is gone or newer. */
  startProcessing(videoId: string, uploadVersion: number, progress: ProgressState, keyRef: string): Promise<VideoDoc | null>;
  /** Applies a progress event atomically and returns the document after the change. */
  recordProgress(videoId: string, uploadVersion: number, event: TranscodeProgress): Promise<VideoDoc | null>;
  setOverallProgress(videoId: string, uploadVersion: number, percent: number): Promise<void>;
  /** Sets the published fields if the video is still PROCESSING; returns whether it changed. */
  publish(videoId: string, uploadVersion: number, fields: Record<string, unknown>): Promise<VideoDoc | null>;
  fail(videoId: string, uploadVersion: number, reason: string): Promise<VideoDoc | null>;
  /** SCHEDULED -> READY once publishAt has passed; null when there is nothing to release. */
  release(videoId: string, uploadVersion: number, now: Date): Promise<VideoDoc | null>;
}

export interface StatusDeps {
  videos: VideoStore;
  /** Writes the key object only if absent; returns false when it already existed. */
  putKeyIfAbsent: (key: string, body: string) => Promise<boolean>;
  readWork: <T>(key: string) => Promise<T | null>;
  emitPublished: (detail: { videoId: string; ownerId: string; publishedAt: string }) => Promise<void>;
  alert: (subject: string, message: string) => Promise<void>;
  now: () => Date;
  log: (entry: Record<string, unknown>) => void;
}

export type StatusResult =
  | { found: false }
  | { found: true; status?: string; published?: boolean };

async function start(input: z.infer<typeof StartInput>, deps: StatusDeps): Promise<StatusResult> {
  const keyRef = keyObject(input.videoId, input.uploadVersion);
  // A retried start keeps the key it created the first time.
  const material = { keyHex: randomBytes(16).toString('hex'), ivHex: randomBytes(16).toString('hex') };
  await deps.putKeyIfAbsent(keyRef, JSON.stringify(material));
  const doc = await deps.videos.startProcessing(input.videoId, input.uploadVersion, emptyProgress(input.chunkCount ?? 0), keyRef);
  if (!doc) {
    deps.log({ level: 'warn', msg: 'video deleted or superseded before processing', videoId: input.videoId });
    return { found: false };
  }
  return { found: true, status: doc.status };
}

async function publish(input: z.infer<typeof PublishInput>, deps: StatusDeps): Promise<StatusResult> {
  const work = workPaths(input.videoId, input.uploadVersion);
  const [encoded, analysed] = await Promise.all([
    deps.readWork<PackageResult>(work.encodeResult),
    deps.readWork<AnalyseResult>(work.analyseResult),
  ]);
  if (!encoded) throw new Error('no package result to publish');

  const moderation = analysed?.moderation ?? null;
  const fields = {
    hlsPath: encoded.master,
    renditions: encoded.rungs,
    durationSec: encoded.durationSec,
    thumbnail: analysed?.thumbnail ?? null,
    previewVtt: analysed?.previewVtt ?? null,
    moderation: moderation
      ? { status: moderation.status, source: 'auto', labels: moderation.labels, framesAnalyzed: moderation.framesAnalyzed, framesPlanned: moderation.framesPlanned, error: moderation.error, checkedAt: deps.now() }
      : { status: 'approved', source: 'disabled', checkedAt: deps.now() },
    hasViolence: moderation?.hasViolence ?? false,
    processingProgress: 100,
    step: 'publish',
  };
  const doc = await deps.videos.publish(input.videoId, input.uploadVersion, fields);
  if (!doc) {
    deps.log({ level: 'info', msg: 'already published or no longer processing', videoId: input.videoId });
    return { found: true, published: false };
  }
  // Notify subscribers only for a public release that just happened (not for a scheduled one).
  if (doc.status === 'READY' && fields.moderation.status === 'approved') {
    await deps.emitPublished({ videoId: input.videoId, ownerId: String(doc.owner), publishedAt: deps.now().toISOString() });
  }
  return { found: true, status: doc.status, published: true };
}

async function fail(input: z.infer<typeof FailInput>, deps: StatusDeps): Promise<StatusResult> {
  const reason = [input.error.Error, input.error.Cause].filter(Boolean).join(': ').slice(0, 1000) || 'unknown error';
  const doc = await deps.videos.fail(input.videoId, input.uploadVersion, reason);
  await deps.alert(`Transcode failed: ${input.videoId}`, `Video ${input.videoId} v${input.uploadVersion}\n${reason}`);
  return doc ? { found: true, status: 'ERROR' } : { found: false };
}

async function release(input: z.infer<typeof ReleaseInput>, deps: StatusDeps): Promise<StatusResult> {
  // A schedule that fires before processing ends finds no SCHEDULED video and does nothing;
  // Publish sets READY itself once publishAt has passed.
  const doc = await deps.videos.release(input.videoId, input.uploadVersion, deps.now());
  if (!doc) {
    deps.log({ level: 'info', msg: 'nothing to release', videoId: input.videoId });
    return { found: false };
  }
  if (doc.visibility === 'public' && doc.moderationStatus === 'approved') {
    await deps.emitPublished({ videoId: input.videoId, ownerId: String(doc.owner), publishedAt: deps.now().toISOString() });
  }
  return { found: true, status: doc.status, published: true };
}

async function progress(detail: unknown, deps: StatusDeps): Promise<StatusResult> {
  const event = TranscodeProgress.parse(detail);
  const doc = await deps.videos.recordProgress(event.videoId, event.uploadVersion, event);
  if (!doc?.progress) return { found: false };
  await deps.videos.setOverallProgress(event.videoId, event.uploadVersion, overallPercent(applyProgress(doc.progress, event)));
  return { found: true };
}

export async function handle(event: unknown, deps: StatusDeps): Promise<StatusResult> {
  const e = event as { source?: string; 'detail-type'?: string; detail?: unknown };
  if (e.source === EVENT_SOURCE && e['detail-type'] === 'TranscodeProgress') return progress(e.detail, deps);

  const action = WorkflowAction.parse(event);
  if (action.action === 'start') return start(action, deps);
  if (action.action === 'publish') return publish(action, deps);
  if (action.action === 'release') return release(action, deps);
  return fail(action, deps);
}

// ── Runtime wiring ────────────────────────────────────────────────────

let runtime: StatusDeps | undefined;

async function createRuntime(): Promise<StatusDeps> {
  const [{ S3Client, PutObjectCommand, GetObjectCommand }, { EventBridgeClient, PutEventsCommand }, { SNSClient, PublishCommand }, { SecretsManagerClient, GetSecretValueCommand }, { videosCollection, mongoVideoStore }, { required }] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/client-eventbridge'),
    import('@aws-sdk/client-sns'),
    import('@aws-sdk/client-secrets-manager'),
    import('./lib/videoStore.js'),
    import('./lib/s3.js'),
  ]);
  const s3 = new S3Client({});
  const events = new EventBridgeClient({});
  const sns = new SNSClient({});
  const keysBucket = required('KEYS_BUCKET');
  const workBucket = required('WORK_BUCKET');
  const busName = required('EVENT_BUS_NAME');
  const topicArn = required('ALERT_TOPIC_ARN');
  const secret = await new SecretsManagerClient({}).send(new GetSecretValueCommand({ SecretId: required('MONGODB_SECRET_ARN') }));
  const videos = mongoVideoStore(await videosCollection(secret.SecretString ?? '', required('DB_NAME')));

  return {
    videos,
    async putKeyIfAbsent(key, body) {
      try {
        await s3.send(new PutObjectCommand({ Bucket: keysBucket, Key: key, Body: body, ContentType: 'application/json', IfNoneMatch: '*' }));
        return true;
      } catch (err) {
        if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412) return false;
        throw err;
      }
    },
    async readWork<T>(key: string): Promise<T | null> {
      try {
        const out = await s3.send(new GetObjectCommand({ Bucket: workBucket, Key: key }));
        return JSON.parse(await out.Body!.transformToString()) as T;
      } catch (err) {
        if ((err as { name?: string }).name === 'NoSuchKey') return null;
        throw err;
      }
    },
    async emitPublished(detail) {
      await events.send(new PutEventsCommand({ Entries: [{ EventBusName: busName, Source: EVENT_SOURCE, DetailType: 'VideoPublished', Detail: JSON.stringify(detail) }] }));
    },
    async alert(subject, message) {
      await sns.send(new PublishCommand({ TopicArn: topicArn, Subject: subject.slice(0, 100), Message: message }));
    },
    now: () => new Date(),
    log: (entry) => console.log(JSON.stringify(entry)),
  };
}

export const handler = async (event: unknown): Promise<StatusResult> => {
  runtime ??= await createRuntime();
  return handle(event, runtime);
};
