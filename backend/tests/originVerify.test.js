process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test_video_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_at_least_32_characters_long_for_ci';

const request = require('supertest');

/**
 * Requests that skip the Cloudflare Worker (straight to the Lambda function
 * URL) are refused once ORIGIN_VERIFY_SECRET is set.
 */

jest.mock('../src/config/db', () => jest.fn().mockResolvedValue({}));

const SECRET = 'o'.repeat(48);
const app = require('../src/server');

describe('originVerify', () => {
  afterEach(() => {
    delete process.env.ORIGIN_VERIFY_SECRET;
  });

  it('lets everything through while no secret is set (local runs, tests)', async () => {
    const res = await request(app).get('/api/videos/upload-config');
    expect(res.status).toBe(200);
  });

  describe('with ORIGIN_VERIFY_SECRET set', () => {
    beforeEach(() => {
      process.env.ORIGIN_VERIFY_SECRET = SECRET;
    });

    it('serves a request that carries the Worker header', async () => {
      const res = await request(app).get('/api/videos/upload-config').set('X-Origin-Verify', SECRET);
      expect(res.status).toBe(200);
    });

    it('refuses a request without the header with 403', async () => {
      const res = await request(app).get('/api/videos/upload-config');
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('ORIGIN_NOT_ALLOWED');
    });

    it('refuses a wrong secret, including one of a different length', async () => {
      for (const value of ['p'.repeat(48), 'short']) {
        const res = await request(app).get('/api/videos/upload-config').set('X-Origin-Verify', value);
        expect(res.status).toBe(403);
      }
    });

    it('keeps health checks open for the CD check on the function URL', async () => {
      for (const path of ['/health', '/api/health']) {
        const res = await request(app).get(path);
        expect(res.status).not.toBe(403);
      }
    });

    it('refuses before CORS and the routes run', async () => {
      const res = await request(app).post('/api/auth/login').set('Origin', 'https://zelostech.site').send({ email: 'a@b.c', password: 'x' });
      expect(res.status).toBe(403);
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });
});
