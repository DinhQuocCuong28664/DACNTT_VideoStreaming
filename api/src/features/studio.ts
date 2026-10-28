/**
 * Creator studio: the owner's video list, WebVTT captions, chapters, custom thumbnails,
 * scheduled publishing and analytics. Avatar and banner share the image upload flow.
 */
import { randomBytes } from 'node:crypto';
import express from 'express';
import { ObjectId, type Collection } from 'mongodb';
import { z } from 'zod';
import type { Request } from 'express';
import { processedPaths } from '@zelos/shared';
import type { Deps, Feature } from '../app.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { rateLimit, requireUser } from '../http/middleware.js';
import { IMAGE_MAX_BYTES, IMAGE_TYPES, imageUploadKey, sniffImage } from '../services/images.js';
import { selfView, type UserDoc } from '../model/user.js';
import type { Chapter, VideoDoc } from '../model/video.js';
import { decodeCursor, encodeCursor, videoViews } from './videos.js';
import { GRANT_TTL_SEC } from './uploads.js';

export const CAPTION_MAX_BYTES = 512 * 1024;
export const MAX_CAPTIONS = 20;
/** YouTube's chapter rules: at least three, the first at 0:00, each at least 10 seconds long. */
export const CHAPTER_RULES = { min: 3, minLengthSec: 10, max: 100 };
/** Schedules lie between five minutes and one year ahead. */
export const SCHEDULE_WINDOW = { minSec: 5 * 60, maxSec: 365 * 86_400 };

/** Language tags such as vi, en or pt-BR. */
export function validLang(tag: string): boolean {
  const [lang = '', region, extra] = tag.split('-');
  return extra === undefined && /^[a-z]{2,3}$/.test(lang) && (region === undefined || /^[A-Z]{2}$/.test(region));
}

/** Seconds of a WebVTT timestamp (hh:mm:ss.ttt or mm:ss.ttt), or null when it does not parse. */
export function vttSeconds(stamp: string): number | null {
  const parts = stamp.split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const [secPart = '', ...rest] = parts.reverse();
  const [mm = '', hh = '0'] = rest;
  if (!/^[0-5]\d\.\d{3}$/.test(secPart) || !/^[0-5]\d$/.test(mm) || !/^\d{1,3}$/.test(hh)) return null;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(secPart);
}

/** Checks the WebVTT structure: the header, then cues whose timings parse and do not run backwards. */
export function validateVtt(text: string): string | null {
  // A leading byte order mark (U+FEFF) is allowed.
  const body = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).replace(/\r\n?/g, '\n');
  const header = body.split('\n', 1)[0] ?? '';
  if (header !== 'WEBVTT' && !header.startsWith('WEBVTT ') && !header.startsWith('WEBVTT\t')) return 'The file must start with WEBVTT';
  let cues = 0;
  for (const line of body.split('\n')) {
    if (!line.includes('-->')) continue;
    const [left = '', right = ''] = line.split('-->');
    const start = vttSeconds(left.trim());
    const end = vttSeconds(right.trim().split(/\s/, 1)[0] ?? '');
    if (start === null || end === null) return `Bad cue timing: ${line.slice(0, 60)}`;
    if (end < start) return `A cue ends before it starts: ${line.slice(0, 60)}`;
    cues += 1;
  }
  return cues > 0 ? null : 'The file has no cues';
}

export function validateChapters(chapters: Chapter[], durationSec: number | null): string | null {
  if (chapters.length === 0) return null;
  if (chapters.length < CHAPTER_RULES.min) return `Use at least ${CHAPTER_RULES.min} chapters`;
  if (chapters[0]?.startSec !== 0) return 'The first chapter starts at 0:00';
  for (let i = 1; i < chapters.length; i += 1) {
    const gap = (chapters.at(i)?.startSec ?? 0) - (chapters.at(i - 1)?.startSec ?? 0);
    if (gap < CHAPTER_RULES.minLengthSec) return `Chapters last at least ${CHAPTER_RULES.minLengthSec} seconds`;
  }
  const last = chapters.at(-1)?.startSec ?? 0;
  if (durationSec !== null && durationSec - last < CHAPTER_RULES.minLengthSec) return 'The last chapter is too short';
  return null;
}

