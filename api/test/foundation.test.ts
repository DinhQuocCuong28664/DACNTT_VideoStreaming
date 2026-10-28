import { describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Feature } from '../src/app.js';
import { badRequest } from '../src/http/errors.js';
import { rateLimit, requireRole, requireUser } from '../src/http/middleware.js';
import { ipRateKey } from '../src/http/clientIp.js';
import { Tokens } from '../src/auth/tokens.js';
import { ORIGIN_SECRET, WEB, testApp, testConfig } from './helpers.js';

const probe: Feature = (r, deps) => {
  r.get('/probe/me', requireUser, (req, res) => { res.json({ user: req.user, clientKey: req.clientKey }); });
  r.get('/probe/public-key', (req, res) => { res.json({ clientKey: req.clientKey }); });
  r.get('/probe/admin', requireRole('admin'), (_req, res) => { res.json({ ok: true }); });
  r.get('/probe/fail', () => { throw new Error('database password is hunter2'); });
  r.get('/probe/bad', () => { throw badRequest('NOPE', 'Nope'); });
  r.post('/probe/echo', (req, res) => { res.json(req.body); });
  r.get('/probe/tight', rateLimit(deps.kv, deps.config.tables.rateLimits, { scope: 'tight', limit: 2, windowSec: 60 }, deps.now), (_req, res) => { res.json({ ok: true }); });
};

const call = (app: Parameters<typeof request>[0]) => ({
  get: (path: string) => request(app).get(path).set('x-origin-verify', ORIGIN_SECRET),
  post: (path: string) => request(app).post(path).set('x-origin-verify', ORIGIN_SECRET),
});

