import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { ObjectId } from 'mongodb';
import { validateChapters, validateVtt, validLang, scheduleName } from '../src/features/studio.js';
import { ORIGIN_SECRET, memoryDb } from './helpers.js';
import { world, type Who, type World } from './world.js';

let mongo: Awaited<ReturnType<typeof memoryDb>>;
let w: World;
let owner: Who;
let fan: Who;

beforeAll(async () => { mongo = await memoryDb(); }, 120_000);
afterAll(async () => { await mongo.stop(); });
beforeEach(async () => {
  w = world(await mongo.fresh());
  owner = await w.user('creator@example.com');
  fan = await w.user('fan@example.com');
});

const VTT = 'WEBVTT\n\n00:00.000 --> 00:02.500\nXin chào\n\n00:02.500 --> 01:00:03.000 align:start\nTạm biệt\n';
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100)]);

const putCaption = (video: string, lang: string, body: string, who: Who = owner) =>
  request(w.app).put(`/v1/videos/${video}/captions/${lang}?label=Ti%E1%BA%BFng%20Vi%E1%BB%87t`)
    .set('x-origin-verify', ORIGIN_SECRET).set('authorization', `Bearer ${who.token}`)
    .set('content-type', 'text/vtt').send(body);

async function uploadImage(who: Who, bytes: Buffer): Promise<string> {
  const res = await w.call('post', '/images/uploads', { contentType: 'image/jpeg', size: bytes.length }, { token: who.token });
  expect(res.status).toBe(201);
  const key = res.body.upload.fields.key as string;
  await w.ctx.deps.storage.put('raw', key, bytes, 'image/jpeg');
  return res.body.uploadId as string;
}

describe('validators', () => {
  it('accepts WebVTT with hours, settings and a BOM, and refuses broken files', () => {
    expect(validateVtt(VTT)).toBeNull();
    expect(validateVtt(`${String.fromCharCode(0xfeff)}WEBVTT - title\r\n\r\n00:01.000 --> 00:02.000\r\nhi`)).toBeNull();
    expect(validateVtt('1\n00:00:01,000 --> 00:00:02,000\nSRT')).toContain('WEBVTT');
    expect(validateVtt('WEBVTT\n\n00:01.000 --> 00:00.500\nback')).toContain('ends before');
    expect(validateVtt('WEBVTT\n\n00:61.000 --> 00:62.000\nbad')).toContain('Bad cue');
    expect(validateVtt('WEBVTT\n')).toContain('no cues');
  });

  it('checks language tags and chapter rules', () => {
    expect(['vi', 'en', 'pt-BR', 'fil'].every(validLang)).toBe(true);
    expect(['VI', 'english', 'pt-br', 'en-US-x', '../x'].some(validLang)).toBe(false);
    const ok = [{ startSec: 0, title: 'Intro' }, { startSec: 10, title: 'A' }, { startSec: 60, title: 'B' }];
    expect(validateChapters(ok, 120)).toBeNull();
    expect(validateChapters([], 120)).toBeNull();
    expect(validateChapters(ok.slice(0, 2), 120)).toContain('at least 3');
    expect(validateChapters([{ startSec: 5, title: 'x' }, ...ok.slice(1)], 120)).toContain('0:00');
    expect(validateChapters([ok[0]!, { startSec: 5, title: 'A' }, ok[2]!], 120)).toContain('10 seconds');
    expect(validateChapters(ok, 65)).toContain('too short');
  });
});