const chaptersBody = z.object({
  chapters: z.array(z.object({ startSec: z.number().int().min(0), title: z.string().trim().min(1).max(100) })).max(CHAPTER_RULES.max),
});
const imageBody = z.object({ contentType: z.enum(IMAGE_TYPES), size: z.number().int().positive().max(IMAGE_MAX_BYTES) });
const useImageBody = z.object({ uploadId: z.string().regex(/^[A-Za-z0-9_-]{16,64}$/) });
const scheduleBody = z.object({ publishAt: z.string().datetime() });
const listQuery = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
  status: z.enum(['UPLOADING', 'PROCESSING', 'READY', 'SCHEDULED', 'ERROR']).optional(),
});
const daysQuery = z.object({ days: z.coerce.number().int().min(1).max(365).default(28) });

export const scheduleName = (env: string, videoId: string) => `zelos-${env}-publish-${videoId}`;

export const studioFeature: Feature = (r, deps) => {
  const { db, now, config, storage } = deps;
  const videos = db.collection<VideoDoc>('videos');
  const users = db.collection<UserDoc>('users');
  const views = videoViews(deps);

  // Image uploads -----------------------------------------------------------------------------

  r.post('/images/uploads', requireUser, rateLimit(deps.kv, config.tables.rateLimits, { scope: 'image', limit: 30, windowSec: 3600 }, now), async (req, res) => {
    const body = imageBody.parse(req.body);
    const uploadId = randomBytes(16).toString('base64url');
    const post = await storage.presignPost(config.buckets.raw, imageUploadKey(req.user?.id ?? '', uploadId), { size: body.size, contentType: body.contentType, metadata: {}, expiresSec: GRANT_TTL_SEC });
    res.status(201).json({ uploadId, upload: { url: post.url, fields: post.fields, expiresInSec: GRANT_TTL_SEC } });
  });

  r.put('/me/avatar', requireUser, async (req, res) => {
    const path = await takeImage(deps, req, (ext, id) => `images/users/${req.user?.id}/avatar-${id}.${ext}`);
    const u = await users.findOneAndUpdate({ _id: new ObjectId(req.user?.id) }, { $set: { avatar: `${deps.cdn.baseUrl}/${path}`, updatedAt: now() } }, { returnDocument: 'after' });
    if (!u) throw notFound('Account');
    res.json({ user: selfView(u) });
  });

  r.put('/me/banner', requireUser, async (req, res) => {
    const path = await takeImage(deps, req, (ext, id) => `images/users/${req.user?.id}/banner-${id}.${ext}`);
    const u = await users.findOneAndUpdate({ _id: new ObjectId(req.user?.id) }, { $set: { banner: `${deps.cdn.baseUrl}/${path}`, updatedAt: now() } }, { returnDocument: 'after' });
    if (!u) throw notFound('Account');
    res.json({ user: selfView(u) });
  });

  r.put('/videos/:id/thumbnail', requireUser, async (req, res) => {
    const v = await ownVideo(videos, req);
    const path = await takeImage(deps, req, (ext, id) => `videos/${v._id.toHexString()}/thumbs/custom-${id}.${ext}`);
    await videos.updateOne({ _id: v._id }, { $set: { customThumbnail: path, updatedAt: now() } });
    res.json({ thumbnail: deps.cdn.fileUrl(path, now()) });
  });

  r.delete('/videos/:id/thumbnail', requireUser, async (req, res) => {
    const v = await ownVideo(videos, req);
    await videos.updateOne({ _id: v._id }, { $set: { customThumbnail: null, updatedAt: now() } });
    res.status(204).end();
  });

  // Studio list -------------------------------------------------------------------------------

  r.get('/me/videos', requireUser, async (req, res) => {
    const q = listQuery.parse(req.query);
    const cursor = decodeCursor(q.cursor);
    const filter: Record<string, unknown> = { owner: new ObjectId(req.user?.id) };
    if (q.status) filter['status'] = q.status;
    if (cursor) filter['$or'] = [{ createdAt: { $lt: cursor.at } }, { createdAt: cursor.at, _id: { $lt: cursor.id } }];
    const list = await videos.find(filter).sort({ createdAt: -1, _id: -1 }).limit(q.limit + 1).toArray();
    const page = list.slice(0, q.limit);
    const last = page.at(-1);
    const items = await Promise.all(page.map((v) => views.details(v, { see: 'full', play: false, as: 'owner', lock: 'not_ready' })));
    res.json({ items, nextCursor: list.length > q.limit && last ? encodeCursor(last.createdAt, last._id) : null });
  });

  // Captions ----------------------------------------------------------------------------------

  r.put('/videos/:id/captions/:lang', requireUser, express.text({ type: ['text/vtt', 'text/plain'], limit: CAPTION_MAX_BYTES }), async (req, res) => {
    const lang = String(req.params['lang'] ?? '');
    if (!validLang(lang)) throw badRequest('BAD_LANGUAGE', 'Use a language code such as vi, en or pt-BR');
    const label = z.string().trim().min(1).max(40).catch(lang).parse(req.query['label']);
    if (typeof req.body !== 'string') throw badRequest('BAD_CAPTION', 'Send the caption as text/vtt');
    const problem = validateVtt(req.body);
    if (problem) throw badRequest('BAD_CAPTION', problem);
    const v = await ownVideo(videos, req);
    if (!v.hlsPath) throw conflict('VIDEO_NOT_READY', 'Add captions after processing finishes');
    const others = v.captions.filter((c) => c.lang !== lang);
    if (others.length >= MAX_CAPTIONS) throw conflict('TOO_MANY_CAPTIONS', `At most ${MAX_CAPTIONS} caption tracks`);
    const path = processedPaths(v._id.toHexString(), v.uploadVersion).caption(lang);
    await storage.put(config.buckets.processed, path, req.body, 'text/vtt; charset=utf-8');
    const captions = [...others, { lang, label, path }].sort((a, b) => a.lang.localeCompare(b.lang));
    await videos.updateOne({ _id: v._id }, { $set: { captions, updatedAt: now() } });
    res.json({ captions: captions.map((c) => ({ lang: c.lang, label: c.label })) });
  });

  r.delete('/videos/:id/captions/:lang', requireUser, async (req, res) => {
    const v = await ownVideo(videos, req);
    const lang = String(req.params['lang'] ?? '');
    const captions = v.captions.filter((c) => c.lang !== lang);
    if (captions.length === v.captions.length) throw notFound('Caption');
    await videos.updateOne({ _id: v._id }, { $set: { captions, updatedAt: now() } });
    res.status(204).end();
  });

  // Chapters ----------------------------------------------------------------------------------

  r.put('/videos/:id/chapters', requireUser, async (req, res) => {
    const { chapters } = chaptersBody.parse(req.body);
    const sorted = [...chapters].sort((a, b) => a.startSec - b.startSec);
    const v = await ownVideo(videos, req);
    const problem = validateChapters(sorted, v.durationSec);
    if (problem) throw badRequest('BAD_CHAPTERS', problem);
    await videos.updateOne({ _id: v._id }, { $set: { chapters: sorted, updatedAt: now() } });
    res.json({ chapters: sorted });
  });

  // Scheduled publishing ----------------------------------------------------------------------

  r.put('/videos/:id/schedule', requireUser, async (req, res) => {
    const at = new Date(scheduleBody.parse(req.body).publishAt);
    const ahead = (at.getTime() - now().getTime()) / 1000;
    if (ahead < SCHEDULE_WINDOW.minSec || ahead > SCHEDULE_WINDOW.maxSec) throw badRequest('BAD_SCHEDULE', 'Pick a time between five minutes and one year from now');
    const v = await ownVideo(videos, req);
    if (v.status === 'ERROR') throw conflict('VIDEO_FAILED', 'This video failed to process');
    // Already public and live: scheduling would hide it again.
    if (v.status === 'READY' && v.visibility === 'public' && v.publishAt === null) throw conflict('ALREADY_PUBLISHED', 'This video is already published');
    const id = v._id.toHexString();
    const name = scheduleName(config.env, id);
    await deps.scheduler.upsert(name, at, { action: 'release', videoId: id, uploadVersion: v.uploadVersion });
    const set: Record<string, unknown> = { publishAt: at, scheduleName: name, updatedAt: now() };
    if (v.status === 'READY') set['status'] = 'SCHEDULED';
    const after = await videos.findOneAndUpdate({ _id: v._id }, { $set: set }, { returnDocument: 'after' });
    res.json({ status: after?.status, publishAt: at.toISOString() });
  });

  r.delete('/videos/:id/schedule', requireUser, async (req, res) => {
    const v = await ownVideo(videos, req);
    if (!v.publishAt) throw notFound('Schedule');
    await deps.scheduler.remove(v.scheduleName ?? scheduleName(config.env, v._id.toHexString()));
    // Cancelling keeps the video unlisted to the public: it becomes a private ready video.
    const set: Record<string, unknown> = { publishAt: null, scheduleName: null, updatedAt: now() };
    if (v.status === 'SCHEDULED') Object.assign(set, { status: 'READY', visibility: 'private' });
    const after = await videos.findOneAndUpdate({ _id: v._id }, { $set: set }, { returnDocument: 'after' });
    res.json({ status: after?.status, visibility: after?.visibility });
  });

  // Analytics ---------------------------------------------------------------------------------

  r.get('/videos/:id/analytics', requireUser, async (req, res) => {
    const { days } = daysQuery.parse(req.query);
    const v = await ownVideo(videos, req);
    const since = new Date(now().getTime() - days * 86_400_000).toISOString().slice(0, 10);
    const rows = await db.collection('analyticsDaily').find({ video: v._id, date: { $gte: since } }).sort({ date: 1 }).toArray();
    const retention = Array.from({ length: 20 }, (_, i) => rows.reduce((s, row) => s + Number((row['retention'] as number[] | undefined)?.at(i) ?? 0), 0));
    res.json({
      days: rows.map((row) => ({ date: row['date'], views: row['views'] ?? 0, watchSeconds: row['watchSeconds'] ?? 0 })),
      totals: { views: v.counters.views, watchSeconds: rows.reduce((s, row) => s + Number(row['watchSeconds'] ?? 0), 0) },
      retention,
    });
  });

  r.get('/me/analytics', requireUser, async (req, res) => {
    const { days } = daysQuery.parse(req.query);
    const owner = new ObjectId(req.user?.id);
    const since = new Date(now().getTime() - days * 86_400_000).toISOString().slice(0, 10);
    const [perDay, top, subscribers] = await Promise.all([
      db.collection('analyticsDaily').aggregate([
        { $match: { owner, date: { $gte: since } } },
        { $group: { _id: '$date', views: { $sum: '$views' }, watchSeconds: { $sum: '$watchSeconds' } } },
        { $sort: { _id: 1 } },
      ]).toArray(),
      videos.find({ owner }).sort({ 'counters.views': -1 }).limit(5).toArray(),
      db.collection('subscriptions').countDocuments({ channel: owner }),
    ]);
    res.json({
      days: perDay.map((d) => ({ date: d['_id'], views: d['views'], watchSeconds: d['watchSeconds'] })),
      top: await views.cards(top),
      subscribers,
    });
  });
};

