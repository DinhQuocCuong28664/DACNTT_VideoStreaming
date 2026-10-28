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
    db.collection('videos').createIndexes([
      { key: { owner: 1, createdAt: -1 }, name: 'owner_recent' },
      // Public listing: ready, public, approved, newest first.
      { key: { status: 1, visibility: 1, 'moderation.status': 1, processedAt: -1 }, name: 'feed' },
      // The daily reconciler finds abandoned drafts.
      { key: { status: 1, 'upload.startedAt': 1 }, name: 'drafts' },
    ]),
    db.collection('comments').createIndexes([
      { key: { video: 1, parent: 1, pinned: 1, _id: -1 }, name: 'thread' },
      { key: { parent: 1, _id: 1 }, name: 'replies' },
      { key: { openReports: -1, _id: -1 }, name: 'reported', partialFilterExpression: { openReports: { $gt: 0 } } },
    ]),
    db.collection('reactions').createIndexes([
      { key: { video: 1, user: 1 }, name: 'one_per_user', unique: true },
      { key: { video: 1, kind: 1 }, name: 'count' },
    ]),
    db.collection('commentReports').createIndexes([
      { key: { comment: 1, reporter: 1 }, name: 'one_open_per_reporter', unique: true, partialFilterExpression: { status: 'open' } },
      { key: { status: 1, createdAt: -1 }, name: 'queue' },
    ]),
    db.collection('subscriptions').createIndexes([
      { key: { subscriber: 1, channel: 1 }, name: 'pair_unique', unique: true },
      { key: { channel: 1 }, name: 'by_channel' },
    ]),
    db.collection('membershipTiers').createIndexes([
      { key: { channel: 1, level: 1 }, name: 'active_level_unique', unique: true, partialFilterExpression: { active: true } },
    ]),
    db.collection('memberships').createIndexes([
      { key: { member: 1, channel: 1 }, name: 'pair_unique', unique: true },
      { key: { channel: 1, expiresAt: -1 }, name: 'roster' },
    ]),
    db.collection('playlists').createIndexes([
      { key: { owner: 1, kind: 1 }, name: 'one_watch_later', unique: true, partialFilterExpression: { kind: 'watch_later' } },
      { key: { owner: 1, updatedAt: -1 }, name: 'by_owner' },
      { key: { 'items.video': 1 }, name: 'by_video' },
    ]),
    db.collection('emailTokens').createIndexes([
      { key: { tokenHash: 1 }, name: 'token_unique', unique: true },
      { key: { user: 1, kind: 1 }, name: 'user_kind' },
      // Expired tokens disappear on their own.
      { key: { expiresAt: 1 }, name: 'expiry_ttl', expireAfterSeconds: 0 },
    ]),
  ]);
}
