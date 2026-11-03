import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ObjectId } from 'mongodb';
import { wilson } from '../src/features/moderation.js';
import { memoryDb } from './helpers.js';
import { world, type Who, type World } from './world.js';

let mongo: Awaited<ReturnType<typeof memoryDb>>;
let w: World;
let owner: Who;
let fan: Who;
let op: Who;
let admin: Who;
let auditor: Who;

beforeAll(async () => { mongo = await memoryDb(); }, 120_000);
afterAll(async () => { await mongo.stop(); });
beforeEach(async () => {
  w = world(await mongo.fresh());
  owner = await w.user('creator@example.com');
  fan = await w.user('fan@example.com');
  op = await w.user('op@example.com', 'operator');
  admin = await w.user('admin@example.com', 'admin');
  auditor = await w.user('audit@example.com', 'auditor');
});

const moderation = async (id: string) => (await w.db.collection('videos').findOne({ _id: new ObjectId(id) }))?.['moderation'];

describe('Wilson interval', () => {
  it('is null without samples and stays inside [0, 1]', () => {
    expect(wilson(0, 0)).toBeNull();
    const w1 = wilson(0, 10);
    expect(w1?.low).toBe(0);
    expect(w1?.high).toBeGreaterThan(0.2);
    expect(wilson(10, 10)?.high).toBe(1);
  });
});

describe('video reports', () => {
  it('needs a listed reason, refuses own and invisible videos, and counts repeats once', async () => {
    const id = await w.video(owner.id);
    const hidden = await w.video(owner.id, { visibility: 'private' });
    expect((await w.call('post', `/videos/${id}/report`, { reason: 'boring' }, { token: fan.token })).status).toBe(400);
    expect((await w.call('post', `/videos/${id}/report`, { reason: 'spam' }, { token: owner.token })).body.error.code).toBe('OWN_VIDEO');
    expect((await w.call('post', `/videos/${hidden}/report`, { reason: 'spam' }, { token: fan.token })).status).toBe(404);
    expect((await w.call('post', `/videos/${id}/report`, { reason: 'violent' }, { token: fan.token })).status).toBe(201);
    expect((await w.call('post', `/videos/${id}/report`, { reason: 'spam' }, { token: fan.token })).body.repeated).toBe(true);
    expect((await moderation(id))?.openReports).toBe(1);
    const queue = await w.call('get', '/admin/queue', undefined, { token: op.token });
    expect(queue.body.items.map((v: { id: string }) => v.id)).toEqual([id]);
    expect(queue.body.items[0].ownerEmail).toBeUndefined();
    expect((await w.call('get', '/admin/queue', undefined, { token: admin.token })).body.items[0].ownerEmail).toBe('creator@example.com');
    expect((await w.call('get', '/admin/queue', undefined, { token: fan.token })).status).toBe(403);
  });
});

describe('decisions', () => {
  it('requires a reason code of the decision and keeps the machine verdict', async () => {
    const id = await w.video(owner.id, { moderation: { status: 'removed', source: 'auto' } });
    expect((await w.call('post', `/admin/videos/${id}/decision`, { decision: 'approve', reasonCode: 'confirmed_violation' }, { token: op.token })).status).toBe(400);
    const ok = await w.call('post', `/admin/videos/${id}/decision`, { decision: 'approve', reasonCode: 'fiction_or_game' }, { token: op.token });
    expect(ok.body.moderation.status).toBe('approved');
    expect(await moderation(id)).toMatchObject({ status: 'approved', source: 'human', machineStatus: 'removed', reasonCode: 'fiction_or_game' });
    const event = await w.db.collection('moderationEvents').findOne({});
    expect(event).toMatchObject({ action: 'restore', outcome: 'false_positive' });

    // A second decision keeps the first machine verdict.
    await w.call('post', `/admin/videos/${id}/decision`, { decision: 'block', reasonCode: 'confirmed_violation' }, { token: op.token });
    expect((await moderation(id))?.machineStatus).toBe('removed');
  });

  it('lets only an admin overturn an admin decision, and resolves open reports', async () => {
    const id = await w.video(owner.id);
    await w.call('post', `/videos/${id}/report`, { reason: 'violent' }, { token: fan.token });
    await w.call('post', `/admin/videos/${id}/decision`, { decision: 'block', reasonCode: 'report_upheld' }, { token: admin.token });
    expect((await moderation(id))?.openReports).toBe(0);
    expect((await w.db.collection('reports').findOne({}))?.['status']).toBe('actioned');
    expect((await w.call('post', `/admin/videos/${id}/decision`, { decision: 'approve', reasonCode: 'model_error' }, { token: op.token })).body.error.code).toBe('ADMIN_DECISION');
    expect((await w.call('get', `/videos/${id}`)).body.error.code).toBe('VIDEO_REMOVED');
  });
});

