import type { Db } from 'mongodb';
import { createApp, type Deps, type Feature } from '../src/app.js';
import { loadConfig, type Config } from '../src/config.js';
import { memoryKv } from '../src/kv.js';
import { Tokens } from '../src/auth/tokens.js';
import { cachedSessions, type SessionInfo } from '../src/http/middleware.js';

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
}

/** Builds the app with in-memory fakes; pass `db` for features that need MongoDB. */
export function testApp(features: readonly Feature[] = [], opts: { db?: Db; config?: Config } = {}) {
  const clock = { now: new Date('2026-11-02T10:00:00Z') };
  const kv = memoryKv();
  const users = new Map<string, SessionInfo>();
  const deps: Deps = {
    config: opts.config ?? testConfig(),
    db: opts.db ?? ({} as Db),
    kv,
    tokens: new Tokens('j'.repeat(40), () => clock.now),
    sessions: cachedSessions(async (id) => users.get(id) ?? null, 0),
    log: () => undefined,
    now: () => clock.now,
  };
  const ctx: TestContext = { deps, kv, users, clock };
  return { app: createApp(deps, features), ctx };
}
