const express = require('express');
const request = require('supertest');
const { buildHealthCheck } = require('../src/controllers/healthController');

/**
 * Health check phản ánh cả kết nối MongoDB, để canary báo động khi API sống
 * nhưng không phục vụ được gì.
 */
const appWith = (readyState) => {
  const app = express();
  const handler = buildHealthCheck(() => readyState);
  app.get('/', handler);
  app.get('/health', handler);
  app.get('/api/health', handler);
  return app;
};

describe('GET / — health check', () => {
  it('200 khi đã kết nối MongoDB', async () => {
    const res = await request(appWith(1)).get('/');

    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
  });

  it('200 qua các endpoint alias /health và /api/health', async () => {
    const resHealth = await request(appWith(1)).get('/health');
    expect(resHealth.status).toBe(200);
    expect(resHealth.body.database).toBe('connected');

    const resApiHealth = await request(appWith(1)).get('/api/health');
    expect(resApiHealth.status).toBe(200);
    expect(resApiHealth.body.database).toBe('connected');
  });

  it('503 khi mất kết nối MongoDB', async () => {
    const res = await request(appWith(0)).get('/');

    expect(res.status).toBe(503);
    expect(res.body.database).toBe('disconnected');
  });

  it('503 trong lúc đang kết nối lại, chưa phục vụ được', async () => {
    expect((await request(appWith(2)).get('/')).status).toBe(503);
  });
});
