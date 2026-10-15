/**
 * Trạng thái xác minh email trên model User thật (không mock).
 */
const User = require('../src/models/User');

describe('User.hasVerifiedEmail / toJSON', () => {
  it('tài khoản mới mặc định chưa xác minh', () => {
    const user = new User({ username: 'moi', email: 'moi@example.com', password: 'matkhau123' });

    expect(user.emailVerified).toBe(false);
    expect(user.hasVerifiedEmail()).toBe(false);
    expect(user.toJSON().emailVerified).toBe(false);
  });

  it('tài khoản có googleId coi như đã xác minh, kể cả khi trường chưa được đặt', () => {
    // Tài khoản Google tạo trước khi có tính năng này không có emailVerified.
    const user = new User({ username: 'gg', email: 'gg@example.com', googleId: 'google-sub-1' });

    expect(user.emailVerified).toBe(false);
    expect(user.hasVerifiedEmail()).toBe(true);
    expect(user.toJSON().emailVerified).toBe(true);
  });

  it('toJSON không bao giờ trả token xác minh', () => {
    const user = new User({
      username: 'moi',
      email: 'moi@example.com',
      password: 'matkhau123',
      emailVerificationToken: 'f'.repeat(64),
      emailVerificationExpire: new Date(),
    });

    const json = user.toJSON();
    expect(json).not.toHaveProperty('emailVerificationToken');
    expect(json).not.toHaveProperty('emailVerificationExpire');
    expect(json).not.toHaveProperty('password');
  });
});