describe('appeals', () => {
  it('lets the owner appeal once and an upheld appeal restores the video', async () => {
    const id = await w.video(owner.id, { moderation: { status: 'removed', source: 'auto' } });
    const live = await w.video(owner.id);
    expect((await w.call('post', `/videos/${live}/appeal`, { message: 'Please look again at it' }, { token: owner.token })).body.error.code).toBe('NOT_RESTRICTED');
    expect((await w.call('post', `/videos/${id}/appeal`, { message: 'Please look again at it' }, { token: fan.token })).status).toBe(404);
    expect((await w.call('post', `/videos/${id}/appeal`, { message: 'It is a game trailer' }, { token: owner.token })).status).toBe(201);
    expect((await w.call('post', `/videos/${id}/appeal`, { message: 'It is a game trailer' }, { token: owner.token })).body.error.code).toBe('APPEAL_OPEN');

    const list = await w.call('get', '/admin/appeals', undefined, { token: op.token });
    expect(list.body.items).toHaveLength(1);
    const res = await w.call('post', `/admin/appeals/${list.body.items[0].id}/decision`, { decision: 'uphold', resolution: 'Game footage' }, { token: op.token });
    expect(res.body.appeal.status).toBe('upheld');
    expect(await moderation(id)).toMatchObject({ status: 'approved', reasonCode: 'appeal_upheld' });
    expect((await w.call('get', `/videos/${id}/appeal`, undefined, { token: owner.token })).body.appeal.status).toBe('upheld');
  });
});

describe('audit samples and metrics', () => {
  it('samples machine-approved videos, a failed sample removes the video, and metrics count it', async () => {
    const ids = [await w.video(owner.id, { moderation: { status: 'approved', source: 'auto' } }), await w.video(owner.id, { moderation: { status: 'approved', source: 'auto' } })];
    await w.video(owner.id, { moderation: { status: 'removed', source: 'auto' } });
    expect((await w.call('post', '/admin/audit/sample', { size: 5 }, { token: op.token })).status).toBe(403);
    expect((await w.call('post', '/admin/audit/sample', { size: 5 }, { token: admin.token })).body.sampled).toBe(2);
    const pending = await w.call('get', '/admin/audit', undefined, { token: op.token });
    expect(pending.body.items).toHaveLength(2);
    const [first, second] = pending.body.items as { id: string; video: { id: string } }[];
    await w.call('post', `/admin/audit/${first!.id}`, { result: 'fail', note: 'missed violence' }, { token: op.token });
    await w.call('post', `/admin/audit/${second!.id}`, { result: 'pass' }, { token: op.token });
    expect(ids).toContain(first!.video.id);
    expect((await moderation(first!.video.id))?.status).toBe('removed');

    expect((await w.call('get', '/admin/metrics', undefined, { token: op.token })).status).toBe(403);
    const m = await w.call('get', '/admin/metrics', undefined, { token: auditor.token });
    expect(m.body.audit).toMatchObject({ pending: 0, labelled: 2, failed: 1 });
    expect(m.body.missed.falseNegative).toBe(1);
    expect(m.body.autoRemoved.unreviewed).toBe(1);
    const events = await w.call('get', '/admin/events?outcome=false_negative', undefined, { token: auditor.token });
    expect(events.body.items).toHaveLength(1);
  });
});

describe('comment reports in the console', () => {
  it('removes a reported comment or dismisses its reports', async () => {
    const id = await w.video(owner.id);
    const c1 = (await w.call('post', `/videos/${id}/comments`, { body: 'rude' }, { token: fan.token })).body.comment.id as string;
    const c2 = (await w.call('post', `/videos/${id}/comments`, { body: 'fine' }, { token: fan.token })).body.comment.id as string;
    for (const c of [c1, c2]) await w.call('post', `/comments/${c}/report`, { reason: 'harassment' }, { token: owner.token });
    expect((await w.call('get', '/admin/comments', undefined, { token: op.token })).body.items).toHaveLength(2);
    await w.call('post', `/admin/comments/${c1}/decision`, { decision: 'remove' }, { token: op.token });
    await w.call('post', `/admin/comments/${c2}/decision`, { decision: 'dismiss' }, { token: op.token });
    expect((await w.call('get', '/admin/comments', undefined, { token: op.token })).body.items).toHaveLength(0);
    expect(await w.db.collection('comments').countDocuments()).toBe(1);
  });
});

describe('roles', () => {
  it('lets admins change roles, logs the change and keeps the last admin', async () => {
    expect((await w.call('put', `/admin/users/${fan.id}/role`, { role: 'operator' }, { token: op.token })).status).toBe(403);
    expect((await w.call('put', `/admin/users/${fan.id}/role`, { role: 'operator' }, { token: admin.token })).body.user.role).toBe('operator');
    expect((await w.call('get', '/admin/queue', undefined, { token: fan.token })).status).toBe(200);
    expect((await w.call('put', `/admin/users/${admin.id}/role`, { role: 'user' }, { token: admin.token })).body.error.code).toBe('LAST_ADMIN');
    const log = await w.call('get', '/admin/role-changes', undefined, { token: auditor.token });
    expect(log.body.items[0]).toMatchObject({ user: fan.id, from: 'user', to: 'operator' });
    const found = await w.call('get', '/admin/users?q=fan', undefined, { token: admin.token });
    expect(found.body.items.map((u: { email: string }) => u.email)).toEqual(['fan@example.com']);
    expect((await w.call('get', '/admin/users?q=.*', undefined, { token: admin.token })).body.items).toEqual([]);
  });
});
