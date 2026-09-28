const express = require('express');
const request = require('supertest');
const rateLimit = require('express-rate-limit');
const { TRUSTED_PROXIES } = require('../src/config/trustedProxies');

/**
 * Kiểm thử cách backend xác định IP người dùng khi đứng sau Cloudflare và nginx.
 *
 * supertest kết nối từ 127.0.0.1, đúng vị trí của nginx trên máy chủ thật, nên
 * header X-Forwarded-For trong các test dưới đây là thứ nginx chuyển tới Node:
 * phần do Cloudflare ghi, nối thêm IP máy Cloudflare ở cuối.
 */

// Hai địa chỉ thuộc dải của Cloudflare (172.64.0.0/13 và 2606:4700::/32).
const CLOUDFLARE_EDGE = '172.70.10.20';
const CLOUDFLARE_EDGE_V6 = '2606:4700:10::6816:1';

// Địa chỉ dành cho tài liệu (RFC 5737 / RFC 3849), không thuộc Cloudflare.
const CLIENT_A = '203.0.113.7';
const CLIENT_B = '203.0.113.8';
const DIRECT_CALLER = '198.51.100.9';
const FORGED = '6.6.6.6';

const buildApp = (trustProxy, ...middleware) => {
  const app = express();
  app.set('trust proxy', trustProxy);
  app.get('/ip', ...middleware, (req, res) => res.json({ ip: req.ip }));
  return app;
};

const ipFor = async (app, forwardedFor) => {
  const res = await request(app).get('/ip').set('X-Forwarded-For', forwardedFor);
  return res.body.ip;
};

describe('Xác định IP người dùng sau Cloudflare → nginx', () => {
  const app = buildApp(TRUSTED_PROXIES);

  it('lấy IP người dùng, không lấy IP máy Cloudflare', async () => {
    expect(await ipFor(app, `${CLIENT_A}, ${CLOUDFLARE_EDGE}`)).toBe(CLIENT_A);
  });

  it('bỏ qua X-Forwarded-For giả do người dùng tự chèn trước khi tới Cloudflare', async () => {
    expect(await ipFor(app, `${FORGED}, ${CLIENT_A}, ${CLOUDFLARE_EDGE}`)).toBe(CLIENT_A);
  });

  it('nhận ra máy Cloudflare kết nối bằng IPv6', async () => {
    expect(await ipFor(app, `2001:db8::1, ${CLOUDFLARE_EDGE_V6}`)).toBe('2001:db8::1');
  });

  it('không cho người gọi thẳng vào máy chủ (vòng qua Cloudflare) giả IP', async () => {
    // Không có Cloudflare ở giữa: nginx chỉ nối IP của chính kẻ gọi vào sau
    // phần header hắn tự viết.
    expect(await ipFor(app, `${FORGED}, ${DIRECT_CALLER}`)).toBe(DIRECT_CALLER);
  });

  it('cấu hình cũ (trust proxy = 1) trả về IP Cloudflare — lỗi đã sửa', async () => {
    const oldApp = buildApp(1);
    expect(await ipFor(oldApp, `${CLIENT_A}, ${CLOUDFLARE_EDGE}`)).toBe(CLOUDFLARE_EDGE);
  });
});

describe('Rate limiter tính riêng từng người dùng đi qua cùng một máy Cloudflare', () => {
  const buildLimitedApp = (trustProxy) =>
    buildApp(
      trustProxy,
      rateLimit({ windowMs: 60 * 1000, limit: 1, standardHeaders: true, legacyHeaders: false })
    );

  it('người dùng B không bị chặn vì người dùng A đã dùng hết lượt', async () => {
    const app = buildLimitedApp(TRUSTED_PROXIES);

    const first = await request(app).get('/ip').set('X-Forwarded-For', `${CLIENT_A}, ${CLOUDFLARE_EDGE}`);
    const againA = await request(app).get('/ip').set('X-Forwarded-For', `${CLIENT_A}, ${CLOUDFLARE_EDGE}`);
    const clientB = await request(app).get('/ip').set('X-Forwarded-For', `${CLIENT_B}, ${CLOUDFLARE_EDGE}`);

    expect(first.status).toBe(200);
    expect(againA.status).toBe(429);
    expect(clientB.status).toBe(200);
  });

  it('với cấu hình cũ, người dùng B bị chặn oan vì dùng chung khoá IP Cloudflare', async () => {
    const app = buildLimitedApp(1);

    await request(app).get('/ip').set('X-Forwarded-For', `${CLIENT_A}, ${CLOUDFLARE_EDGE}`);
    const clientB = await request(app).get('/ip').set('X-Forwarded-For', `${CLIENT_B}, ${CLOUDFLARE_EDGE}`);

    expect(clientB.status).toBe(429);
  });
});
