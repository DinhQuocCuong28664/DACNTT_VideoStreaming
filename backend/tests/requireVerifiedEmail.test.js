/**
 * Chỉ tài khoản đã xác minh email mới được tải video lên.
 */
const { requireVerifiedEmail } = require('../src/middleware/auth');
const { uploadLimiter } = require('../src/middleware/rateLimiter');
const videoRoutes = require('../src/routes/videoRoutes');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const userWith = (verified) => ({ _id: 'u1', hasVerifiedEmail: () => verified });

describe('requireVerifiedEmail', () => {
  it('chặn tài khoản chưa xác minh bằng 403 và mã EMAIL_NOT_VERIFIED', () => {
    const res = createMockRes();
    const next = jest.fn();

    requireVerifiedEmail({ user: userWith(false), headers: {} }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json.mock.calls[0][0].code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('cho tài khoản đã xác minh (kể cả tài khoản Google) đi qua', () => {
    const res = createMockRes();
    const next = jest.fn();

    requireVerifiedEmail({ user: userWith(true), headers: {} }, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('trả thông điệp theo ngôn ngữ của người gọi', () => {
    const vi = createMockRes();
    const en = createMockRes();

    requireVerifiedEmail({ user: userWith(false), headers: { 'accept-language': 'vi' } }, vi, jest.fn());
    requireVerifiedEmail({ user: userWith(false), headers: { 'accept-language': 'en' } }, en, jest.fn());

    expect(vi.json.mock.calls[0][0].message).not.toBe(en.json.mock.calls[0][0].message);
  });
});

describe('POST /api/videos/initiate-upload', () => {
  const chain = () => {
    const layer = videoRoutes.stack.find(
      (l) => l.route && l.route.path === '/initiate-upload' && l.route.methods.post
    );
    return layer.route.stack.map((s) => s.handle);
  };

  it('kiểm tra xác minh email', () => {
    expect(chain()).toContain(requireVerifiedEmail);
  });

  it('kiểm tra trước limiter, để lượt bị từ chối không trừ vào hạn mức tải lên', () => {
    const handlers = chain();
    expect(handlers.indexOf(requireVerifiedEmail)).toBeLessThan(handlers.indexOf(uploadLimiter));
  });
});
