import { describe, expect, it } from 'vitest';
import { notify, type NotifierDeps, type Subscriber } from '../src/notifier.js';
import { hoursToRoll, retentionOf, rollup, type HourRow, type RollupDeps } from '../src/rollup.js';
import { reconcile, type Draft, type ReconcilerDeps } from '../src/reconciler.js';

const videoId = '6a78c10f1c4541ef615cf01d';
const ownerId = '6a78c10f1c4541ef615cf01e';
const event = { detail: { videoId, ownerId, publishedAt: '2026-11-02T10:00:00.000Z' } };

function notifierDeps(subs: Subscriber[], opts: { cap?: number; announce?: boolean; failMailTo?: string } = {}) {
  const items = new Map<string, Record<string, unknown>>();
  const mails: string[] = [];
  let slots = 0;
  const deps: NotifierDeps = {
    video: async () => ({ title: 'Nhạc mới', ownerId, channelName: 'Kênh', announce: opts.announce ?? true }),
    subscribers: async (_c, after, limit) => {
      const start = after ? subs.findIndex((s) => s.id === after) + 1 : 0;
      return subs.slice(start, start + limit);
    },
    putNotification: async (userId, sk, item) => {
      const key = `${userId}|${sk}`;
      if (items.has(key)) return false;
      items.set(key, item);
      return true;
    },
    takeMailSlot: async () => { slots += 1; return slots <= (opts.cap ?? 1000); },
    sendMail: async (to) => {
      if (to === opts.failMailTo) throw new Error('smtp down');
      mails.push(to);
    },
    webBaseUrl: 'https://zelos.test',
    now: () => new Date('2026-11-02T10:00:05Z'),
    log: () => undefined,
  };
  return { deps, items, mails };
}

const people = (n: number, withEmail = true): Subscriber[] =>
  Array.from({ length: n }, (_, i) => ({ id: String(i).padStart(24, '0'), email: withEmail && i % 2 === 0 ? `u${i}@example.com` : null }));

describe('notifier', () => {
  it('notifies every subscriber once and mails only those who opted in', async () => {
    const { deps, items, mails } = notifierDeps(people(450));
    expect(await notify(event, deps)).toEqual({ notified: 450, mailed: 225 });
    expect(items.size).toBe(450);
    expect([...items.values()][0]).toMatchObject({ type: 'upload', read: false, data: { videoId, title: 'Nhạc mới' } });
    // A redelivered event adds nothing and mails nobody again.
    expect(await notify(event, deps)).toEqual({ notified: 0, mailed: 0 });
    expect(mails).toHaveLength(225);
  });

  it('stops mailing at the daily cap but still notifies in the app', async () => {
    const { deps, mails } = notifierDeps(people(20), { cap: 3 });
    expect(await notify(event, deps)).toEqual({ notified: 20, mailed: 3 });
    expect(mails).toHaveLength(3);
  });

  it('keeps going when one mail fails', async () => {
    const { deps, mails } = notifierDeps(people(4), { failMailTo: 'u0@example.com' });
    expect(await notify(event, deps)).toEqual({ notified: 4, mailed: 1 });
    expect(mails).toEqual(['u2@example.com']);
  });

  it('announces nothing for a video that is no longer public, and refuses a bad event', async () => {
    const { deps, items } = notifierDeps(people(3), { announce: false });
    expect((await notify(event, deps)).skipped).toBe('not public');
    expect(items.size).toBe(0);
    await expect(notify({ detail: { videoId: 'x' } }, deps)).rejects.toThrow();
  });
});

describe('roll-up', () => {
  it('picks the two previous UTC hours and reads retention buckets', () => {
    expect(hoursToRoll(new Date('2026-11-02T13:05:00Z'))).toEqual(['2026-11-02T12', '2026-11-02T11']);
    expect(hoursToRoll(new Date('2026-11-03T00:10:00Z'))).toEqual(['2026-11-02T23', '2026-11-02T22']);
    const r = retentionOf({ r00: 2, r19: 5, other: 1 });
    expect(r).toHaveLength(20);
    expect([r[0], r[1], r[19]]).toEqual([2, 0, 5]);
  });

  it('writes each hour once per video with its owner and skips deleted videos', async () => {
    const writes: { videoId: string; date: string; hour: string; row: HourRow }[] = [];
    const row = (id: string): HourRow => ({ videoId: id, views: 2, watchSeconds: 120, retention: Array.from({ length: 20 }, () => 1) });
    const deps: RollupDeps = {
      hourRows: async (hour) => (hour === '2026-11-02T12' ? [row(videoId), row('0'.repeat(24))] : []),
      owners: async () => new Map([[videoId, ownerId]]),
      writeHour: async (v, _o, date, hour, r) => { writes.push({ videoId: v, date, hour, row: r }); },
      now: () => new Date('2026-11-02T13:05:00Z'),
      log: () => undefined,
    };
    expect(await rollup(undefined, deps)).toEqual({ hours: ['2026-11-02T12', '2026-11-02T11'], rows: 1 });
    expect(writes).toEqual([{ videoId, date: '2026-11-02', hour: '12', row: row(videoId) }]);
    // An explicit list re-runs a past hour, which writes the same values again.
    await rollup({ hours: ['2026-11-02T12'] }, deps);
    expect(writes).toHaveLength(2);
    expect(writes[1]).toEqual(writes[0]);
  });
});

describe('reconciler', () => {
  function reconcilerDeps(drafts: Draft[], stillUploading: Set<string>, abortFails = false) {
    const deleted: string[] = [];
    const prefixes: string[] = [];
    let since: Date | undefined;
    const deps: ReconcilerDeps = {
      abandoned: async (before) => { since = before; return drafts; },
      abortMultipart: async () => { if (abortFails) throw new Error('NoSuchUpload'); },
      deleteRawPrefix: async (p) => { prefixes.push(p); return 1; },
      deleteDraft: async (id) => { if (!stillUploading.has(id)) return false; deleted.push(id); return true; },
      now: () => new Date('2026-11-02T03:00:00Z'),
      log: () => undefined,
    };
    return { deps, deleted, prefixes, since: () => since };
  }

  it('removes drafts older than 24 hours, even when the abort fails, and keeps those that started processing', async () => {
    const a = { id: 'a'.repeat(24), uploadVersion: 1, uploadId: 'up-1' };
    const b = { id: 'b'.repeat(24), uploadVersion: 1, uploadId: null };
    const { deps, deleted, prefixes, since } = reconcilerDeps([a, b], new Set([a.id]), true);
    expect(await reconcile(deps)).toEqual({ removed: 1, kept: 1 });
    expect(deleted).toEqual([a.id]);
    expect(prefixes).toEqual([`raw/${a.id}/`]);
    expect(since()?.toISOString()).toBe('2026-11-01T03:00:00.000Z');
  });
});
