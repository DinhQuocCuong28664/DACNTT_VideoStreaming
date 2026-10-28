import type { Db } from 'mongodb';
import { createApp, type Deps, type Feature } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { memoryKv } from '../src/kv.js';
import { Tokens } from '../src/auth/tokens.js';
import { cachedSessions, type SessionInfo } from '../src/http/middleware.js';
import { bcryptPasswords } from '../src/auth/passwords.js';
import type { GoogleIdentity } from '../src/auth/google.js';
import { memoryMailer } from '../src/services/mail.js';

export const ORIGIN_SECRET = 'o'.repeat(40);
export const WEB = 'https://v2-staging.zelostech.site';

export function testConfig(overrides: Record<string, string> = {}): Config {
  return loadConfig({
    APP_ENV: 'test',
    DB_NAME: 'zelos_test',
    WEB_ORIGINS: WEB,
    WEB_BASE_URL: WEB,
    API_BASE_URL: 'https://api-v2-staging.zelostech.site/v1',
    CDN_BASE_URL: 'https://cdn.example.test',
    RAW_BUCKET: 'raw', PROCESSED_BUCKET: 'processed', KEYS_BUCKET: 'keys',
    TABLE_RATE_LIMITS: 'rl', TABLE_VIEW_MARKS: 'vm', TABLE_WATCH_PROGRESS: 'wp',
    TABLE_HEARTBEATS: 'hb', TABLE_NOTIFICATIONS: 'nt',
    ...overrides,
  }, JSON.stringify({ mongodbUri: 'mongodb://unused', jwtSecret: 'j'.repeat(40), originSecret: ORIGIN_SECRET }));
}

export interface TestContext {
  deps: Deps;
  kv: ReturnType<typeof memoryKv>;
  users: Map<string, SessionInfo>;
  clock: { now: Date };
  mail: ReturnType<typeof memoryMailer>;
  /** idToken -> identity accepted by the fake Google verifier. */
  google: Map<string, GoogleIdentity>;
  /** password -> breach count returned by the fake Pwned Passwords check. */
  breached: Map<string, number | null>;
}

/** Builds the app with in-memory fakes; pass `db` for features that need MongoDB. */
export function testApp(features: readonly Feature[] = [], opts: { db?: Db; config?: Config; sessions?: (id: string) => Promise<SessionInfo | null> } = {}) {
  const clock = { now: new Date('2026-11-02T10:00:00Z') };
  const kv = memoryKv();
  const users = new Map<string, SessionInfo>();
  const mail = memoryMailer();
  const google = new Map<string, GoogleIdentity>();
  const breached = new Map<string, number | null>();
  const bcrypt = bcryptPasswords(4);
  const deps: Deps = {
    config: opts.config ?? testConfig(),
    db: opts.db ?? ({} as Db),
    kv,
    tokens: new Tokens('j'.repeat(40), () => clock.now),
    sessions: cachedSessions(opts.sessions ?? (async (id) => users.get(id) ?? null), 0),
    log: () => undefined,
    now: () => clock.now,
    passwords: { hash: bcrypt.hash, verify: bcrypt.verify, breaches: async (p) => (breached.has(p) ? breached.get(p) ?? null : 0) },
    google: async (t) => google.get(t) ?? null,
    mail,
  };
  const ctx: TestContext = { deps, kv, users, clock, mail, google, breached };
  return { app: createApp(deps, features), ctx };
}

/** One in-memory mongod per test file; each call returns a fresh database with indexes. */
export async function memoryDb() {
  const { MongoMemoryServer } = await import('mongodb-memory-server');
  const { MongoClient } = await import('mongodb');
  const { ensureIndexes } = await import('../src/db.js');
  const server = await MongoMemoryServer.create();
  const client = await MongoClient.connect(server.getUri());
  let n = 0;
  return {
    async fresh() {
      n += 1;
      const db = client.db(`t${n}`);
      await ensureIndexes(db);
      return db;
    },
    async stop() {
      await client.close();
      await server.stop();
    },
  };
}
