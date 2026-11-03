/** Small S3 interface the workflow functions need, so handlers can be tested with fakes. */
import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface ObjectStore {
  getJson<T>(bucket: string, key: string): Promise<T>;
  getRange(bucket: string, key: string, bytes: number): Promise<Uint8Array>;
  putText(bucket: string, key: string, body: string, contentType: string, cacheControl?: string): Promise<void>;
  list(bucket: string, prefix: string): Promise<string[]>;
  presignGet(bucket: string, key: string, expiresInSec: number): Promise<string>;
}

export function s3Store(client = new S3Client({})): ObjectStore {
  return {
    async getJson<T>(bucket: string, key: string): Promise<T> {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      return JSON.parse(await out.Body!.transformToString()) as T;
    },
    async getRange(bucket: string, key: string, bytes: number): Promise<Uint8Array> {
      const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=0-${bytes - 1}` }));
      return out.Body!.transformToByteArray();
    },
    async putText(bucket: string, key: string, body: string, contentType: string, cacheControl?: string): Promise<void> {
      await client.send(new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ...(cacheControl ? { CacheControl: cacheControl } : {}),
      }));
    },
    async list(bucket: string, prefix: string): Promise<string[]> {
      const keys: string[] = [];
      let token: string | undefined;
      do {
        const out = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        for (const o of out.Contents ?? []) if (o.Key) keys.push(o.Key);
        token = out.IsTruncated ? out.NextContinuationToken : undefined;
      } while (token);
      return keys;
    },
    presignGet(bucket: string, key: string, expiresInSec: number): Promise<string> {
      return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSec });
    },
  };
}

/** Environment variable that must be set; read once at cold start. */
export function required(name: string): string {
  const value = new Map(Object.entries(process.env)).get(name);
  if (!value) throw new Error(`missing environment variable ${name}`);
  return value;
}
