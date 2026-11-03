import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Db } from 'mongodb';
import { authFeature, MAILS_PER_RECIPIENT_HOUR } from '../src/features/auth.js';
import { mongoSessionLookup } from '../src/auth/sessions.js';
import { passwordProblem } from '../src/auth/passwords.js';
import { handleBase } from '../src/model/user.js';
import { ORIGIN_SECRET, memoryDb, testApp, type TestContext } from './helpers.js';

const GOOD = 'correct horse battery';

let mongo: Awaited<ReturnType<typeof memoryDb>>;
let db: Db;
let app: ReturnType<typeof testApp>['app'];
let ctx: TestContext;

beforeAll(async () => { mongo = await memoryDb(); }, 120_000);
afterAll(async () => { await mongo.stop(); });
beforeEach(async () => {
  db = await mongo.fresh();
  ({ app, ctx } = testApp([authFeature], { db, sessions: mongoSessionLookup(db) }));
});

const post = (path: string, body: object, token?: string) => {
  const r = request(app).post(`/v1${path}`).set('x-origin-verify', ORIGIN_SECRET).set('cf-connecting-ip', '198.51.100.20');
  return (token ? r.set('authorization', `Bearer ${token}`) : r).send(body);
};
const get = (path: string, token?: string) => {
  const r = request(app).get(`/v1${path}`).set('x-origin-verify', ORIGIN_SECRET);
  return token ? r.set('authorization', `Bearer ${token}`) : r;
};
const register = (email = 'an@example.com', extra: object = {}) =>
  post('/auth/register', { email, password: GOOD, displayName: 'An Nguyễn', ...extra });
const linkFrom = (text: string) => /token=([\w-]+)/.exec(text)?.[1] ?? '';

describe('password rules', () => {
  it('counts the 72-byte bcrypt limit in UTF-8 and blocks common or personal passwords', () => {
    expect(passwordProblem('short')).toBe('too_short');
    expect(passwordProblem('ạ'.repeat(25))).toBe('too_long'); // 25 characters, 75 bytes
    expect(passwordProblem('nhạc rock của tôi')).toBeNull(); // multi-byte letters, under 72 bytes
    expect(passwordProblem('Password123!')).toBe('common');
    expect(passwordProblem('p@ssw0rd99')).toBe('common');
    expect(passwordProblem('12341234')).toBe('common');
    expect(passwordProblem('abcdefgh')).toBe('common');
    expect(passwordProblem('nguyenan-rocks', { email: 'nguyenan@example.com' })).toBe('personal');
    expect(passwordProblem('i love zelostech')).toBe('personal');
  });
});

describe('handles', () => {
  it('makes a handle from any text', () => {
    expect(handleBase('Đỗ.Nhạc!')).toBe('do.nhac');
    expect(handleBase('a')).toBe('usera');
    expect(handleBase('.x.' + 'y'.repeat(30))).toMatch(/^[a-z0-9][a-z0-9._]*[a-z0-9]$/);
  });
});

