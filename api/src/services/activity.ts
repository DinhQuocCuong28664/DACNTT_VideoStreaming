/**
 * Per-user activity in DynamoDB (ADR-17): watch progress (resume and history), analytics
 * heartbeats per hour and video, and notifications. Each store has an in-memory twin for tests.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';

export interface Progress { videoId: string; positionSec: number; durationSec: number; updatedAt: string }
export interface Page<T> { items: T[]; next: string | null }

export interface WatchStore {
  put(userId: string, p: Progress): Promise<void>;
  get(userId: string, videoId: string): Promise<Progress | null>;
  /** Newest first. */
  history(userId: string, limit: number, cursor: string | null): Promise<Page<Progress>>;
  remove(userId: string, videoId: string): Promise<void>;
  clear(userId: string): Promise<number>;
}

/** Twenty retention buckets: each heartbeat adds one to the bucket of its position. */
export const RETENTION_BUCKETS = 20;
export interface HeartbeatStore {
  add(hour: string, videoId: string, watchedSec: number, bucket: number, expiresAt: Date): Promise<void>;
}

export interface Notification { id: string; type: string; createdAt: string; read: boolean; data: Record<string, unknown> }
export interface NotificationStore {
  list(userId: string, limit: number, cursor: string | null): Promise<Page<Notification>>;
  markRead(userId: string, ids: string[]): Promise<void>;
  unread(userId: string): Promise<number>;
}

