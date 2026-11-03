/**
 * Direct-to-S3 uploads (§4.1). The API creates the draft and pins key, size, type and metadata in
 * the upload grant; S3's ObjectCreated event starts processing, so a presigned POST needs no
 * confirm call. Multipart uploads (> 5 GiB) are completed by the API from S3's own part list.
 */
import { ObjectId, type Collection } from 'mongodb';
import { z } from 'zod';
import type { Request } from 'express';
import { VISIBILITIES } from '@zelos/shared';
import type { Feature } from '../app.js';
import { badRequest, conflict, forbidden, HttpError, notFound } from '../http/errors.js';
import { rateLimit, requireUser } from '../http/middleware.js';
import type { UserDoc } from '../model/user.js';
import {
  PART_SIZE, POST_MAX_BYTES, partCount, partSizeOf, videoContentType, type VideoDoc,
} from '../model/video.js';

/** Upload grants expire after 15 minutes; the browser asks again for later parts. */
export const GRANT_TTL_SEC = 15 * 60;
const MAX_PARTS_PER_CALL = 100;

const createBody = z.object({
  fileName: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  contentType: z.string().max(100).default(''),
  title: z.string().trim().min(1).max(100).optional(),
  description: z.string().max(5000).default(''),
  visibility: z.enum(VISIBILITIES).exclude(['password']).default('public'),
});
const partsBody = z.object({
  partNumbers: z.array(z.number().int().positive()).min(1).max(MAX_PARTS_PER_CALL),
});

export const rawKey = (videoId: string, uploadVersion: number) => `raw/${videoId}/${uploadVersion}/source`;
const titleFrom = (fileName: string) => fileName.replace(/\.[^.]+$/, '').trim().slice(0, 100) || 'Untitled video';