describe('register and sign in', () => {
  it('registers, mails a verification link and signs in', async () => {
    const res = await register('An@Example.com ');
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'an@example.com', emailVerified: false, handle: 'useran', hasPassword: true, role: 'user' });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(ctx.mail.sent).toHaveLength(1);
    expect(ctx.mail.sent[0]?.to).toBe('an@example.com');

    const me = await get('/auth/me', res.body.token);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('an@example.com');

    const login = await post('/auth/login', { email: 'AN@example.com', password: GOOD });
    expect(login.status).toBe(200);
    expect(login.body.token).toBeTruthy();
  });

  it('gives the same answer for an unknown e-mail and a wrong password', async () => {
    await register();
    const wrong = await post('/auth/login', { email: 'an@example.com', password: 'nope nope nope' });
    const unknown = await post('/auth/login', { email: 'nobody@example.com', password: GOOD });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('refuses weak and breached passwords with a reason', async () => {
    const weak = await post('/auth/register', { email: 'b@example.com', password: 'password1', displayName: 'B' });
    expect(weak.status).toBe(400);
    expect(weak.body.error).toMatchObject({ code: 'WEAK_PASSWORD', details: { reason: 'common' } });
    ctx.breached.set(GOOD, 12);
    const breached = await register('c@example.com');
    expect(breached.body.error.details.reason).toBe('breached');
  });

  it('lets registration through when the breach service is down', async () => {
    ctx.breached.set(GOOD, null);
    expect((await register()).status).toBe(201);
  });

  it('refuses a second account for the same e-mail and a taken or reserved handle', async () => {
    await register('a@example.com', { handle: 'music.vn' });
    expect((await register('a@example.com')).body.error.code).toBe('EMAIL_TAKEN');
    expect((await register('b@example.com', { handle: 'music.vn' })).body.error.code).toBe('HANDLE_TAKEN');
    expect((await register('c@example.com', { handle: 'studio' })).body.error.code).toBe('HANDLE_TAKEN');
  });

  it('adds a suffix when a generated handle is taken', async () => {
    await register('an@example.com');
    const second = await register('an@example.org');
    expect(second.body.user.handle).toMatch(/^useran\d{4}$/);
  });

  it('still registers when the mail cannot be sent', async () => {
    ctx.deps.mail.send = async () => { throw new Error('smtp down'); };
    expect((await register()).status).toBe(201);
  });

  it('limits registrations per address', async () => {
    for (let i = 0; i < 5; i += 1) expect((await register(`u${i}@example.com`)).status).toBe(201);
    expect((await register('u9@example.com')).status).toBe(429);
  });

  it('limits login attempts per e-mail', async () => {
    await register();
    for (let i = 0; i < 10; i += 1) await post('/auth/login', { email: 'an@example.com', password: 'wrong wrong wrong' });
    expect((await post('/auth/login', { email: 'an@example.com', password: GOOD })).status).toBe(429);
  });
});

describe('e-mail verification', () => {
  it('verifies once with the newest link, and the link expires', async () => {
    const reg = await register();
    const first = linkFrom(ctx.mail.sent[0]?.text ?? '');
    await post('/auth/resend-verification', {}, reg.body.token);
    const second = linkFrom(ctx.mail.sent[1]?.text ?? '');
    expect((await post('/auth/verify-email', { token: first })).status).toBe(400);
    expect((await post('/auth/verify-email', { token: second })).status).toBe(200);
    expect((await post('/auth/verify-email', { token: second })).status).toBe(400);
    expect((await get('/auth/me', reg.body.token)).body.user.emailVerified).toBe(true);

    await register('late@example.com');
    const late = linkFrom(ctx.mail.sent.at(-1)?.text ?? '');
    ctx.clock.now = new Date(ctx.clock.now.getTime() + 25 * 3600 * 1000);
    expect((await post('/auth/verify-email', { token: late })).status).toBe(400);
  });

  it('stores only a hash of the token', async () => {
    await register();
    const raw = linkFrom(ctx.mail.sent[0]?.text ?? '');
    const stored = await db.collection('emailTokens').findOne({});
    expect(JSON.stringify(stored)).not.toContain(raw);
  });

  it('throttles mails per recipient, whatever the case of the address', async () => {
    const reg = await register();
    for (let i = 0; i < 5; i += 1) await post('/auth/forgot-password', { email: i % 2 ? 'AN@example.com' : 'an@example.com' });
    const toAn = ctx.mail.sent.filter((m) => m.to === 'an@example.com' && m.subject.includes('Reset'));
    expect(toAn).toHaveLength(MAILS_PER_RECIPIENT_HOUR);
    expect(reg.status).toBe(201);
  });
});