const encode = (key: Record<string, unknown> | undefined) => (key ? Buffer.from(JSON.stringify(key)).toString('base64url') : null);
const decode = (cursor: string | null): Record<string, unknown> | undefined => {
  if (!cursor) return undefined;
  try {
    const v: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    return v && typeof v === 'object' ? (v as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
};

export function dynamoActivity(tables: { watchProgress: string; heartbeats: string; notifications: string }, client = DynamoDBDocumentClient.from(new DynamoDBClient({}))) {
  const watch: WatchStore = {
    async put(userId, p) {
      await client.send(new PutCommand({ TableName: tables.watchProgress, Item: { userId, ...p } }));
    },
    async get(userId, videoId) {
      const out = await client.send(new GetCommand({ TableName: tables.watchProgress, Key: { userId, videoId } }));
      return (out.Item as Progress | undefined) ?? null;
    },
    async history(userId, limit, cursor) {
      const out = await client.send(new QueryCommand({
        TableName: tables.watchProgress, IndexName: 'by_recent',
        KeyConditionExpression: 'userId = :u', ExpressionAttributeValues: { ':u': userId },
        ScanIndexForward: false, Limit: limit, ExclusiveStartKey: decode(cursor),
      }));
      return { items: (out.Items ?? []) as Progress[], next: encode(out.LastEvaluatedKey) };
    },
    async remove(userId, videoId) {
      await client.send(new DeleteCommand({ TableName: tables.watchProgress, Key: { userId, videoId } }));
    },
    async clear(userId) {
      let removed = 0;
      let start: Record<string, unknown> | undefined;
      do {
        const out = await client.send(new QueryCommand({
          TableName: tables.watchProgress, KeyConditionExpression: 'userId = :u', ExpressionAttributeValues: { ':u': userId },
          ProjectionExpression: 'videoId', ExclusiveStartKey: start, Limit: 25,
        }));
        const keys = (out.Items ?? []).map((i) => ({ DeleteRequest: { Key: { userId, videoId: i['videoId'] } } }));
        if (keys.length) await client.send(new BatchWriteCommand({ RequestItems: { [tables.watchProgress]: keys } }));
        removed += keys.length;
        start = out.LastEvaluatedKey;
      } while (start);
      return removed;
    },
  };
  const heartbeats: HeartbeatStore = {
    async add(hour, videoId, watchedSec, bucket, expiresAt) {
      await client.send(new UpdateCommand({
        TableName: tables.heartbeats, Key: { hour, videoId },
        UpdateExpression: 'ADD watchSeconds :w, beats :one, #b :one SET expiresAt = if_not_exists(expiresAt, :exp)',
        ExpressionAttributeNames: { '#b': `r${String(bucket).padStart(2, '0')}` },
        ExpressionAttributeValues: { ':w': watchedSec, ':one': 1, ':exp': Math.floor(expiresAt.getTime() / 1000) },
      }));
    },
  };
  const notifications: NotificationStore = {
    async list(userId, limit, cursor) {
      const out = await client.send(new QueryCommand({
        TableName: tables.notifications, KeyConditionExpression: 'userId = :u', ExpressionAttributeValues: { ':u': userId },
        ScanIndexForward: false, Limit: limit, ExclusiveStartKey: decode(cursor),
      }));
      const items = (out.Items ?? []).map((i) => ({ id: String(i['sk']), type: String(i['type']), createdAt: String(i['createdAt']), read: Boolean(i['read']), data: (i['data'] as Record<string, unknown>) ?? {} }));
      return { items, next: encode(out.LastEvaluatedKey) };
    },
    async markRead(userId, ids) {
      await Promise.all(ids.map((sk) => client.send(new UpdateCommand({
        TableName: tables.notifications, Key: { userId, sk },
        UpdateExpression: 'SET #r = :t', ConditionExpression: 'attribute_exists(sk)',
        ExpressionAttributeNames: { '#r': 'read' }, ExpressionAttributeValues: { ':t': true },
      })).catch((err: unknown) => {
        if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
      })));
    },
    async unread(userId) {
      // Notifications expire after 90 days, so one partition stays small.
      const out = await client.send(new QueryCommand({
        TableName: tables.notifications, KeyConditionExpression: 'userId = :u', FilterExpression: '#r = :f',
        ExpressionAttributeNames: { '#r': 'read' }, ExpressionAttributeValues: { ':u': userId, ':f': false }, Select: 'COUNT',
      }));
      return out.Count ?? 0;
    },
  };
  return { watch, heartbeats, notifications };
}
export type Activity = ReturnType<typeof dynamoActivity>;

export function memoryActivity() {
  const progress = new Map<string, Map<string, Progress>>();
  const beats = new Map<string, Map<string, number>>();
  const notes = new Map<string, Notification[]>();
  const paged = <T>(all: T[], limit: number, cursor: string | null): Page<T> => {
    const start = cursor ? Number(cursor) : 0;
    const items = all.slice(start, start + limit);
    return { items, next: start + limit < all.length ? String(start + limit) : null };
  };
  const activity: Activity = {
    watch: {
      async put(userId, p) { const m = progress.get(userId) ?? new Map(); m.set(p.videoId, p); progress.set(userId, m); },
      async get(userId, videoId) { return progress.get(userId)?.get(videoId) ?? null; },
      async history(userId, limit, cursor) {
        const all = [...(progress.get(userId)?.values() ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        return paged(all, limit, cursor);
      },
      async remove(userId, videoId) { progress.get(userId)?.delete(videoId); },
      async clear(userId) { const n = progress.get(userId)?.size ?? 0; progress.delete(userId); return n; },
    },
    heartbeats: {
      async add(hour, videoId, watchedSec, bucket) {
        const k = `${hour}|${videoId}`;
        const row = beats.get(k) ?? new Map<string, number>();
        const add = (name: string, n: number) => row.set(name, (row.get(name) ?? 0) + n);
        add('watchSeconds', watchedSec);
        add('beats', 1);
        add(`r${String(bucket).padStart(2, '0')}`, 1);
        beats.set(k, row);
      },
    },
    notifications: {
      async list(userId, limit, cursor) {
        const all = [...(notes.get(userId) ?? [])].sort((a, b) => b.id.localeCompare(a.id));
        return paged(all, limit, cursor);
      },
      async markRead(userId, ids) { for (const n of notes.get(userId) ?? []) if (ids.includes(n.id)) n.read = true; },
      async unread(userId) { return (notes.get(userId) ?? []).filter((n) => !n.read).length; },
    },
  };
  return { activity, progress, beats, notes };
}
