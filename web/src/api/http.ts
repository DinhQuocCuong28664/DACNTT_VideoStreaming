/**
 * One fetch wrapper for the v2 API: bearer token, JSON in and out, the shared error shape
 * { error: { code, message, details } }, and a session-expired event on 401.
 */

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '') ?? 'https://api-v2-staging.zelostech.site';

const TOKEN_KEY = 'zelos-token';

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export const tokenStore = {
  get(): string | null {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set(token: string | null): void {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch { /* private mode: the session lasts for this page only */ }
  },
};

/** Fired when the API answers 401 to a request that carried a token. */
export const SESSION_EXPIRED = 'zelos:session-expired';

export interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Sends the body as is (captions are text/vtt). */
  raw?: { body: BodyInit; contentType: string };
}

/**
 * Answers worth another try: 429 (the API Lambda at its instance ceiling, or the API rate limit)
 * and 503. Both come before any handler runs, so retrying a POST does not repeat its effect.
 */
const RETRY_STATUS = new Set([429, 503]);
export const MAX_RETRIES = 3;

/** Wait before retry `attempt` (1-based): Retry-After when given, else 0.5 s, 1 s, 2 s with jitter. */
export function retryDelayMs(attempt: number, retryAfter: string | null, random: () => number = Math.random): number {
  const seconds = retryAfter === null ? NaN : Number(retryAfter);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds, 10) * 1000;
  const base = 500 * 2 ** (attempt - 1);
  return Math.round(base * (0.75 + random() * 0.5));
}

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

export async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const url = new URL(`${API_BASE_URL}/v1${path}`);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
  const token = tokenStore.get();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.raw) {
    body = opts.raw.body;
    headers['Content-Type'] = opts.raw.contentType;
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  for (let attempt = 0; ; attempt++) {
    try {
      res = await fetch(url, { method, headers, body, signal: opts.signal });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      throw new ApiError(0, 'NETWORK', 'Cannot reach the server');
    }
    if (!RETRY_STATUS.has(res.status) || attempt >= MAX_RETRIES) break;
    await wait(retryDelayMs(attempt + 1, res.headers.get('retry-after')), opts.signal);
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const e = (data as { error?: { code?: string; message?: string; details?: unknown } } | null)?.error;
    if (res.status === 401 && token) {
      tokenStore.set(null);
      window.dispatchEvent(new Event(SESSION_EXPIRED));
    }
    throw new ApiError(res.status, e?.code ?? 'HTTP_' + res.status, e?.message ?? res.statusText, e?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, { ...opts, body }),
  del: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, opts),
};
