import { describe, expect, it } from 'vitest';
import { redactUrlQueries } from '../src/lib/redact.js';
import { sourceUnreadable } from '../src/probe.js';
import { handle, type StatusDeps, type VideoDoc, type VideoStore } from '../src/status.js';

const presigned =
  'https://zelos-prod-raw-1.s3.ap-southeast-1.amazonaws.com/raw/v1/1/source?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=ASIAEXAMPLE%2F20261111&X-Amz-Security-Token=IQoJsecret&X-Amz-Signature=abc';

describe('redactUrlQueries', () => {
  it('removes the query of a presigned URL and keeps its path', () => {
    const out = redactUrlQueries(`Command failed: ffprobe ${presigned}\nmore`);
    expect(out).toContain('https://zelos-prod-raw-1.s3.ap-southeast-1.amazonaws.com/raw/v1/1/source?<query removed>');
    expect(out).not.toMatch(/X-Amz-|IQoJsecret|ASIAEXAMPLE/);
  });

  it('stops at quotes and backslashes, so a URL inside JSON text is cut correctly', () => {
    const out = redactUrlQueries(`{"errorMessage":"Command failed: ${presigned}\\n"}`);
    expect(out).toBe('{"errorMessage":"Command failed: https://zelos-prod-raw-1.s3.ap-southeast-1.amazonaws.com/raw/v1/1/source?<query removed>\\n"}');
  });

  it('leaves text without URLs alone', () => {
    expect(redactUrlQueries('ffmpeg exited with code 1')).toBe('ffmpeg exited with code 1');
  });
});

describe('sourceUnreadable', () => {
  it('keeps the last stderr line of ffprobe without the URL query', () => {
    const msg = sourceUnreadable(`${presigned}: Invalid data found when processing input\n`);
    expect(msg).toBe('ffprobe could not read the source: https://zelos-prod-raw-1.s3.ap-southeast-1.amazonaws.com/raw/v1/1/source?<query removed>: Invalid data found when processing input');
  });

  it('still explains the failure when ffprobe printed nothing', () => {
    expect(sourceUnreadable(undefined)).toBe('ffprobe could not read the source');
  });
});

describe('status fail', () => {
  it('stores and mails the reason without a presigned query', async () => {
    const doc: Record<string, unknown> = { status: 'PROCESSING' };
    const mails: string[] = [];
    const videos = {
      fail: async (_id: string, _v: number, reason: string) => {
        Object.assign(doc, { status: 'ERROR', error: reason });
        return doc as unknown as VideoDoc;
      },
    } as unknown as VideoStore;
    const deps = {
      videos,
      alert: async (subject: string, body: string) => { mails.push(`${subject}\n${body}`); },
      now: () => new Date('2026-11-11T00:00:00Z'),
      log: () => undefined,
    } as unknown as StatusDeps;

    await handle({
      action: 'fail', videoId: '6af49e18190c63d281ef6a16', uploadVersion: 1,
      error: { Error: 'Error', Cause: `{"errorMessage":"Command failed: /opt/bin/ffprobe ${presigned}"}` },
    }, deps);

    expect(doc['status']).toBe('ERROR');
    expect(String(doc['error'])).toContain('?<query removed>');
    for (const text of [String(doc['error']), ...mails]) expect(text).not.toMatch(/X-Amz-|IQoJsecret|ASIAEXAMPLE/);
  });
});