describe('captions and chapters', () => {
  it('stores valid captions for the owner and serves them through the signed path', async () => {
    const id = await w.video(owner.id);
    expect((await putCaption(id, 'vi', VTT, fan)).status).toBe(404);
    expect((await putCaption(id, 'vi', 'not vtt')).body.error.code).toBe('BAD_CAPTION');
    expect((await putCaption(id, 'xx_YY', VTT)).body.error.code).toBe('BAD_LANGUAGE');
    const ok = await putCaption(id, 'vi', VTT);
    expect(ok.status).toBe(200);
    expect(ok.body.captions).toEqual([{ lang: 'vi', label: 'Tiếng Việt' }]);
    expect((await w.ctx.deps.storage.get('processed', `videos/${id}/v2/captions/vi.vtt`))?.toString()).toBe(VTT);
    const play = await w.call('get', `/videos/${id}/playback`);
    expect(play.body.captions[0].url).toBe(`https://cdn.example.test/videos/${id}/v2/captions/vi.vtt`);
    expect((await putCaption(id, 'vi', 'WEBVTT\n\n00:00.000 --> 00:01.000\nnew')).body.captions).toHaveLength(1);
    expect((await w.call('delete', `/videos/${id}/captions/vi`, undefined, { token: owner.token })).status).toBe(204);
  });

  it('refuses captions over the size cap', async () => {
    const id = await w.video(owner.id);
    expect((await putCaption(id, 'en', VTT + 'x'.repeat(600 * 1024))).status).toBe(413);
  });

  it('saves sorted chapters and refuses invalid ones', async () => {
    const id = await w.video(owner.id);
    const chapters = [{ startSec: 60, title: 'B' }, { startSec: 0, title: 'Intro' }, { startSec: 10, title: 'A' }];
    const res = await w.call('put', `/videos/${id}/chapters`, { chapters }, { token: owner.token });
    expect(res.body.chapters.map((c: { title: string }) => c.title)).toEqual(['Intro', 'A', 'B']);
    expect((await w.call('get', `/videos/${id}`)).body.video.chapters).toHaveLength(3);
    expect((await w.call('put', `/videos/${id}/chapters`, { chapters: chapters.slice(0, 2) }, { token: owner.token })).body.error.code).toBe('BAD_CHAPTERS');
  });
});

describe('images', () => {
  it('screens a custom thumbnail and uses it in listings', async () => {
    const id = await w.video(owner.id);
    const upload = await uploadImage(owner, JPEG);
    const res = await w.call('put', `/videos/${id}/thumbnail`, { uploadId: upload }, { token: owner.token });
    expect(res.status).toBe(200);
    const listed = await w.call('get', '/videos');
    expect(listed.body.items[0].thumbnail).toContain(`videos/${id}/thumbs/custom-${upload}.jpg`);
    expect(await w.ctx.deps.storage.get('raw', `images/${owner.id}/${upload}`)).toBeNull();
  });

  it('refuses images Rekognition flags, fails closed when it is down, and checks the real type', async () => {
    w.ctx.imageLabels.value = ['Explicit Nudity'];
    const flagged = await uploadImage(fan, JPEG);
    expect((await w.call('put', '/me/avatar', { uploadId: flagged }, { token: fan.token })).body.error.code).toBe('IMAGE_REJECTED');

    w.ctx.imageLabels.value = null;
    const down = await uploadImage(fan, JPEG);
    expect((await w.call('put', '/me/avatar', { uploadId: down }, { token: fan.token })).status).toBe(503);

    w.ctx.imageLabels.value = [];
    const html = await uploadImage(fan, Buffer.from('<html><script>alert(1)</script></html>'));
    expect((await w.call('put', '/me/avatar', { uploadId: html }, { token: fan.token })).body.error.code).toBe('UNSUPPORTED_TYPE');

    const good = await uploadImage(fan, JPEG);
    const ok = await w.call('put', '/me/banner', { uploadId: good }, { token: fan.token });
    expect(ok.body.user.banner).toBe(`https://cdn.example.test/images/users/${fan.id}/banner-${good}.jpg`);
    // Another user's upload id is not found.
    const theirs = await uploadImage(owner, JPEG);
    expect((await w.call('put', '/me/avatar', { uploadId: theirs }, { token: fan.token })).status).toBe(404);
  });
});

