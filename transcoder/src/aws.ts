/**
 * S3, EventBridge and Rekognition helpers of the container. Credentials come from the Batch
 * job role; nothing here can reach the database.
 */
import { createReadStream, createWriteStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  type PutObjectCommandInput,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { DetectModerationLabelsCommand, RekognitionClient } from '@aws-sdk/client-rekognition';
import { EVENT_SOURCE, type TranscodeProgress } from '@zelos/shared';

const s3 = new S3Client({});
const events = new EventBridgeClient({});
const rekognition = new RekognitionClient({ maxAttempts: 5, retryMode: 'adaptive' });

/**
 * HTTPS URL ffmpeg can read with range requests. A URL signed with the task role's temporary
 * credentials stops working when those credentials expire, whatever expiresIn says, so it is used
 * only by short reads (analyse seeks, chunk windows); long reads download the file instead.
 */
export function presignGet(bucket: string, key: string, expiresInSec = 3600): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSec });
}

/** Streams an object to a local file; the SDK refreshes credentials during long downloads. */
export async function downloadToFile(bucket: string, key: string, path: string): Promise<void> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await pipeline(out.Body as Readable, createWriteStream(path));
}

export async function getJson<T>(bucket: string, key: string): Promise<T> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  return JSON.parse(await out.Body!.transformToString()) as T;
}

export async function getBytes(bucket: string, key: string, range?: string): Promise<Uint8Array> {
  const out = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key, ...(range ? { Range: range } : {}) }));
  return out.Body!.transformToByteArray();
}

export async function putJson(bucket: string, key: string, value: unknown): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: JSON.stringify(value), ContentType: 'application/json' }));
}

export async function exists(bucket: string, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if ((err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return false;
    throw err;
  }
}

const CONTENT_TYPES: ReadonlyMap<string, { type: string; cache: string }> = new Map([
  ['.m3u8', { type: 'application/vnd.apple.mpegurl', cache: 'public, max-age=60' }],
  ['.ts', { type: 'video/mp2t', cache: 'public, max-age=31536000, immutable' }],
  ['.m4a', { type: 'audio/mp4', cache: 'private, max-age=0' }],
  ['.jpg', { type: 'image/jpeg', cache: 'public, max-age=86400' }],
  ['.vtt', { type: 'text/vtt', cache: 'public, max-age=86400' }],
]);

export async function putFile(bucket: string, key: string, path: string): Promise<void> {
  const ext = path.slice(path.lastIndexOf('.'));
  const meta = CONTENT_TYPES.get(ext);
  const input: PutObjectCommandInput = {
    Bucket: bucket,
    Key: key,
    Body: createReadStream(path),
    ContentLength: (await stat(path)).size,
    ...(meta ? { ContentType: meta.type, CacheControl: meta.cache } : {}),
  };
  await s3.send(new PutObjectCommand(input));
}

/** Uploads every file under `dir` matching `filter`, keeping relative paths, a few at a time. */
export async function putDirectory(bucket: string, prefix: string, dir: string, filter: (path: string) => boolean): Promise<number> {
  const files = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((e) => e.isFile())
    .map((e) => join(e.parentPath, e.name))
    .filter(filter);
  const queue = [...files];
  const worker = async (): Promise<void> => {
    for (let path = queue.shift(); path; path = queue.shift()) {
      const key = `${prefix}/${relative(dir, path).split('\\').join('/')}`;
      await putFile(bucket, key, path);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  return files.length;
}

/** Progress events, at most one per interval; the status function stores the latest. */
export function progressReporter(busName: string, base: Omit<TranscodeProgress, 'percent'>, minIntervalMs = 10_000) {
  let last = 0;
  return async (percent: number, force = false): Promise<void> => {
    const now = Date.now();
    if (!force && now - last < minIntervalMs) return;
    last = now;
    const detail: TranscodeProgress = { ...base, percent: Math.max(0, Math.min(100, Math.round(percent))) };
    try {
      await events.send(new PutEventsCommand({
        Entries: [{ EventBusName: busName, Source: EVENT_SOURCE, DetailType: 'TranscodeProgress', Detail: JSON.stringify(detail) }],
      }));
    } catch (err) {
      // Progress is informative; a failed event must never fail the encode.
      console.warn(JSON.stringify({ level: 'warn', msg: 'progress event failed', error: String(err) }));
    }
  };
}

export async function detectModerationLabels(image: Uint8Array, minConfidence: number) {
  const out = await rekognition.send(new DetectModerationLabelsCommand({ Image: { Bytes: image }, MinConfidence: minConfidence }));
  return { labels: out.ModerationLabels ?? [], contentTypes: out.ContentTypes ?? [] };
}
