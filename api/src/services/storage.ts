/**
 * The S3 operations the API needs, behind one interface so tests use an in-memory fake.
 */
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  NotFound,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type Part,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface PresignedPost { url: string; fields: Record<string, string> }
export interface UploadedPart { partNumber: number; size: number; etag: string }

export interface Storage {
  presignPost(bucket: string, key: string, opts: { size: number; contentType: string; metadata: Record<string, string>; expiresSec: number }): Promise<PresignedPost>;
  createMultipart(bucket: string, key: string, opts: { contentType: string; metadata: Record<string, string> }): Promise<string>;
  presignPart(bucket: string, key: string, uploadId: string, partNumber: number, size: number, expiresSec: number): Promise<string>;
  listParts(bucket: string, key: string, uploadId: string): Promise<UploadedPart[] | null>;
  completeMultipart(bucket: string, key: string, uploadId: string, parts: UploadedPart[]): Promise<void>;
  abortMultipart(bucket: string, key: string, uploadId: string): Promise<void>;
  /** Size of the object, or null when it does not exist. */
  head(bucket: string, key: string): Promise<{ size: number } | null>;
  get(bucket: string, key: string): Promise<Buffer | null>;
  put(bucket: string, key: string, body: Buffer | string, contentType: string): Promise<void>;
  /** Deletes every object under the prefix; returns how many were deleted. */
  deletePrefix(bucket: string, prefix: string): Promise<number>;
}

const metaFields = (metadata: Record<string, string>) =>
  Object.entries(metadata).map(([k, v]) => [`x-amz-meta-${k}`, v] as const);

export function s3Storage(client = new S3Client({})): Storage {
  return {
    async presignPost(bucket, key, { size, contentType, metadata, expiresSec }) {
      const fields = Object.fromEntries([['Content-Type', contentType], ...metaFields(metadata)]);
      return createPresignedPost(client, {
        Bucket: bucket,
        Key: key,
        Fields: fields,
        // Every field is pinned: the key, the exact size, the type and the metadata.
        Conditions: [
          ['content-length-range', size, size],
          ...Object.entries(fields).map(([k, v]) => ({ [k]: v })),
        ],
        Expires: expiresSec,
      });
    },
    async createMultipart(bucket, key, { contentType, metadata }) {
      const out = await client.send(new CreateMultipartUploadCommand({ Bucket: bucket, Key: key, ContentType: contentType, Metadata: metadata }));
      if (!out.UploadId) throw new Error('S3 returned no upload id');
      return out.UploadId;
    },
    presignPart(bucket, key, uploadId, partNumber, size, expiresSec) {
      return getSignedUrl(client, new UploadPartCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, ContentLength: size }), {
        expiresIn: expiresSec,
        // A part of any other size fails the signature.
        signableHeaders: new Set(['content-length']),
      });
    },
    async listParts(bucket, key, uploadId) {
      const parts: UploadedPart[] = [];
      let marker: string | undefined;
      try {
        do {
          const out = await client.send(new ListPartsCommand({ Bucket: bucket, Key: key, UploadId: uploadId, PartNumberMarker: marker }));
          for (const p of out.Parts ?? []) parts.push({ partNumber: p.PartNumber ?? 0, size: p.Size ?? 0, etag: p.ETag ?? '' });
          marker = out.IsTruncated ? out.NextPartNumberMarker : undefined;
        } while (marker);
      } catch (err) {
        if ((err as { name?: string }).name === 'NoSuchUpload') return null;
        throw err;
      }
      return parts;
    },
    async completeMultipart(bucket, key, uploadId, parts) {
      const list: Part[] = parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag }));
      await client.send(new CompleteMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts: list } }));
    },
    async abortMultipart(bucket, key, uploadId) {
      await client.send(new AbortMultipartUploadCommand({ Bucket: bucket, Key: key, UploadId: uploadId }));
    },
    async head(bucket, key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        return { size: out.ContentLength ?? 0 };
      } catch (err) {
        if (err instanceof NotFound || (err as { name?: string }).name === 'NotFound') return null;
        throw err;
      }
    },
    async get(bucket, key) {
      try {
        const out = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
        return out.Body ? Buffer.from(await out.Body.transformToByteArray()) : null;
      } catch (err) {
        if ((err as { name?: string }).name === 'NoSuchKey') return null;
        throw err;
      }
    },
    async put(bucket, key, body, contentType) {
      await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
    },
    async deletePrefix(bucket, prefix) {
      let deleted = 0;
      let token: string | undefined;
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token }));
        const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
        if (keys.length) {
          await client.send(new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys, Quiet: true } }));
          deleted += keys.length;
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);
      return deleted;
    },
  };
}

