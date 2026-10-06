const videoRouter = require('../src/routes/videoRoutes');

/**
 * Express chọn route đầu tiên khớp. `GET /upload-config` phải đứng trước
 * `GET /:id`, nếu không "upload-config" bị coi là một video ID và frontend nhận
 * lỗi "Resource not found — invalid ID format" thay vì cấu hình.
 */
const routes = () =>
  videoRouter.stack
    .filter((layer) => layer.route)
    .map((layer) => ({ path: layer.route.path, methods: Object.keys(layer.route.methods) }));

const indexOf = (path, method) => routes().findIndex((r) => r.path === path && r.methods.includes(method));

describe('thứ tự route của video', () => {
  it('GET /upload-config đứng trước GET /:id', () => {
    const config = indexOf('/upload-config', 'get');
    const byId = indexOf('/:id', 'get');

    expect(config).toBeGreaterThanOrEqual(0);
    expect(byId).toBeGreaterThanOrEqual(0);
    expect(config).toBeLessThan(byId);
  });

  it('có hai route multipart cho chủ video, dùng POST', () => {
    expect(indexOf('/:id/multipart/parts', 'post')).toBeGreaterThanOrEqual(0);
    expect(indexOf('/:id/multipart/complete', 'post')).toBeGreaterThanOrEqual(0);
  });

  it('cả hai route multipart đều yêu cầu đăng nhập (middleware auth chạy đầu tiên)', () => {
    const auth = require('../src/middleware/auth');
    for (const path of ['/:id/multipart/parts', '/:id/multipart/complete']) {
      const layer = videoRouter.stack.find((l) => l.route && l.route.path === path);
      expect(layer.route.stack[0].handle).toBe(auth);
    }
  });
});