describe('password reset and change', () => {
  it('answers 202 for unknown addresses and resets with the link, revoking old sessions', async () => {
    const reg = await register();
    expect((await post('/auth/forgot-password', { email: 'ghost@example.com' })).status).toBe(202);
    expect((await post('/auth/forgot-password', { email: 'an@example.com' })).status).toBe(202);
    const raw = linkFrom(ctx.mail.sent.at(-1)?.text ?? '');

    // A weak password does not spend the link.
    expect((await post('/auth/reset-password', { token: raw, password: 'password1' })).status).toBe(400);
    const reset = await post('/auth/reset-password', { token: raw, password: 'a brand new phrase' });
    expect(reset.status).toBe(200);
    expect(reset.body.user.emailVerified).toBe(true);
    expect((await get('/auth/me', reg.body.token)).status).toBe(401);
    expect((await get('/auth/me', reset.body.token)).status).toBe(200);
    expect((await post('/auth/reset-password', { token: raw, password: 'another new phrase' })).status).toBe(400);
    expect((await post('/auth/login', { email: 'an@example.com', password: 'a brand new phrase' })).status).toBe(200);
  });

  it('changes the password only with the current one and returns a fresh session', async () => {
    const reg = await register();
    const bad = await post('/auth/change-password', { currentPassword: 'wrong wrong', newPassword: 'a brand new phrase' }, reg.body.token);
    expect(bad.status).toBe(401);
    const ok = await post('/auth/change-password', { currentPassword: GOOD, newPassword: 'a brand new phrase' }, reg.body.token);
    expect(ok.status).toBe(200);
    expect((await get('/auth/me', reg.body.token)).status).toBe(401);
    expect((await get('/auth/me', ok.body.token)).status).toBe(200);
  });

  it('signs out everywhere', async () => {
    const reg = await register();
    const other = (await post('/auth/login', { email: 'an@example.com', password: GOOD })).body.token;
    expect((await post('/auth/logout', {}, reg.body.token)).status).toBe(204);
    expect((await get('/auth/me', reg.body.token)).status).toBe(401);
    expect((await get('/auth/me', other)).status).toBe(401);
  });
});

describe('Google sign-in', () => {
  const identity = { sub: 'g-1', email: 'an@example.com', name: 'An', picture: null };

  it('creates a verified account without a password', async () => {
    ctx.google.set('google-token-other', identity);
    const res = await post('/auth/google', { idToken: 'google-token-valid' });
    expect(res.status).toBe(401);
    ctx.google.set('google-token-valid', identity);
    const ok = await post('/auth/google', { idToken: 'google-token-valid' });
    expect(ok.status).toBe(200);
    expect(ok.body.user).toMatchObject({ emailVerified: true, hasPassword: false, googleLinked: true });
    const again = await post('/auth/google', { idToken: 'google-token-valid' });
    expect(again.body.user.id).toBe(ok.body.user.id);
  });

  it('lets the mailbox owner claim an unverified local account, removing the password and sessions', async () => {
    const squatter = await register();
    ctx.google.set('google-token-valid', identity);
    const claim = await post('/auth/google', { idToken: 'google-token-valid' });
    expect(claim.status).toBe(200);
    expect(claim.body.user).toMatchObject({ id: squatter.body.user.id, hasPassword: false, emailVerified: true });
    expect((await get('/auth/me', squatter.body.token)).status).toBe(401);
    expect((await post('/auth/login', { email: 'an@example.com', password: GOOD })).status).toBe(401);
  });

  it('refuses to take over a verified account and links from settings instead', async () => {
    const reg = await register();
    await post('/auth/verify-email', { token: linkFrom(ctx.mail.sent[0]?.text ?? '') });
    ctx.google.set('google-token-valid', identity);
    const res = await post('/auth/google', { idToken: 'google-token-valid' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ACCOUNT_EXISTS');

    const link = await post('/auth/link-google', { idToken: 'google-token-valid' }, reg.body.token);
    expect(link.status).toBe(200);
    expect(link.body.user.googleLinked).toBe(true);
    expect((await post('/auth/google', { idToken: 'google-token-valid' })).body.user.id).toBe(reg.body.user.id);
  });

  it('refuses to link a Google account that belongs to someone else', async () => {
    ctx.google.set('google-token-valid', identity);
    await post('/auth/google', { idToken: 'google-token-valid' });
    const other = await register('b@example.com');
    const res = await post('/auth/link-google', { idToken: 'google-token-valid' }, other.body.token);
    expect(res.body.error.code).toBe('GOOGLE_IN_USE');
  });
});