/** Reads the uploaded image, checks its bytes, screens it and copies it into the processed bucket. */
async function takeImage(deps: Deps, req: Request, target: (ext: string, id: string) => string): Promise<string> {
  const { uploadId } = useImageBody.parse(req.body);
  const key = imageUploadKey(req.user?.id ?? '', uploadId);
  const bytes = await deps.storage.get(deps.config.buckets.raw, key);
  if (!bytes) throw notFound('Image upload');
  if (bytes.length > IMAGE_MAX_BYTES) throw badRequest('IMAGE_TOO_LARGE', 'Images up to 2 MB are accepted');
  const kind = sniffImage(bytes);
  if (!kind) throw badRequest('UNSUPPORTED_TYPE', 'Use a JPEG or PNG image');
  const verdict = await deps.screenImage(bytes);
  await deps.storage.deletePrefix(deps.config.buckets.raw, key);
  if (!verdict.allowed) throw forbidden('IMAGE_REJECTED', 'This image breaks the content rules');
  const path = target(kind.ext, uploadId);
  await deps.storage.put(deps.config.buckets.processed, path, bytes, kind.type);
  return path;
}

async function ownVideo(videos: Collection<VideoDoc>, req: Request): Promise<VideoDoc> {
  const id = String(req.params['id'] ?? '');
  const v = /^[a-f0-9]{24}$/.test(id) ? await videos.findOne({ _id: new ObjectId(id) }) : null;
  if (!v || v.owner.toHexString() !== req.user?.id) throw notFound('Video');
  return v;
}
