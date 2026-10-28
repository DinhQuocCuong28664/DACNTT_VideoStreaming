/**
 * MongoDB access. One client per Lambda instance with a small pool and idle release
 * (§5.8 connection budget). Collections are reached through `collections(db)` so names live in
 * one place.
 */
import { MongoClient, type Db } from 'mongodb';

let client: MongoClient | undefined;

export async function connect(uri: string, dbName: string, poolSize: number): Promise<Db> {
  client ??= new MongoClient(uri, {
    maxPoolSize: poolSize,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 10_000,
    appName: 'zelos-api',
  });
  await client.connect();
  return client.db(dbName);
}

export const COLLECTIONS = [
  'users', 'videos', 'comments', 'reactions', 'subscriptions', 'membershipTiers', 'memberships',
  'playlists', 'analyticsDaily', 'reports', 'appeals', 'auditSamples', 'moderationEvents', 'roleChanges',
  'emailTokens',
] as const;

/**
 * Indexes every feature relies on. createIndexes is a no-op for indexes that already exist, so
 * this runs on every cold start; each feature adds its own lines here.
 */
export async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection('users').createIndexes([
      { key: { email: 1 }, name: 'email_unique', unique: true },
      { key: { handle: 1 }, name: 'handle_unique', unique: true },
      { key: { googleSub: 1 }, name: 'google_unique', unique: true, partialFilterExpression: { googleSub: { $type: 'string' } } },
    ]),
    db.collection('emailTokens').createIndexes([
      { key: { tokenHash: 1 }, name: 'token_unique', unique: true },
      { key: { user: 1, kind: 1 }, name: 'user_kind' },
      // Expired tokens disappear on their own.
      { key: { expiresAt: 1 }, name: 'expiry_ttl', expireAfterSeconds: 0 },
    ]),
  ]);
}
