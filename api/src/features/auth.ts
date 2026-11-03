/**
 * Accounts: register, sign in (password or Google), e-mail verification, password reset and
 * change, sign out everywhere, and the current user.
 *
 * Sessions are bearer tokens tied to the user's tokenVersion; signing out, changing or
 * resetting the password and a Google claim bump it, which revokes every older token.
 */
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { MongoServerError, ObjectId, type Collection } from 'mongodb';
import { z } from 'zod';
import type { Request } from 'express';
import type { Feature } from '../app.js';
import { PROBLEM_MESSAGES, passwordProblem } from '../auth/passwords.js';
import { badRequest, conflict, HttpError, notFound, unauthorized } from '../http/errors.js';
import { rateLimit, requireUser } from '../http/middleware.js';
import { HANDLE_RE, RESERVED_HANDLES, handleBase, selfView, type UserDoc } from '../model/user.js';

const email = z.string().trim().toLowerCase().max(254).email();
const password = z.string().min(1).max(200);
const displayName = z.string().trim().min(1).max(50);
const handle = z.string().trim().toLowerCase().regex(HANDLE_RE, 'Use 3-30 letters, digits, dots or underscores');
const token = z.string().min(20).max(200);

const registerBody = z.object({ email, password, displayName, handle: handle.optional() });
const loginBody = z.object({ email, password });
const googleBody = z.object({ idToken: z.string().min(10).max(4096) });
const emailBody = z.object({ email });
const resetBody = z.object({ token, password });
const changeBody = z.object({ currentPassword: password.optional(), newPassword: password });
const verifyBody = z.object({ token });

const HOUR = 3600;
export const TOKEN_TTL_SEC = { verify: 24 * HOUR, reset: HOUR } as const;
type TokenKind = keyof typeof TOKEN_TTL_SEC;

/** Mails per recipient and kind in one hour; extra requests still answer 202. */
export const MAILS_PER_RECIPIENT_HOUR = 3;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const emailKey = (req: Request) => {
  const parsed = email.safeParse((req.body as { email?: unknown } | undefined)?.email);
  return `e:${parsed.success ? parsed.data : 'invalid'}`;
};