describe('origin check', () => {
  it('refuses requests that did not come through the Worker', async () => {
    const { app } = testApp([probe]);
    const res = await request(app).get('/v1/health');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORIGIN_REQUIRED');
    const wrong = await request(app).get('/v1/health').set('x-origin-verify', 'x'.repeat(40));
    expect(wrong.status).toBe(403);
  });

  it('keeps the root health check open without the secret', async () => {
    const { app } = testApp();
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('groups IPv6 clients by /56 and maps IPv4-mapped addresses to IPv4', () => {
    expect(ipRateKey('2001:db8:abcd:12ff:1::5')).toBe('2001:db8:abcd:1200::/56');
    expect(ipRateKey('2001:db8:abcd:1234::9')).toBe('2001:db8:abcd:1200::/56');
    expect(ipRateKey('::1')).toBe('0:0:0:0::/56');
    expect(ipRateKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
    expect(ipRateKey('203.0.113.9')).toBe('203.0.113.9');
  });

  it('ignores CF-Connecting-IP on requests that skipped the Worker', async () => {
    const { app } = testApp([probe], { config: testConfig({ REQUIRE_ORIGIN_SECRET: 'false' }) });
    const res = await request(app).get('/v1/probe/public-key').set('cf-connecting-ip', '198.51.100.9');
    expect(res.body.clientKey).not.toBe('198.51.100.9');
  });

  it('refuses a production config that turns the origin check off', () => {
    expect(() => testConfig({ APP_ENV: 'prod', REQUIRE_ORIGIN_SECRET: 'false' })).toThrow();
  });
});

describe('CORS', () => {
  it('answers preflight for the web origin only', async () => {
    const { app } = testApp([probe]);
    const ok = await request(app).options('/v1/health').set('x-origin-verify', ORIGIN_SECRET).set('origin', WEB);
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(WEB);
    expect(ok.headers['access-control-allow-credentials']).toBeUndefined();
    const bad = await request(app).options('/v1/health').set('x-origin-verify', ORIGIN_SECRET).set('origin', 'https://evil.example');
    expect(bad.status).toBe(403);
    expect(bad.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('authentication', () => {
  it('accepts a current token and rejects revoked, disabled, forged or other-kind tokens', async () => {
    const { app, ctx } = testApp([probe]);
    ctx.users.set('u1', { tokenVersion: 2, role: 'user', disabled: false });
    const good = ctx.deps.tokens.access({ sub: 'u1', role: 'user', tv: 2 });
    const me = await call(app).get('/v1/probe/me').set('authorization', `Bearer ${good}`).set('cf-connecting-ip', '198.51.100.7');
    expect(me.status).toBe(200);
    expect(me.body).toEqual({ user: { id: 'u1', role: 'user' }, clientKey: '198.51.100.7' });

    const old = ctx.deps.tokens.access({ sub: 'u1', role: 'user', tv: 1 });
    expect((await call(app).get('/v1/probe/me').set('authorization', `Bearer ${old}`)).status).toBe(401);

    const forged = new Tokens('k'.repeat(40)).access({ sub: 'u1', role: 'admin', tv: 2 });
    expect((await call(app).get('/v1/probe/me').set('authorization', `Bearer ${forged}`)).status).toBe(401);

    const playback = ctx.deps.tokens.playback('u1', 2);
    expect((await call(app).get('/v1/probe/me').set('authorization', `Bearer ${playback}`)).status).toBe(401);

    ctx.users.set('u1', { tokenVersion: 2, role: 'user', disabled: true });
    expect((await call(app).get('/v1/probe/me').set('authorization', `Bearer ${good}`)).status).toBe(401);
  });

  it('takes the role from the database, not from the token', async () => {
    const { app, ctx } = testApp([probe]);
    ctx.users.set('u1', { tokenVersion: 0, role: 'user', disabled: false });
    const claimsAdmin = ctx.deps.tokens.access({ sub: 'u1', role: 'admin', tv: 0 });
    expect((await call(app).get('/v1/probe/admin').set('authorization', `Bearer ${claimsAdmin}`)).status).toBe(403);
    ctx.users.set('u1', { tokenVersion: 0, role: 'admin', disabled: false });
    expect((await call(app).get('/v1/probe/admin').set('authorization', `Bearer ${claimsAdmin}`)).status).toBe(200);
  });

  it('expires access tokens', async () => {
    const { app, ctx } = testApp([probe]);
    ctx.users.set('u1', { tokenVersion: 0, role: 'user', disabled: false });
    const token = ctx.deps.tokens.access({ sub: 'u1', role: 'user', tv: 0 });
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 8 * 24 * 3600 * 1000);
    expect((await call(app).get('/v1/probe/me').set('authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('scopes playback and unlock tokens to one video', () => {
    const t = new Tokens('j'.repeat(40));
    expect(t.verifyPlayback(t.playback('v1', 3), 'v1')).toEqual({ sub: 'v1', v: 3 });
    expect(t.verifyPlayback(t.playback('v1', 3), 'v2')).toBeNull();
    expect(t.verifyUnlock(t.unlock('v1'), 'v1')).toBe(true);
    expect(t.verifyUnlock(t.unlock('v1'), 'v2')).toBe(false);
    expect(t.verifyUnlock(t.playback('v1', 1), 'v1')).toBe(false);
  });
});

describe('errors and limits', () => {
  it('hides unexpected error messages and keeps the shape for known ones', async () => {
    const logged: unknown[] = [];
    const { app, ctx } = testApp([probe]);
    ctx.deps.log = (e) => logged.push(e);
    const fail = await call(app).get('/v1/probe/fail');
    expect(fail.status).toBe(500);
    expect(JSON.stringify(fail.body)).not.toContain('hunter2');
    const bad = await call(app).get('/v1/probe/bad');
    expect(bad.body).toEqual({ error: { code: 'NOPE', message: 'Nope' } });
    expect((await call(app).get('/v1/nothing')).status).toBe(404);
  });

  it('rejects malformed and oversized JSON with 400 and 413', async () => {
    const { app } = testApp([probe]);
    const bad = await call(app).post('/v1/probe/echo').set('content-type', 'application/json').send('{"a":');
    expect(bad.status).toBe(400);
    const big = await call(app).post('/v1/probe/echo').send({ a: 'x'.repeat(70_000) });
    expect(big.status).toBe(413);
  });

  it('limits per client in a fixed window and reports Retry-After', async () => {
    const { app, ctx } = testApp([probe]);
    const get = () => call(app).get('/v1/probe/tight').set('cf-connecting-ip', '198.51.100.7');
    expect((await get()).status).toBe(200);
    expect((await get()).status).toBe(200);
    const third = await get();
    expect(third.status).toBe(429);
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    // Another client is not affected; the next window starts fresh.
    expect((await call(app).get('/v1/probe/tight').set('cf-connecting-ip', '198.51.100.8')).status).toBe(200);
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 60_000);
    expect((await get()).status).toBe(200);
  });
});