/** In-memory S3 for tests. `objects` maps "bucket/key" to the body. */
export function memoryStorage() {
  const objects = new Map<string, Buffer>();
  const uploads = new Map<string, { bucket: string; key: string; parts: Map<number, UploadedPart> }>();
  let next = 0;
  const id = (bucket: string, key: string) => `${bucket}/${key}`;
  const storage: Storage = {
    async presignPost(bucket, key, opts) {
      return { url: `https://${bucket}.s3.test/`, fields: { key, 'Content-Type': opts.contentType, ...Object.fromEntries(metaFields(opts.metadata)), 'x-test-size': String(opts.size) } };
    },
    async createMultipart(bucket, key) {
      next += 1;
      const uploadId = `up-${next}`;
      uploads.set(uploadId, { bucket, key, parts: new Map() });
      return uploadId;
    },
    async presignPart(bucket, key, uploadId, partNumber, size) {
      return `https://${bucket}.s3.test/${key}?uploadId=${uploadId}&partNumber=${partNumber}&size=${size}`;
    },
    async listParts(_bucket, _key, uploadId) {
      const u = uploads.get(uploadId);
      return u ? [...u.parts.values()].sort((a, b) => a.partNumber - b.partNumber) : null;
    },
    async completeMultipart(bucket, key, uploadId, parts) {
      const u = uploads.get(uploadId);
      if (!u) throw Object.assign(new Error('NoSuchUpload'), { name: 'NoSuchUpload' });
      objects.set(id(bucket, key), Buffer.alloc(0));
      Object.defineProperty(objects.get(id(bucket, key)), 'fakeSize', { value: parts.reduce((s, p) => s + p.size, 0) });
      uploads.delete(uploadId);
    },
    async abortMultipart(_bucket, _key, uploadId) {
      if (!uploads.delete(uploadId)) throw Object.assign(new Error('NoSuchUpload'), { name: 'NoSuchUpload' });
    },
    async head(bucket, key) {
      const o = objects.get(id(bucket, key));
      if (!o) return null;
      return { size: (o as Buffer & { fakeSize?: number }).fakeSize ?? o.length };
    },
    async get(bucket, key) { return objects.get(id(bucket, key)) ?? null; },
    async put(bucket, key, body) { objects.set(id(bucket, key), Buffer.from(body)); },
    async deletePrefix(bucket, prefix) {
      let n = 0;
      for (const k of [...objects.keys()]) if (k.startsWith(id(bucket, prefix))) { objects.delete(k); n += 1; }
      return n;
    },
  };
  return {
    storage,
    objects,
    uploads,
    /** Simulates the browser uploading one part. */
    uploadPart(uploadId: string, partNumber: number, size: number) {
      uploads.get(uploadId)?.parts.set(partNumber, { partNumber, size, etag: `"etag-${partNumber}"` });
    },
    /** Simulates a finished presigned POST or a fake-size object. */
    putSized(bucket: string, key: string, size: number) {
      const b = Buffer.alloc(0);
      Object.defineProperty(b, 'fakeSize', { value: size });
      objects.set(id(bucket, key), b);
    },
  };
}
