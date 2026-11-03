import type { ObjectStore } from '../src/lib/s3.js';

/** In-memory S3 for handler tests: objects keyed by "bucket/key". */
export function fakeStore(initial: Record<string, string | Uint8Array> = {}) {
  const objects = new Map<string, string | Uint8Array>(Object.entries(initial));
  const writes: { bucket: string; key: string; body: string; contentType: string }[] = [];
  const store: ObjectStore = {
    async getJson<T>(bucket: string, key: string): Promise<T> {
      const v = objects.get(`${bucket}/${key}`);
      if (typeof v !== 'string') throw new Error(`NoSuchKey ${bucket}/${key}`);
      return JSON.parse(v) as T;
    },
    async getRange(bucket: string, key: string, bytes: number): Promise<Uint8Array> {
      const v = objects.get(`${bucket}/${key}`);
      if (!(v instanceof Uint8Array)) throw new Error(`NoSuchKey ${bucket}/${key}`);
      return v.subarray(0, bytes);
    },
    async putText(bucket: string, key: string, body: string, contentType: string): Promise<void> {
      objects.set(`${bucket}/${key}`, body);
      writes.push({ bucket, key, body, contentType });
    },
    async list(bucket: string, prefix: string): Promise<string[]> {
      return [...objects.keys()].filter((k) => k.startsWith(`${bucket}/${prefix}`)).map((k) => k.slice(bucket.length + 1)).sort();
    },
    async presignGet(bucket: string, key: string): Promise<string> {
      return `https://${bucket}.s3.amazonaws.com/${key}?sig=1`;
    },
  };
  return { store, objects, writes };
}
