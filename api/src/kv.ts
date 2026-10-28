/**
 * Hot key-value data in DynamoDB (ADR-17): fixed-window counters and one-time marks with TTL.
 * The interface lets tests use an in-memory implementation with the same semantics.
 */
import { ConditionalCheckFailedException, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

export interface Kv {
  /** Adds one to the counter of a window and returns the new count; the item expires at `expiresAt`. */
  increment(table: string, pk: string, expiresAt: Date): Promise<number>;
  /** Writes a mark unless a live one exists; returns false when a live mark was already there. */
  markOnce(table: string, pk: string, expiresAt: Date, now: Date): Promise<boolean>;
}

const epoch = (d: Date): number => Math.floor(d.getTime() / 1000);

export function dynamoKv(client = DynamoDBDocumentClient.from(new DynamoDBClient({}))): Kv {
  return {
    async increment(table, pk, expiresAt) {
      const out = await client.send(new UpdateCommand({
        TableName: table,
        Key: { pk },
        UpdateExpression: 'ADD #c :one SET expiresAt = if_not_exists(expiresAt, :exp)',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1, ':exp': epoch(expiresAt) },
        ReturnValues: 'UPDATED_NEW',
      }));
      return Number(out.Attributes?.['count'] ?? 1);
    },
    async markOnce(table, pk, expiresAt, now) {
      try {
        // TTL deletion lags, so an expired item still present counts as absent.
        await client.send(new PutCommand({
          TableName: table,
          Item: { pk, expiresAt: epoch(expiresAt) },
          ConditionExpression: 'attribute_not_exists(pk) OR expiresAt < :now',
          ExpressionAttributeValues: { ':now': epoch(now) },
        }));
        return true;
      } catch (err) {
        if (err instanceof ConditionalCheckFailedException) return false;
        throw err;
      }
    },
  };
}

/** In-memory Kv for tests and local runs. */
export function memoryKv(): Kv & { items: Map<string, { count: number; expiresAt: number }> } {
  const items = new Map<string, { count: number; expiresAt: number }>();
  return {
    items,
    async increment(table, pk, expiresAt) {
      const key = `${table}|${pk}`;
      const item = items.get(key) ?? { count: 0, expiresAt: epoch(expiresAt) };
      item.count += 1;
      items.set(key, item);
      return item.count;
    },
    async markOnce(table, pk, expiresAt, now) {
      const key = `${table}|${pk}`;
      const item = items.get(key);
      if (item && item.expiresAt >= epoch(now)) return false;
      items.set(key, { count: 1, expiresAt: epoch(expiresAt) });
      return true;
    },
  };
}
