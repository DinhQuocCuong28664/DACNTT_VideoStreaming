import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Db } from 'mongodb';
import { authFeature } from '../src/features/auth.js';
import { rawKey, uploadsFeature } from '../src/features/uploads.js';
import { mongoSessionLookup } from '../src/auth/sessions.js';
import { uploadCap } from '../src/config.js';
import { GIB, HARD_CAP_BYTES, MIB, PART_SIZE, POST_MAX_BYTES, videoContentType } from '../src/model/video.js';
import { ORIGIN_SECRET, memoryDb, testApp, type TestContext } from './helpers.js';

let mongo: Awaited<ReturnType<typeof memoryDb>>;
let db: Db;
let app: ReturnType<typeof testApp>['app'];
let ctx: TestContext;

beforeAll(async () => { mongo = await memoryDb(); }, 120_000);
afterAll(async () => { await mongo.stop(); });
beforeEach(async () => {
  db = await mongo.fresh();
  ({ app, ctx } = testApp([authFeature, uploadsFeature], { db, sessions: mongoSessionLookup(db) }));
});

const post = (path: string, body: object, token?: string) => {
  const r = request(app).post(`/v1${path}`).set('x-origin-verify', ORIGIN_SECRET);
  return (token ? r.set('authorization', `Bearer ${token}`) : r).send(body);
};

async function user(email = 'owner@example.com', verified = true): Promise<{ token: string; id: string }> {
  const res = await post('/auth/register', { email, password: 'correct horse battery', displayName: 'Owner' });
  if (verified) await db.collection('users').updateOne({ email }, { $set: { emailVerified: true } });
  return { token: res.body.token, id: res.body.user.id };
}

const create = (token: string, size: number, fileName = 'clip.mp4', contentType = 'video/mp4') =>
  post('/uploads', { fileName, size, contentType }, token);

describe('content types and size config', () => {
  it('accepts video containers and falls back to the extension for generic types', () => {
    expect(videoContentType('a.mp4', 'video/mp4')).toBe('video/mp4');
    expect(videoContentType('a.mkv', '')).toBe('video/x-matroska');
    expect(videoContentType('a.MOV', 'application/octet-stream')).toBe('video/quicktime');
    expect(videoContentType('a.mp4', 'image/png')).toBeNull();
    expect(videoContentType('a.exe', 'video/mp4')).toBeNull();
    expect(videoContentType('noext', 'video/mp4')).toBeNull();
  });

  it('never widens the cap past 20 GiB and falls back on invalid values', () => {
    expect(uploadCap(undefined)).toBe(HARD_CAP_BYTES);
    expect(uploadCap('abc')).toBe(HARD_CAP_BYTES);
    expect(uploadCap('-5')).toBe(HARD_CAP_BYTES);
    expect(uploadCap(String(40 * GIB))).toBe(HARD_CAP_BYTES);
    expect(uploadCap(String(2 * GIB))).toBe(2 * GIB);
  });
});

describe('creating an upload', () => {
  it('needs a verified e-mail', async () => {
    const u = await user('new@example.com', false);
    const res = await create(u.token, 10 * MIB);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
    expect((await post('/uploads', { fileName: 'a.mp4', size: 5 })).status).toBe(401);
  });

  it('pins key, exact size, type and metadata in a presigned POST up to 5 GiB', async () => {
    const u = await user();
    const res = await create(u.token, POST_MAX_BYTES);
    expect(res.status).toBe(201);
    expect(res.body.upload.mode).toBe('post');
    const id = res.body.video.id as string;
    expect(res.body.upload.fields).toMatchObject({
      key: rawKey(id, 1), 'Content-Type': 'video/mp4',
      'x-amz-meta-video-id': id, 'x-amz-meta-upload-version': '1', 'x-amz-meta-owner-id': u.id,
      'x-test-size': String(POST_MAX_BYTES),
    });
    const doc = await db.collection('videos').findOne({});
    expect(doc).toMatchObject({ status: 'UPLOADING', uploadVersion: 1, title: 'clip', visibility: 'public' });
  });

  it('switches to multipart one byte over 5 GiB', async () => {
    const u = await user();
    const res = await create(u.token, POST_MAX_BYTES + 1);
    expect(res.body.upload).toMatchObject({ mode: 'multipart', partSize: PART_SIZE, partCount: Math.ceil((POST_MAX_BYTES + 1) / PART_SIZE) });
    expect(res.body.upload.uploadId).toBeUndefined();
    expect(ctx.s3.uploads.size).toBe(1);
  });

  it('refuses files over the cap and non-video files', async () => {
    const u = await user();
    expect((await create(u.token, HARD_CAP_BYTES + 1)).body.error.code).toBe('FILE_TOO_LARGE');
    expect((await create(u.token, 100, 'virus.exe', 'video/mp4')).body.error.code).toBe('UNSUPPORTED_TYPE');
    expect((await create(u.token, 100, 'x.mp4', 'text/html')).body.error.code).toBe('UNSUPPORTED_TYPE');
  });
});

