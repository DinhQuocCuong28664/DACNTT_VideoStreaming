/**
 * Express application factory. Every dependency is passed in, so tests build the same app with
 * an in-memory database and fakes for AWS.
 */
import express, { Router } from 'express';
import helmet from 'helmet';
import type { Db } from 'mongodb';
import type { Config } from './config.js';
import type { Kv } from './kv.js';
import type { Tokens } from './auth/tokens.js';
import type { Passwords } from './auth/passwords.js';
import type { GoogleVerifier } from './auth/google.js';
import type { Mailer } from './services/mail.js';
import type { Storage } from './services/storage.js';
import type { Cdn } from './services/cdn.js';
import type { Activity } from './services/activity.js';
import { errorHandler, notFoundHandler } from './http/errors.js';
import { authenticate, cors, originVerify, rateLimit, type Sessions } from './http/middleware.js';

export type Log = (entry: Record<string, unknown>) => void;

export interface Deps {
  config: Config;
  db: Db;
  kv: Kv;
  tokens: Tokens;
  sessions: Sessions;
  log: Log;
  now: () => Date;
  passwords: Passwords;
  google: GoogleVerifier;
  mail: Mailer;
  storage: Storage;
  cdn: Cdn;
  activity: Activity;
}

/** A feature module adds its routes to the /v1 router. */
export type Feature = (router: Router, deps: Deps) => void;

/** Default limit for every API call; sensitive routes add tighter ones. */
export const GLOBAL_LIMIT = { scope: 'all', limit: 300, windowSec: 60 } as const;

export function createApp(deps: Deps, features: readonly Feature[] = []): express.Express {
  const { config } = deps;
  const app = express();
  app.disable('x-powered-by');
  app.set('etag', false);
  app.set('query parser', 'simple');

  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(originVerify(config.secrets.originSecret, config.requireOriginSecret));
  app.use(cors(config.webOrigins));
  app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });

  app.get('/health', (_req, res) => { res.json({ ok: true }); });

  const v1 = Router();
  v1.use(express.json({ limit: '64kb' }));
  v1.use(authenticate(deps.tokens, deps.sessions));
  v1.use(rateLimit(deps.kv, config.tables.rateLimits, GLOBAL_LIMIT, deps.now));
  v1.get('/health', (_req, res) => { res.json({ ok: true, env: config.env }); });
  for (const feature of features) feature(v1, deps);
  app.use('/v1', v1);

  app.use(notFoundHandler);
  app.use(errorHandler(deps.log));
  return app;
}
