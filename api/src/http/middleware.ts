/** Cross-cutting middleware: origin check, CORS, authentication and rate limits. */
import { timingSafeEqual, createHash } from 'node:crypto';
import type { Request, RequestHandler } from 'express';
import type { Kv } from '../kv.js';
import type { Role, Tokens } from '../auth/tokens.js';
import { clientIp, ipRateKey } from './clientIp.js';
import { forbidden, tooMany, unauthorized } from './errors.js';

export interface AuthUser { id: string; role: Role }

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by `authenticate` when a valid access token was sent. */
    user?: AuthUser;
    /** Client address grouping for limits (IPv4 or IPv6 /56). */
    clientKey: string;
  }
}

const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Only the Cloudflare Worker knows the origin secret, so direct calls to the Function URL are
 * refused. Comparing hashes keeps the comparison constant-time for any input length.
 * Health routes stay open for uptime checks.
 */
export function originVerify(secret: string, required: boolean): RequestHandler {
  const expected = digest(secret);
  return (req, _res, next) => {
    const sent = req.get('x-origin-verify');
    const ok = sent !== undefined && timingSafeEqual(digest(sent), expected);
    req.clientKey = ipRateKey(clientIp(req, ok));
    if (ok || !required || req.path === '/health') return next();
    next(forbidden('ORIGIN_REQUIRED', 'Use the public API address'));
  };
}

/**
 * CORS for the web origins. The API uses bearer tokens, never cookies, so credentials are off.
 * A preflight from another origin gets 403; a simple request from it simply lacks the headers.
 */
export function cors(origins: readonly string[]): RequestHandler {
  const allowed = new Set(origins);
  return (req, res, next) => {
    const origin = req.get('origin');
    res.vary('Origin');
    const ok = origin !== undefined && allowed.has(origin);
    if (ok) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Expose-Headers', 'Retry-After');
    }
    if (req.method !== 'OPTIONS') return next();
    if (!ok) return next(forbidden('ORIGIN_NOT_ALLOWED', 'This origin may not call the API'));
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Playback-Token,X-Unlock-Token');
    res.setHeader('Access-Control-Max-Age', '600');
    res.status(204).end();
  };
}

/** What authentication needs to know about a user, read from the database. */
export interface SessionInfo { tokenVersion: number; role: Role; disabled: boolean }
export type SessionLookup = (userId: string) => Promise<SessionInfo | null>;

/**
 * Wraps a lookup with a short per-instance cache. Revocation (logout, password change, ban)
 * reaches other warm instances within `ttlMs`; the instance that made the change calls `forget`.
 */
export function cachedSessions(lookup: SessionLookup, ttlMs = 30_000, now: () => number = Date.now) {
  const cache = new Map<string, { at: number; info: SessionInfo | null }>();
  return {
    async get(userId: string): Promise<SessionInfo | null> {
      const hit = cache.get(userId);
      if (hit && now() - hit.at < ttlMs) return hit.info;
      const info = await lookup(userId);
      if (cache.size > 5000) cache.clear();
      cache.set(userId, { at: now(), info });
      return info;
    },
    forget(userId: string) { cache.delete(userId); },
  };
}
export type Sessions = ReturnType<typeof cachedSessions>;

/** Reads the bearer token when present. A bad or revoked token is a 401, not a guest. */
export function authenticate(tokens: Tokens, sessions: Sessions): RequestHandler {
  return async (req, _res, next) => {
    const header = req.get('authorization');
    if (!header) return next();
    const match = /^Bearer ([\w.-]+)$/.exec(header);
    const claims = match?.[1] ? tokens.verifyAccess(match[1]) : null;
    if (!claims) return next(unauthorized('Your session has expired, sign in again'));
    const info = await sessions.get(claims.sub);
    if (!info || info.disabled || info.tokenVersion !== claims.tv) {
      return next(unauthorized('Your session has expired, sign in again'));
    }
    req.user = { id: claims.sub, role: info.role };
    next();
  };
}

export const requireUser: RequestHandler = (req, _res, next) => next(req.user ? undefined : unauthorized());

export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized());
    next(roles.includes(req.user.role) ? undefined : forbidden());
  };
}

export interface LimitRule {
  /** Name of the bucket, part of the key. */
  scope: string;
  limit: number;
  windowSec: number;
  /** Defaults to the account when signed in, else the client address. */
  key?: (req: Request) => string;
}

/** Fixed-window limit counted in DynamoDB, so every Lambda instance shares it. */
export function rateLimit(kv: Kv, table: string, rule: LimitRule, now: () => Date = () => new Date()): RequestHandler {
  return async (req, _res, next) => {
    const who = rule.key ? rule.key(req) : req.user ? `u:${req.user.id}` : `ip:${req.clientKey}`;
    const t = now().getTime();
    const start = Math.floor(t / (rule.windowSec * 1000)) * rule.windowSec * 1000;
    const end = new Date(start + rule.windowSec * 1000);
    const count = await kv.increment(table, `${rule.scope}#${who}#${start}`, end);
    if (count > rule.limit) return next(tooMany(Math.max(1, Math.ceil((end.getTime() - t) / 1000))));
    next();
  };
}
