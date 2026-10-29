/**
 * Direct-to-S3 transfer of a video: one presigned POST up to 5 GiB, or a multipart upload with
 * a few parts in flight, per-part retries with backoff, fresh part URLs on demand (they expire
 * after 15 minutes) and one progress number across all parts. The API completes multipart
 * uploads from S3's own part list, so the browser never sends ETags.
 */

export const DEFAULT_CONCURRENCY = 3;
export const DEFAULT_MAX_ATTEMPTS = 4;
const BACKOFF_BASE_MS = 1000;

export interface Progress { loaded: number; total: number; percent: number }
export interface PartUrl { partNumber: number; size: number; url: string }

export class UploadCancelled extends Error {
  constructor() { super('Upload cancelled'); this.name = 'UploadCancelled'; }
}

class PartError extends Error {
  constructor(message: string, readonly retryable = true) { super(message); }
}

const sleepFor = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  if (signal?.aborted) { reject(new UploadCancelled()); return; }
  const onAbort = () => { clearTimeout(timer); reject(new UploadCancelled()); };
  const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
  signal?.addEventListener('abort', onAbort, { once: true });
});

/** XHR send with upload progress; rejects on non-2xx and on abort. */
export function sendWithProgress(method: 'POST' | 'PUT', url: string, body: XMLHttpRequestBodyInit, onProgress: (loaded: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new UploadCancelled()); return; }
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new PartError(`S3 answered ${xhr.status}`, xhr.status >= 500 || xhr.status === 403)));
    xhr.onerror = () => reject(new PartError('Network error'));
    xhr.onabort = () => reject(new UploadCancelled());
    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(body);
  });
}

/** One presigned POST: the policy fields first, the file last (S3 requires that order). */
export function uploadWithPost(post: { url: string; fields: Record<string, string> }, file: Blob, onProgress: (p: Progress) => void, signal?: AbortSignal): Promise<void> {
  const form = new FormData();
  for (const [k, v] of Object.entries(post.fields)) form.append(k, v);
  form.append('file', file);
  const total = file.size;
  return sendWithProgress('POST', post.url, form, (loaded) => onProgress({ loaded: Math.min(loaded, total), total, percent: Math.min(100, Math.round((Math.min(loaded, total) * 100) / total)) }), signal);
}

export async function uploadInParts(opts: {
  file: Blob;
  partSize: number;
  partCount: number;
  getPartUrls: (partNumbers: number[]) => Promise<PartUrl[]>;
  putPart?: (url: string, body: Blob, onProgress: (loaded: number) => void, signal?: AbortSignal) => Promise<void>;
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
  concurrency?: number;
  maxAttempts?: number;
  maxPartUrlsPerRequest?: number;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}): Promise<void> {
  const { file, partSize, partCount, getPartUrls, onProgress, signal } = opts;
  const putPart = opts.putPart ?? ((url, body, progress, s) => sendWithProgress('PUT', url, body, progress, s));
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const perRequest = opts.maxPartUrlsPerRequest ?? 10;
  const sleep = opts.sleep ?? sleepFor;
  const total = file.size;
  const loadedByPart = new Map<number, number>();
  const done = new Set<number>();
  const urls = new Map<number, PartUrl>();
  const inflight = new Map<number, Promise<void>>();
  let nextPart = 1;
  let failure: unknown = null;

  const report = () => {
    if (!onProgress) return;
    let loaded = 0;
    for (const b of loadedByPart.values()) loaded += b;
    loaded = Math.min(loaded, total);
    onProgress({ loaded, total, percent: total > 0 ? Math.min(100, Math.round((loaded * 100) / total)) : 0 });
  };
  const expectedSize = (n: number) => Math.min(partSize, total - (n - 1) * partSize);

  // URLs are fetched in batches; parts waiting for the same batch share one request.
  const ensureUrl = async (n: number): Promise<PartUrl> => {
    for (;;) {
      const have = urls.get(n);
      if (have) return have;
      const pending = inflight.get(n);
      if (pending) { await pending; continue; }
      const batch = [n];
      for (let m = n + 1; m <= partCount && batch.length < perRequest; m += 1) if (!done.has(m) && !urls.has(m) && !inflight.has(m)) batch.push(m);
      const request = getPartUrls(batch).then((parts) => { for (const p of parts) urls.set(p.partNumber, p); });
      const tracked = request.finally(() => { for (const m of batch) inflight.delete(m); });
      for (const m of batch) inflight.set(m, tracked);
      await tracked;
      if (!urls.has(n)) throw new PartError(`No upload URL for part ${n}`, false);
    }
  };

  const uploadPart = async (n: number) => {
    const size = expectedSize(n);
    const body = file.slice((n - 1) * partSize, (n - 1) * partSize + size);
    for (let attempt = 1; ; attempt += 1) {
      if (signal?.aborted) throw new UploadCancelled();
      try {
        const part = await ensureUrl(n);
        if (part.size !== size) throw new PartError(`Part ${n} size mismatch`, false);
        await putPart(part.url, body, (loaded) => { loadedByPart.set(n, Math.min(loaded, size)); report(); }, signal);
        loadedByPart.set(n, size);
        done.add(n);
        urls.delete(n);
        report();
        return;
      } catch (err) {
        if (signal?.aborted || err instanceof UploadCancelled) throw new UploadCancelled();
        loadedByPart.set(n, 0);
        // The URL may have expired: the next attempt asks for a new one.
        urls.delete(n);
        if ((err instanceof PartError && !err.retryable) || attempt >= maxAttempts) {
          throw new Error(`Part ${n} failed after ${attempt} attempt(s): ${(err as Error).message}`);
        }
        await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1), signal);
      }
    }
  };

  const worker = async () => {
    while (!failure && !signal?.aborted && nextPart <= partCount) {
      const n = nextPart;
      nextPart += 1;
      try {
        await uploadPart(n);
      } catch (err) {
        failure = failure ?? err;
        return;
      }
    }
  };

  if (signal?.aborted) throw new UploadCancelled();
  await Promise.all(Array.from({ length: Math.min(concurrency, partCount) }, worker));
  if (failure) throw failure;
  if (signal?.aborted) throw new UploadCancelled();
  onProgress?.({ loaded: total, total, percent: 100 });
}

export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 ** 2) return `${(bytesPerSec / 1024 ** 2).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
}

export function formatEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0 ? `${h}h ${m}m` : m > 0 ? `${m}m ${s}s` : `${s}s`;
}