export const uploadsFeature: Feature = (r, deps) => {
  const { config, storage, now } = deps;
  const videos = deps.db.collection<VideoDoc>('videos');
  const users = deps.db.collection<UserDoc>('users');
  const bucket = config.buckets.raw;

  r.post('/uploads', requireUser, rateLimit(deps.kv, config.tables.rateLimits, { scope: 'upload', limit: 20, windowSec: 3600 }, now), async (req, res) => {
    const body = createBody.parse(req.body);
    const owner = await users.findOne({ _id: new ObjectId(req.user?.id) }, { projection: { emailVerified: 1, displayName: 1 } });
    if (!owner) throw notFound('Account');
    if (!owner.emailVerified) throw forbidden('EMAIL_NOT_VERIFIED', 'Confirm your e-mail address before uploading');
    if (body.size > config.uploadMaxBytes) {
      throw badRequest('FILE_TOO_LARGE', `Files up to ${Math.floor(config.uploadMaxBytes / 1024 ** 3)} GiB are accepted`, { maxBytes: config.uploadMaxBytes });
    }
    const contentType = videoContentType(body.fileName, body.contentType);
    if (!contentType) throw badRequest('UNSUPPORTED_TYPE', 'This file type is not a supported video');

    const at = now();
    const _id = new ObjectId();
    const videoId = _id.toHexString();
    const uploadVersion = 1;
    const metadata = { 'video-id': videoId, 'upload-version': String(uploadVersion), 'owner-id': owner._id.toHexString() };
    const key = rawKey(videoId, uploadVersion);
    const multipart = body.size > POST_MAX_BYTES;
    const uploadId = multipart ? await storage.createMultipart(bucket, key, { contentType, metadata }) : null;

    const doc: VideoDoc = {
      _id, owner: owner._id, channelName: owner.displayName,
      title: body.title ?? titleFrom(body.fileName), description: body.description, tags: [], category: null,
      status: 'UPLOADING', step: 'queued', processingProgress: 0, uploadVersion,
      visibility: body.visibility, passwordHash: null, audience: 'public', publishAt: null, scheduleName: null,
      upload: { mode: multipart ? 'multipart' : 'post', size: body.size, contentType, fileName: body.fileName, partSize: multipart ? PART_SIZE : null, uploadId, startedAt: at, completedAt: null },
      hlsPath: null, renditions: [], durationSec: null, thumbnail: null, customThumbnail: null, previewVtt: null,
      captions: [], chapters: [], moderation: { status: 'pending' }, hasViolence: false,
      counters: { views: 0, likes: 0, dislikes: 0, comments: 0 }, error: null,
      createdAt: at, updatedAt: at, processedAt: null,
    };
    try {
      await videos.insertOne(doc);
    } catch (err) {
      if (uploadId) await storage.abortMultipart(bucket, key, uploadId).catch(() => undefined);
      throw err;
    }

    const video = { id: videoId, uploadVersion, status: doc.status };
    if (!multipart) {
      const post = await storage.presignPost(bucket, key, { size: body.size, contentType, metadata, expiresSec: GRANT_TTL_SEC });
      return void res.status(201).json({ video, upload: { mode: 'post', url: post.url, fields: post.fields, expiresInSec: GRANT_TTL_SEC } });
    }
    res.status(201).json({ video, upload: { mode: 'multipart', partSize: PART_SIZE, partCount: partCount(body.size, PART_SIZE), expiresInSec: GRANT_TTL_SEC } });
  });

  r.post('/uploads/:id/parts', requireUser, async (req, res) => {
    const { partNumbers } = partsBody.parse(req.body);
    const v = await ownDraft(videos, req);
    const { size, partSize, uploadId } = v.upload;
    if (v.upload.mode !== 'multipart' || !partSize || !uploadId) throw conflict('NOT_MULTIPART', 'This upload uses a single POST');
    const count = partCount(size, partSize);
    const bad = partNumbers.filter((n) => n > count);
    if (bad.length) throw badRequest('INVALID_PARTS', `Parts run from 1 to ${count}`, { invalid: bad.slice(0, 20) });
    const key = rawKey(v._id.toHexString(), v.uploadVersion);
    const parts = await Promise.all([...new Set(partNumbers)].map(async (n) => {
      const partBytes = partSizeOf(n, size, partSize);
      return { partNumber: n, size: partBytes, url: await storage.presignPart(bucket, key, uploadId, n, partBytes, GRANT_TTL_SEC) };
    }));
    res.json({ parts, expiresInSec: GRANT_TTL_SEC });
  });

  r.post('/uploads/:id/complete', requireUser, async (req, res) => {
    const v = await ownVideo(videos, req);
    // Already past the upload: answer with the current state.
    if (v.status !== 'UPLOADING' || v.upload.completedAt) return void res.json({ video: { id: v._id.toHexString(), status: v.status } });
    const key = rawKey(v._id.toHexString(), v.uploadVersion);
    const { size, partSize, uploadId } = v.upload;

    const present = async () => (await storage.head(bucket, key))?.size === size;
    if (v.upload.mode === 'post' || !partSize || !uploadId) {
      if (!(await present())) throw conflict('UPLOAD_INCOMPLETE', 'The file has not reached storage yet');
    } else {
      const listed = await storage.listParts(bucket, key, uploadId);
      if (listed === null) {
        // The upload id is gone: either an earlier call completed it before the database write,
        // or it was aborted.
        if (!(await present())) throw conflict('UPLOAD_EXPIRED', 'This upload expired; start a new one');
      } else {
        const count = partCount(size, partSize);
        const wrong = listed.filter((p) => p.partNumber > count || p.size !== partSizeOf(p.partNumber, size, partSize));
        if (wrong.length) throw badRequest('INVALID_PARTS', 'Some parts have the wrong size or number', { invalid: wrong.slice(0, 20).map((p) => p.partNumber) });
        const have = new Set(listed.map((p) => p.partNumber));
        const missing = Array.from({ length: count }, (_, i) => i + 1).filter((n) => !have.has(n));
        if (missing.length) throw new HttpError(409, 'UPLOAD_INCOMPLETE', 'Some parts are missing', { missing: missing.slice(0, 20), missingCount: missing.length });
        try {
          await storage.completeMultipart(bucket, key, uploadId, listed);
        } catch (err) {
          if (!(await present())) throw err;
        }
      }
    }
    const done = await videos.findOneAndUpdate(
      { _id: v._id, uploadVersion: v.uploadVersion },
      { $set: { 'upload.completedAt': now(), updatedAt: now() } },
      { returnDocument: 'after' },
    );
    res.json({ video: { id: v._id.toHexString(), status: done?.status ?? v.status } });
  });

  r.post('/uploads/:id/abort', requireUser, async (req, res) => {
    const v = await ownDraft(videos, req);
    await abortDraft(deps, v);
    res.status(204).end();
  });
};

/** Aborts the multipart upload (best effort), removes the raw object and the draft. */
export async function abortDraft(deps: Parameters<Feature>[1], v: VideoDoc): Promise<void> {
  const bucket = deps.config.buckets.raw;
  const key = rawKey(v._id.toHexString(), v.uploadVersion);
  if (v.upload.uploadId) {
    await deps.storage.abortMultipart(bucket, key, v.upload.uploadId).catch((err: unknown) =>
      // The 1-day lifecycle rule removes it anyway.
      deps.log({ level: 'warn', msg: 'abort multipart failed', videoId: v._id.toHexString(), error: String(err) }));
  }
  await deps.storage.deletePrefix(bucket, `raw/${v._id.toHexString()}/`);
  await deps.db.collection<VideoDoc>('videos').deleteOne({ _id: v._id, status: 'UPLOADING' });
}

async function ownVideo(videos: Collection<VideoDoc>, req: Request): Promise<VideoDoc> {
  const id = String(req.params['id'] ?? '');
  const v = ObjectId.isValid(id) && id.length === 24 ? await videos.findOne({ _id: new ObjectId(id) }) : null;
  // Someone else's draft looks the same as a missing one.
  if (!v || v.owner.toHexString() !== req.user?.id) throw notFound('Upload');
  return v;
}

async function ownDraft(videos: Collection<VideoDoc>, req: Request): Promise<VideoDoc> {
  const v = await ownVideo(videos, req);
  if (v.status !== 'UPLOADING') throw conflict('UPLOAD_FINISHED', 'This upload has already finished');
  return v;
}