describe('multipart', () => {
  const SIZE = 3 * PART_SIZE + 5;

  async function start() {
    const u = await user();
    const res = await create(u.token, POST_MAX_BYTES + SIZE);
    const id = res.body.video.id as string;
    const uploadId = [...ctx.s3.uploads.keys()][0] ?? '';
    const count = res.body.upload.partCount as number;
    return { u, id, uploadId, count, total: POST_MAX_BYTES + SIZE };
  }
  const sizeOf = (n: number, count: number, total: number) => (n < count ? PART_SIZE : total - (n - 1) * PART_SIZE);

  it('signs each part with its exact size and refuses numbers past the end', async () => {
    const { u, id, count, total } = await start();
    const res = await post(`/uploads/${id}/parts`, { partNumbers: [1, count] }, u.token);
    expect(res.status).toBe(200);
    expect(res.body.parts[0]).toMatchObject({ partNumber: 1, size: PART_SIZE });
    expect(res.body.parts[1]).toMatchObject({ partNumber: count, size: sizeOf(count, count, total) });
    expect(res.body.parts[1].url).toContain(`size=${sizeOf(count, count, total)}`);
    expect((await post(`/uploads/${id}/parts`, { partNumbers: [count + 1] }, u.token)).body.error.code).toBe('INVALID_PARTS');
  });

  it('reports missing parts, refuses wrong sizes and completes from the S3 part list', async () => {
    const { u, id, uploadId, count, total } = await start();
    for (let n = 1; n < count; n += 1) ctx.s3.uploadPart(uploadId, n, sizeOf(n, count, total));
    const missing = await post(`/uploads/${id}/complete`, {}, u.token);
    expect(missing.status).toBe(409);
    expect(missing.body.error).toMatchObject({ code: 'UPLOAD_INCOMPLETE', details: { missing: [count], missingCount: 1 } });

    ctx.s3.uploadPart(uploadId, count, 7);
    const wrong = await post(`/uploads/${id}/complete`, {}, u.token);
    expect(wrong.body.error.code).toBe('INVALID_PARTS');

    ctx.s3.uploadPart(uploadId, count, sizeOf(count, count, total));
    const ok = await post(`/uploads/${id}/complete`, {}, u.token);
    expect(ok.status).toBe(200);
    expect(ok.body.video.status).toBe('UPLOADING');
    expect((await ctx.deps.storage.head('raw', rawKey(id, 1)))?.size).toBe(total);

    // Idempotent: a second call answers with the current state.
    const again = await post(`/uploads/${id}/complete`, {}, u.token);
    expect(again.status).toBe(200);
  });

  it('detects an object that S3 assembled before the database write', async () => {
    const { u, id, uploadId, total } = await start();
    ctx.s3.uploads.delete(uploadId);
    ctx.s3.putSized('raw', rawKey(id, 1), total);
    expect((await post(`/uploads/${id}/complete`, {}, u.token)).status).toBe(200);
  });

  it('aborts and deletes the draft even when the abort fails', async () => {
    const { u, id, uploadId } = await start();
    ctx.s3.uploads.delete(uploadId); // abort will fail with NoSuchUpload
    expect((await post(`/uploads/${id}/abort`, {}, u.token)).status).toBe(204);
    expect(await db.collection('videos').countDocuments()).toBe(0);
  });
});

describe('ownership', () => {
  it('hides other users\' drafts', async () => {
    const owner = await user();
    const res = await create(owner.token, 10 * MIB);
    const other = await user('other@example.com');
    const id = res.body.video.id as string;
    expect((await post(`/uploads/${id}/complete`, {}, other.token)).status).toBe(404);
    expect((await post(`/uploads/${id}/abort`, {}, other.token)).status).toBe(404);
    expect((await post('/uploads/not-an-id/abort', {}, other.token)).status).toBe(404);
  });

  it('answers UPLOAD_INCOMPLETE for a POST upload that has not arrived, then completes', async () => {
    const u = await user();
    const res = await create(u.token, 10 * MIB);
    const id = res.body.video.id as string;
    expect((await post(`/uploads/${id}/complete`, {}, u.token)).body.error.code).toBe('UPLOAD_INCOMPLETE');
    ctx.s3.putSized('raw', rawKey(id, 1), 10 * MIB);
    expect((await post(`/uploads/${id}/complete`, {}, u.token)).status).toBe(200);
  });
});
