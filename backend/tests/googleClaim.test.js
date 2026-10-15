/**
 * Đăng nhập Google khi email đã có tài khoản local.
 *
 * - Tài khoản đã xác minh email: giữ nguyên chính sách cũ, không tự gộp (409).
 * - Tài khoản CHƯA xác minh: giao cho chủ hộp thư vừa được Google xác minh,
 *   đồng thời xoá mật khẩu và truất mọi phiên của người đăng ký trước — nếu
 *   không, đây chính là lỗ hổng chiếm tài khoản mà authService mô tả.
 */
jest.mock('google-auth-library', () => {
  const verifyIdToken = jest.fn();
  return { OAuth2Client: jest.fn(() => ({ verifyIdToken })), __verifyIdToken: verifyIdToken };
});
jest.mock('../src/models/User');

const jwt = require('jsonwebtoken');
const { __verifyIdToken: verifyIdToken } = require('google-auth-library');
const authService = require('../src/services/authService');
const User = require('../src/models/User');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests_only_32chars';

const googlePayload = { sub: 'google-sub-1', email: 'chuthat@example.com', email_verified: true, name: 'Chủ thật' };

const localUser = (verified) => ({
  _id: 'local-1',
  email: googlePayload.email,
  hasVerifiedEmail: () => verified,
});

describe('loginWithGoogle với email đã có tài khoản local', () => {
  beforeEach(() => {
    verifyIdToken.mockResolvedValue({ getPayload: () => googlePayload });
    User.findOne.mockImplementation(async (filter) =>
      filter.googleId ? null : User.__local
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete User.__local;
  });

  it('tài khoản CHƯA xác minh: giao cho chủ hộp thư, xoá mật khẩu và truất phiên cũ', async () => {
    User.__local = localUser(false);
    User.findOneAndUpdate.mockResolvedValue({ _id: 'local-1', email: googlePayload.email });

    const before = Date.now();
    const result = await authService.loginWithGoogle('id-token');

    const [filter, update, options] = User.findOneAndUpdate.mock.calls[0];
    // Điều kiện: vẫn chưa xác minh và chưa có Google tại thời điểm cập nhật
    expect(filter).toEqual({ _id: 'local-1', emailVerified: { $ne: true }, googleId: { $exists: false } });
    expect(update.$set.googleId).toBe('google-sub-1');
    expect(update.$set.emailVerified).toBe(true);
    // Mọi JWT cấp trước thời điểm này bị middleware auth từ chối
    expect(update.$set.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(update.$set.passwordChangedAt.getTime()).toBeLessThan(Date.now());
    // Mật khẩu của người đăng ký trước và các token còn treo bị xoá
    expect(update.$unset).toEqual(
      expect.objectContaining({
        password: 1,
        emailVerificationToken: 1,
        emailVerificationExpire: 1,
        resetPasswordToken: 1,
        resetPasswordExpire: 1,
      })
    );
    expect(options).toEqual({ returnDocument: 'after' });

    expect(jwt.verify(result.token, process.env.JWT_SECRET).id).toBe('local-1');
    expect(User.create).not.toHaveBeenCalled();
  });

  it('tài khoản ĐÃ xác minh: không tự gộp, trả 409 như trước', async () => {
    User.__local = localUser(true);

    await expect(authService.loginWithGoogle('id-token')).rejects.toMatchObject({
      statusCode: 409,
      code: 'EMAIL_IN_USE',
    });
    expect(User.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('nếu tài khoản vừa đổi trạng thái giữa chừng (cập nhật có điều kiện không khớp) thì trả 409', async () => {
    User.__local = localUser(false);
    User.findOneAndUpdate.mockResolvedValue(null);

    await expect(authService.loginWithGoogle('id-token')).rejects.toMatchObject({ statusCode: 409 });
  });

  it('tài khoản Google mới được tạo ở trạng thái đã xác minh', async () => {
    User.__local = null;
    User.create.mockImplementation(async (doc) => ({ _id: 'new-1', ...doc }));

    await authService.loginWithGoogle('id-token');

    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({ googleId: 'google-sub-1', emailVerified: true })
    );
  });
});

describe('Các đường khác chứng minh sở hữu hộp thư', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('liên kết Google từ Cài đặt đánh dấu email đã xác minh', async () => {
    verifyIdToken.mockResolvedValue({ getPayload: () => googlePayload });
    const current = { _id: 'u1', email: googlePayload.email, save: jest.fn().mockResolvedValue(undefined) };
    User.findById.mockResolvedValue(current);
    User.findOne.mockResolvedValue(null);

    await authService.linkGoogleAccount('u1', 'id-token');

    expect(current.googleId).toBe('google-sub-1');
    expect(current.emailVerified).toBe(true);
    expect(current.save).toHaveBeenCalled();
  });

  it('đặt lại mật khẩu bằng liên kết trong thư đánh dấu email đã xác minh', async () => {
    const user = { _id: 'u1', save: jest.fn().mockResolvedValue(undefined) };
    User.findOne.mockResolvedValue(user);

    await authService.resetPassword('token_hop_le', 'matkhaumoi1');

    expect(user.emailVerified).toBe(true);
    expect(user.save).toHaveBeenCalled();
  });
});