describe('scheduled publishing', () => {
  it('moves, keeps and cancels one schedule per video', async () => {
    const id = await w.video(owner.id, { visibility: 'public', status: 'PROCESSING', processedAt: null });
    const at = new Date(w.ctx.clock.now.getTime() + 3600_000).toISOString();
    expect((await w.call('put', `/videos/${id}/schedule`, { publishAt: new Date(w.ctx.clock.now.getTime() + 60_000).toISOString() }, { token: owner.token })).body.error.code).toBe('BAD_SCHEDULE');
    const first = await w.call('put', `/videos/${id}/schedule`, { publishAt: at }, { token: owner.token });
    expect(first.body.status).toBe('PROCESSING');
    const name = scheduleName('test', id);
    expect(w.ctx.schedules.get(name)?.payload).toEqual({ action: 'release', videoId: id, uploadVersion: 2 });

    // Processing finished meanwhile (the status function sets SCHEDULED); moving the time moves the schedule.
    await w.db.collection('videos').updateOne({ _id: new ObjectId(id) }, { $set: { status: 'SCHEDULED', processedAt: w.ctx.clock.now } });
    expect((await w.call('get', `/videos/${id}`)).status).toBe(404);
    const later = new Date(w.ctx.clock.now.getTime() + 7200_000).toISOString();
    expect((await w.call('put', `/videos/${id}/schedule`, { publishAt: later }, { token: owner.token })).body.status).toBe('SCHEDULED');
    expect(w.ctx.schedules.get(name)?.at.toISOString()).toBe(later);
    expect(w.ctx.schedules.size).toBe(1);

    const cancel = await w.call('delete', `/videos/${id}/schedule`, undefined, { token: owner.token });
    expect(cancel.body).toEqual({ status: 'READY', visibility: 'private' });
    expect(w.ctx.schedules.size).toBe(0);
  });

  it('refuses to schedule a video that is already live', async () => {
    const id = await w.video(owner.id);
    const at = new Date(w.ctx.clock.now.getTime() + 3600_000).toISOString();
    expect((await w.call('put', `/videos/${id}/schedule`, { publishAt: at }, { token: owner.token })).body.error.code).toBe('ALREADY_PUBLISHED');
  });
});

describe('studio list and analytics', () => {
  it('lists every video of the owner with processing fields', async () => {
    await w.video(owner.id, { status: 'PROCESSING' });
    await w.video(owner.id, { visibility: 'private' });
    await w.video(fan.id);
    const res = await w.call('get', '/me/videos', undefined, { token: owner.token });
    expect(res.body.items).toHaveLength(2);
    expect(res.body.items[0].status).toBeDefined();
    expect((await w.call('get', '/me/videos?status=PROCESSING', undefined, { token: owner.token })).body.items).toHaveLength(1);
  });

  it('sums daily analytics rows for the owner', async () => {
    const id = await w.video(owner.id);
    const today = w.ctx.clock.now.toISOString().slice(0, 10);
    await w.db.collection('analyticsDaily').insertMany([
      { video: new ObjectId(id), owner: new ObjectId(owner.id), date: today, views: 3, watchSeconds: 300, retention: Array.from({ length: 20 }, () => 1) },
      { video: new ObjectId(id), owner: new ObjectId(owner.id), date: '2020-01-01', views: 9, watchSeconds: 900, retention: [] },
    ]);
    const one = await w.call('get', `/videos/${id}/analytics?days=7`, undefined, { token: owner.token });
    expect(one.body.days).toEqual([{ date: today, views: 3, watchSeconds: 300 }]);
    expect(one.body.retention[19]).toBe(1);
    expect((await w.call('get', `/videos/${id}/analytics`, undefined, { token: fan.token })).status).toBe(404);
    const all = await w.call('get', '/me/analytics', undefined, { token: owner.token });
    expect(all.body.days).toEqual([{ date: today, views: 3, watchSeconds: 300 }]);
  });
});
