process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/test_video_db';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_key_at_least_32_characters_long_for_ci';
process.env.CORS_ORIGINS = 'https://zelostech.site,https://www.zelostech.site';

jest.mock('../src/config/db', () => jest.fn().mockResolvedValue({}));
jest.mock('../src/services/videoService', () => ({
  ...jest.requireActual('../src/services/videoService'),
  getVideoKey: jest.fn(),
}));

const request = require('supertest');
const app = require('../src/server');
const videoService = require('../src/services/videoService');

const KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
const VIDEO_ID = '6adfd6a4fc4f05f31506a23d';

/**
 * The key endpoint must get its CORS headers from the app-wide cors()
 * middleware only. It used to set Access-Control-Allow-Origin to whatever
 * Origin the request carried, with credentials allowed.
 */
describe('GET /api/videos/:id/key CORS', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    videoService.getVideoKey.mockResolvedValue(KEY);
  });

  it('serves the 16-byte key with CORS for an allowed origin', async () => {
    const res = await request(app).get(`/api/videos/${VIDEO_ID}/key`).set('Origin', 'https://zelostech.site');

    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe('https://zelostech.site');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
    expect(res.headers['content-type']).toBe('application/octet-stream');
    expect(Buffer.from(res.body).equals(KEY)).toBe(true);
  });

  it('does not reflect an origin outside CORS_ORIGINS', async () => {
    const res = await request(app).get(`/api/videos/${VIDEO_ID}/key`).set('Origin', 'https://evil.example');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.headers['access-control-allow-credentials']).toBeUndefined();
    expect(videoService.getVideoKey).not.toHaveBeenCalled();
  });
});

describe('CORS refusal', () => {
  it('answers a request from an origin outside CORS_ORIGINS with 403, not 500', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = await request(app).get('/api/health').set('Origin', 'http://localhost:5173');
    consoleError.mockRestore();

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ success: false, code: 'CORS_ORIGIN_FORBIDDEN' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('still serves requests without an Origin header (curl, health checks)', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).not.toBe(403);
  });
});
