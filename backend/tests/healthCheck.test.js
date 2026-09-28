const express = require('express');
const request = require('supertest');
const { buildHealthCheck } = require('../src/controllers/healthController');

/**
 * Health check phản ánh cả kết nối MongoDB, để canary báo động khi API sống
 * nhưng không phục vụ được gì.
 */
const appWith = (readyState) => {
  const app = express();
  app.get('/', buildHealthCheck(() => readyState));
  return app;
};

describe('GET / — health check', () => {
  it('200 khi đã kết nối MongoDB', async () => {
    const res = await request(appWith(1)).get('/');

    expect(res.status).toBe(200);
    expect(res.body.database).toBe('connected');
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
