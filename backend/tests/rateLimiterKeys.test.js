const express = require('express');
const request = require('supertest');
const { rateLimit } = require('express-rate-limit');
const { accountOrIpKey } = require('../src/middleware/rateLimiter');

/**
 * Giới hạn tải lên và báo cáo tính theo tài khoản, không theo IP.
 *
 * Các limiter thật tự bỏ qua khi NODE_ENV=test, nên ở đây dựng limiter mới với
 * đúng hàm khoá đang dùng trong production.
 */

const SHARED_IP = '203.0.113.50'; // hai người sau cùng một Carrier-Grade NAT

const buildApp = () => {
  const app = express();
  app.set('trust proxy', 'loopback');
  // Giả lập middleware `auth`: danh tính lấy từ header cho gọn.
  app.use((req, res, next) => {
    const id = req.get('X-Test-User');
    if (id) req.user = { _id: id };
    next();
  });
  app.post(
    '/upload',
    rateLimit({ windowMs: 60 * 1000, limit: 1, keyGenerator: accountOrIpKey }),
    (req, res) => res.status(201).json({ success: true })
  );
  return app;
};

const upload = (app, userId) => {
  const req = request(app).post('/upload').set('X-Forwarded-For', SHARED_IP);
  return userId ? req.set('X-Test-User', userId) : req;
};

describe('accountOrIpKey', () => {
  it('dùng ID tài khoản khi đã đăng nhập', () => {
    expect(accountOrIpKey({ user: { _id: 'abc' }, ip: SHARED_IP })).toBe('user:abc');
  });

  it('rơi về IP khi không có tài khoản', () => {
    expect(accountOrIpKey({ ip: SHARED_IP })).toBe(SHARED_IP);
  });

  it('gộp cả dải /56 IPv6 của một người vào một khoá', () => {
    const a = accountOrIpKey({ ip: '2001:db8:1:ff00::1' });
    const b = accountOrIpKey({ ip: '2001:db8:1:ffaa::2' });
    expect(a).toBe(b);
  });
});

describe('Giới hạn tải lên theo tài khoản (HTTP)', () => {
  it('hai tài khoản chung một IP có hạn mức riêng', async () => {
    const app = buildApp();

    expect((await upload(app, 'user-a')).status).toBe(201);
    expect((await upload(app, 'user-a')).status).toBe(429);
    expect((await upload(app, 'user-b')).status).toBe(201);
  });
});
