import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, MAX_RETRIES, request, retryDelayMs } from '../src/api/http';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

describe('retryDelayMs', () => {
  it('backs off 0.5 s, 1 s, 2 s with jitter', () => {
    expect(retryDelayMs(1, null, () => 0.5)).toBe(500);
    expect(retryDelayMs(2, null, () => 0.5)).toBe(1000);
    expect(retryDelayMs(3, null, () => 0.5)).toBe(2000);
    expect(retryDelayMs(1, null, () => 0)).toBe(375);
    expect(retryDelayMs(1, null, () => 1)).toBe(625);
  });

  it('follows Retry-After in seconds, capped at 10 s', () => {
    expect(retryDelayMs(1, '2')).toBe(2000);
    expect(retryDelayMs(1, '120')).toBe(10_000);
    expect(retryDelayMs(1, 'soon', () => 0.5)).toBe(500);
  });
});

describe('request retries', () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('retries a POST after a 429 and returns the next answer', async () => {
    fetchMock.mockResolvedValueOnce(json(429, { message: 'Too Many Requests' })).mockResolvedValueOnce(json(201, { ok: true }));
    const p = request<{ ok: boolean }>('POST', '/uploads', { body: { size: 1 } });
    await vi.runAllTimersAsync();
    await expect(p).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ size: 1 }));
  });

  it('gives up after three retries with the last error', async () => {
    fetchMock.mockImplementation(async () => json(503, { error: { code: 'UNAVAILABLE', message: 'busy' } }));
    const p = request('GET', '/videos');
    const caught = p.catch((e: unknown) => e);
    await vi.runAllTimersAsync();
    const err = await caught;
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it('does not retry other errors', async () => {
    fetchMock.mockResolvedValue(json(400, { error: { code: 'BAD', message: 'bad' } }));
    await expect(request('POST', '/uploads', { body: {} })).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops waiting when the request is aborted', async () => {
    fetchMock.mockResolvedValue(json(429, {}));
    const ctrl = new AbortController();
    const p = request('GET', '/videos', { signal: ctrl.signal });
    const caught = p.catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(10);
    ctrl.abort();
    await vi.runAllTimersAsync();
    expect(((await caught) as Error).name).toBe('AbortError');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