export const authFeature: Feature = (r, deps) => {
  const { config, kv, now } = deps;
  const users = deps.db.collection<UserDoc>('users');
  const tokens = deps.db.collection('emailTokens');
  const limit = (scope: string, max: number, windowSec: number, key?: (req: Request) => string) =>
    rateLimit(kv, config.tables.rateLimits, { scope, limit: max, windowSec, ...(key ? { key } : {}) }, now);

  const ipKey = (req: Request) => `ip:${req.clientKey}`;

  async function checkNewPassword(pw: string, identity: { email?: string; handle?: string }) {
    const problem = passwordProblem(pw, identity);
    if (problem) throw badRequest('WEAK_PASSWORD', PROBLEM_MESSAGES.get(problem) ?? 'Choose another password', { reason: problem });
    const breaches = await deps.passwords.breaches(pw);
    if (breaches === null) deps.log({ level: 'warn', msg: 'breached-password check unavailable' });
    if (breaches) throw badRequest('WEAK_PASSWORD', PROBLEM_MESSAGES.get('breached') ?? 'Choose another password', { reason: 'breached' });
  }

  const session = (u: UserDoc) => ({
    token: deps.tokens.access({ sub: u._id.toHexString(), role: u.role, tv: u.tokenVersion }),
    user: selfView(u),
  });

  /** Sends a one-time link, at most a few per recipient and hour; never throws. */
  async function sendLink(u: UserDoc, kind: TokenKind): Promise<void> {
    const hourStart = Math.floor(now().getTime() / (HOUR * 1000)) * HOUR * 1000;
    const count = await kv.increment(config.tables.rateLimits, `mail-${kind}#${u.email}#${hourStart}`, new Date(hourStart + HOUR * 1000));
    if (count > MAILS_PER_RECIPIENT_HOUR) return;
    const raw = randomBytes(32).toString('base64url');
    // Only the newest link of a kind works.
    await tokens.deleteMany({ user: u._id, kind, usedAt: null });
    await tokens.insertOne({ user: u._id, kind, tokenHash: sha256(raw), createdAt: now(), expiresAt: new Date(now().getTime() + (kind === 'verify' ? TOKEN_TTL_SEC.verify : TOKEN_TTL_SEC.reset) * 1000), usedAt: null });
    const link = `${config.webBaseUrl}/${kind === 'verify' ? 'verify-email' : 'reset-password'}?token=${raw}`;
    const message = kind === 'verify'
      ? { subject: 'Confirm your e-mail address', text: `Hi ${u.displayName},\n\nConfirm your address within 24 hours:\n${link}\n\nIf you did not create an account, ignore this message.` }
      : { subject: 'Reset your password', text: `Hi ${u.displayName},\n\nSet a new password within one hour:\n${link}\n\nIf you did not ask for this, ignore this message; your password stays the same.` };
    await deps.mail.send({ to: u.email, ...message });
  }

  /** Marks a token used and returns its user id, or throws when it is unknown, used or expired. */
  async function consume(raw: string, kind: TokenKind): Promise<ObjectId> {
    const t = await tokens.findOneAndUpdate(
      { tokenHash: sha256(raw), kind, usedAt: null, expiresAt: { $gt: now() } },
      { $set: { usedAt: now() } },
    );
    if (!t) throw badRequest('INVALID_TOKEN', 'This link is invalid or has expired');
    return t['user'] as ObjectId;
  }

  r.post('/auth/register', limit('register', 5, HOUR, ipKey), async (req, res) => {
    const body = registerBody.parse(req.body);
    await checkNewPassword(body.password, { email: body.email, ...(body.handle ? { handle: body.handle } : {}) });
    if (body.handle && RESERVED_HANDLES.has(body.handle)) throw conflict('HANDLE_TAKEN', 'This handle is not available');
    const passwordHash = await deps.passwords.hash(body.password);
    const at = now();
    const doc = await insertUser(users, {
      email: body.email, emailVerified: false, passwordHash, googleSub: null,
      displayName: body.displayName, avatar: null, banner: null, description: '', role: 'user',
      tokenVersion: 0, disabled: false, notifyByEmail: true, counters: { subscribers: 0, videos: 0 },
      createdAt: at, updatedAt: at,
    }, body.handle ?? handleBase(body.email.split('@')[0] ?? ''), !body.handle);
    await sendLink(doc, 'verify').catch((err: unknown) => deps.log({ level: 'error', msg: 'verification mail failed', error: String(err) }));
    res.status(201).json(session(doc));
  });

  r.post('/auth/login', limit('login-ip', 20, 15 * 60, ipKey), limit('login-email', 10, 15 * 60, emailKey), async (req, res) => {
    const body = loginBody.parse(req.body);
    const u = await users.findOne({ email: body.email });
    const ok = await deps.passwords.verify(body.password, u?.passwordHash);
    if (!u || !ok) throw new HttpError(401, 'INVALID_CREDENTIALS', 'The e-mail or password is wrong');
    if (u.disabled) throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
    res.json(session(u));
  });

  r.post('/auth/google', limit('google', 20, 15 * 60, ipKey), async (req, res) => {
    const { idToken } = googleBody.parse(req.body);
    const g = await deps.google(idToken);
    if (!g) throw unauthorized('Google sign-in failed');
    const at = now();

    let u = await users.findOne({ googleSub: g.sub });
    if (!u) {
      const local = await users.findOne({ email: g.email });
      if (local && local.emailVerified) {
        // Someone proved this mailbox already; linking needs their password session.
        throw conflict('ACCOUNT_EXISTS', 'An account with this e-mail exists; sign in and link Google in settings');
      }
      if (local) {
        // The Google user owns the mailbox, so an unverified local account is theirs: claim it,
        // drop the password whoever set it, and revoke its sessions.
        u = await users.findOneAndUpdate(
          { _id: local._id, emailVerified: false },
          { $set: { googleSub: g.sub, emailVerified: true, passwordHash: null, updatedAt: at }, $inc: { tokenVersion: 1 } },
          { returnDocument: 'after' },
        );
        if (!u) throw conflict('ACCOUNT_EXISTS', 'Try again');
        deps.sessions.forget(u._id.toHexString());
      } else {
        u = await insertUser(users, {
          email: g.email, emailVerified: true, passwordHash: null, googleSub: g.sub,
          displayName: g.name.slice(0, 50), avatar: g.picture, banner: null, description: '', role: 'user',
          tokenVersion: 0, disabled: false, notifyByEmail: true, counters: { subscribers: 0, videos: 0 },
          createdAt: at, updatedAt: at,
        }, handleBase(g.email.split('@')[0] ?? ''), true);
      }
    }
    if (u.disabled) throw new HttpError(403, 'ACCOUNT_DISABLED', 'This account has been disabled');
    res.json(session(u));
  });

  r.post('/auth/link-google', requireUser, limit('google', 20, 15 * 60, ipKey), async (req, res) => {
    const { idToken } = googleBody.parse(req.body);
    const g = await deps.google(idToken);
    if (!g) throw unauthorized('Google sign-in failed');
    const me = await mustFind(users, req);
    if (me.googleSub === g.sub) return void res.json({ user: selfView(me) });
    if (me.googleSub) throw conflict('GOOGLE_ALREADY_LINKED', 'Another Google account is linked; unlink it first');
    if (await users.findOne({ googleSub: g.sub }, { projection: { _id: 1 } })) {
      throw conflict('GOOGLE_IN_USE', 'This Google account belongs to another user');
    }
    // Linking a Google mailbox that matches the account e-mail also proves that address.
    const u = await users.findOneAndUpdate(
      { _id: me._id, googleSub: null },
      { $set: { googleSub: g.sub, updatedAt: now(), ...(g.email === me.email ? { emailVerified: true } : {}) } },
      { returnDocument: 'after' },
    );
    if (!u) throw conflict('GOOGLE_ALREADY_LINKED', 'Try again');
    res.json({ user: selfView(u) });
  });

  r.post('/auth/verify-email', limit('verify', 20, 15 * 60, ipKey), async (req, res) => {
    const { token: raw } = verifyBody.parse(req.body);
    const userId = await consume(raw, 'verify');
    await users.updateOne({ _id: userId }, { $set: { emailVerified: true, updatedAt: now() } });
    res.json({ verified: true });
  });

  r.post('/auth/resend-verification', requireUser, limit('resend', 5, HOUR), async (req, res) => {
    const me = await mustFind(users, req);
    if (!me.emailVerified) await sendLink(me, 'verify');
    res.status(202).json({ sent: !me.emailVerified });
  });

  r.post('/auth/forgot-password', limit('forgot', 5, HOUR, ipKey), async (req, res) => {
    const body = emailBody.parse(req.body);
    const u = await users.findOne({ email: body.email });
    // Same answer whether or not the account exists.
    if (u && !u.disabled) await sendLink(u, 'reset');
    res.status(202).json({ sent: true });
  });

  r.post('/auth/reset-password', limit('reset', 10, 15 * 60, ipKey), async (req, res) => {
    const body = resetBody.parse(req.body);
    const t = await tokens.findOne({ tokenHash: sha256(body.token), kind: 'reset', usedAt: null, expiresAt: { $gt: now() } });
    if (!t) throw badRequest('INVALID_TOKEN', 'This link is invalid or has expired');
    const target = await users.findOne({ _id: t['user'] as ObjectId });
    if (!target) throw badRequest('INVALID_TOKEN', 'This link is invalid or has expired');
    // Check before the token is spent, so a weak password does not burn the link.
    await checkNewPassword(body.password, { email: target.email, handle: target.handle });
    const userId = await consume(body.token, 'reset');
    const u = await users.findOneAndUpdate(
      { _id: userId },
      // The link reached the mailbox, which proves the address too.
      { $set: { passwordHash: await deps.passwords.hash(body.password), emailVerified: true, updatedAt: now() }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    );
    if (!u) throw notFound('Account');
    deps.sessions.forget(u._id.toHexString());
    res.json(session(u));
  });

  r.post('/auth/change-password', requireUser, limit('change-password', 10, 15 * 60), async (req, res) => {
    const body = changeBody.parse(req.body);
    const me = await mustFind(users, req);
    if (me.passwordHash) {
      if (!body.currentPassword || !(await deps.passwords.verify(body.currentPassword, me.passwordHash))) {
        throw new HttpError(401, 'INVALID_CREDENTIALS', 'The current password is wrong');
      }
    }
    await checkNewPassword(body.newPassword, { email: me.email, handle: me.handle });
    const u = await users.findOneAndUpdate(
      { _id: me._id, tokenVersion: me.tokenVersion },
      { $set: { passwordHash: await deps.passwords.hash(body.newPassword), updatedAt: now() }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    );
    if (!u) throw unauthorized('Your session has expired, sign in again');
    deps.sessions.forget(u._id.toHexString());
    res.json(session(u));
  });

  r.post('/auth/logout', requireUser, async (req, res) => {
    const id = new ObjectId(req.user?.id);
    await users.updateOne({ _id: id }, { $inc: { tokenVersion: 1 }, $set: { updatedAt: now() } });
    deps.sessions.forget(id.toHexString());
    res.status(204).end();
  });

  r.get('/auth/me', requireUser, async (req, res) => {
    res.json({ user: selfView(await mustFind(users, req)) });
  });
};

async function mustFind(users: Collection<UserDoc>, req: Request): Promise<UserDoc> {
  const u = req.user && ObjectId.isValid(req.user.id) ? await users.findOne({ _id: new ObjectId(req.user.id) }) : null;
  if (!u) throw unauthorized();
  return u;
}

const isDuplicate = (err: unknown, index: string) =>
  err instanceof MongoServerError && err.code === 11000 && String(err.message).includes(index);

/**
 * Inserts a user with a handle. A requested handle that is taken is a 409; a generated one gets
 * a random four-digit suffix and is tried again.
 */
async function insertUser(users: Collection<UserDoc>, fields: Omit<UserDoc, '_id' | 'handle'>, wanted: string, generated: boolean): Promise<UserDoc> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const candidate = attempt === 0 && !RESERVED_HANDLES.has(wanted) ? wanted : `${wanted.slice(0, 24)}${randomInt(1000, 10000)}`;
    const doc = { _id: new ObjectId(), ...fields, handle: candidate };
    try {
      await users.insertOne(doc);
      return doc;
    } catch (err) {
      if (isDuplicate(err, 'email_unique')) throw conflict('EMAIL_TAKEN', 'An account with this e-mail already exists');
      if (!isDuplicate(err, 'handle_unique')) throw err;
      if (!generated) throw conflict('HANDLE_TAKEN', 'This handle is not available');
    }
  }
  throw conflict('HANDLE_TAKEN', 'Choose a handle');
}
