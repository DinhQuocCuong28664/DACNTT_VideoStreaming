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
