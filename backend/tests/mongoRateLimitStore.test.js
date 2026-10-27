const express = require('express');
const request = require('supertest');
const { rateLimit } = require('express-rate-limit');

/**
 * The Mongo rate limit store, run against an in-memory stand-in for the
 * collection. The stand-in evaluates the update pipeline the store really
 * sends ($cond, $gt, $add, $$NOW and field paths), so these tests check the
 * window logic itself rather than only the shape of the call.
 */

const mockDb = new Map();
// Real time, because get() and decrement() read the clock themselves.
const T0 = Date.now();
let mockNow = new Date(T0);

const mockEvaluate = (expr, doc) => {
  if (expr === '$$NOW') return mockNow;
  if (typeof expr === 'string') return expr.startsWith('$') ? doc[expr.slice(1)] : expr;
  if (typeof expr === 'number' || expr instanceof Date) return expr;
  if (expr.$cond) {
    const [test, yes, no] = expr.$cond;
    return mockEvaluate(test, doc) ? mockEvaluate(yes, doc) : mockEvaluate(no, doc);
  }
  if (expr.$gt) {
    const [a, b] = expr.$gt.map((e) => mockEvaluate(e, doc));
    // BSON order puts a missing field below every date and number.
    if (a === undefined || a === null) return false;
    return a > b;
  }
  if (expr.$add) {
    const values = expr.$add.map((e) => mockEvaluate(e, doc));
    const sum = values.reduce((acc, v) => acc + (v instanceof Date ? v.getTime() : v), 0);
    return values.some((v) => v instanceof Date) ? new Date(sum) : sum;
  }
  throw new Error(`unsupported expression ${JSON.stringify(expr)}`);
};

jest.mock('../src/models/RateLimitHit', () => ({
  findOneAndUpdate: jest.fn(async (filter, pipeline, options) => {
    if (!Array.isArray(pipeline) || !options.updatePipeline || !options.upsert) {
      throw new Error('expected an upserting update pipeline');
    }
    const before = mockDb.get(filter._id) || { _id: filter._id };
    const after = { ...before };
    for (const stage of pipeline) {
      // Every field of one $set stage reads the document as it was before the stage.
      const input = { ...after };
      for (const [field, expr] of Object.entries(stage.$set)) after[field] = mockEvaluate(expr, input);
    }
    mockDb.set(filter._id, after);
    return { ...after };
  }),
  updateOne: jest.fn(async (filter, update) => {
    const doc = mockDb.get(filter._id);
    if (doc && doc.hits > filter.hits.$gt && doc.resetAt > filter.resetAt.$gt) {
      doc.hits += update.$inc.hits;
    }
  }),
  deleteOne: jest.fn(async (filter) => {
    mockDb.delete(filter._id);
  }),
  findById: jest.fn((id) => ({ lean: async () => (mockDb.has(id) ? { ...mockDb.get(id) } : null) })),
}));

const MongoRateLimitStore = require('../src/middleware/mongoRateLimitStore');
const RateLimitHit = require('../src/models/RateLimitHit');

const WINDOW_MS = 15 * 60 * 1000;
const newStore = (prefix = 'auth:') => {
  const store = new MongoRateLimitStore({ prefix });
  store.init({ windowMs: WINDOW_MS });
  return store;
};

beforeEach(() => {
  mockDb.clear();
  mockNow = new Date(T0);
  jest.clearAllMocks();
});

describe('MongoRateLimitStore', () => {
  it('opens a window on the first hit and counts within it', async () => {
    const store = newStore();

    const first = await store.increment('1.2.3.4');
    mockNow = new Date(mockNow.getTime() + 60 * 1000);
    const second = await store.increment('1.2.3.4');

    expect(first).toEqual({ totalHits: 1, resetTime: new Date(T0 + WINDOW_MS) });
    expect(second).toEqual({ totalHits: 2, resetTime: new Date(T0 + WINDOW_MS) });
  });

  it('starts again at 1 once the window has ended, even if the document lingers', async () => {
    const store = newStore();
    await store.increment('1.2.3.4');
    await store.increment('1.2.3.4');

    // The TTL monitor has not removed the counter yet.
    mockNow = new Date(T0 + WINDOW_MS);
    const next = await store.increment('1.2.3.4');

    expect(next).toEqual({ totalHits: 1, resetTime: new Date(T0 + 2 * WINDOW_MS) });
  });

  it('shares one count between store objects with the same prefix (two Lambda instances)', async () => {
    const instanceA = newStore('auth:');
    const instanceB = newStore('auth:');

    await instanceA.increment('1.2.3.4');
    const fromB = await instanceB.increment('1.2.3.4');

    expect(fromB.totalHits).toBe(2);
  });

  it('keeps limiters with different prefixes apart', async () => {
    await newStore('api:').increment('1.2.3.4');
    const auth = await newStore('auth:').increment('1.2.3.4');

    expect(auth.totalHits).toBe(1);
    expect([...mockDb.keys()].sort()).toEqual(['api:1.2.3.4', 'auth:1.2.3.4']);
  });

  it('get reports the open window and nothing after it ends', async () => {
    const store = newStore();
    await store.increment('k');

    expect(await store.get('k')).toEqual({ totalHits: 1, resetTime: new Date(T0 + WINDOW_MS) });
    mockNow = new Date(T0 + WINDOW_MS);
    jest.useFakeTimers({ now: mockNow });
    try {
      expect(await store.get('k')).toBeUndefined();
    } finally {
      jest.useRealTimers();
    }
  });

  it('decrement and resetKey act on the prefixed key', async () => {
    const store = newStore('upload:');
    await store.increment('user:1');
    await store.increment('user:1');

    await store.decrement('user:1');
    expect(mockDb.get('upload:user:1').hits).toBe(1);

    await store.resetKey('user:1');
    expect(mockDb.has('upload:user:1')).toBe(false);
  });

  it('refuses to be built without a prefix', () => {
    expect(() => new MongoRateLimitStore({})).toThrow('prefix');
  });
});

describe('a limiter on the shared store (HTTP)', () => {
  const buildApp = (store) => {
    const app = express();
    app.set('trust proxy', 'loopback');
    app.post(
      '/login',
      rateLimit({ windowMs: WINDOW_MS, limit: 2, store, passOnStoreError: true }),
      (req, res) => res.status(200).json({ success: true })
    );
    return app;
  };

  it('blocks the third attempt even when each attempt reaches a different instance', async () => {
    const apps = [buildApp(newStore()), buildApp(newStore()), buildApp(newStore())];

    const statuses = [];
    for (const app of apps) {
      statuses.push((await request(app).post('/login').set('X-Forwarded-For', '198.51.100.7')).status);
    }

    expect(statuses).toEqual([200, 200, 429]);
  });

  it('lets the request through when the database is unreachable', async () => {
    RateLimitHit.findOneAndUpdate.mockRejectedValueOnce(new Error('server selection timed out'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const res = await request(buildApp(newStore())).post('/login');

    expect(res.status).toBe(200);
    errorSpy.mockRestore();
  });
});
