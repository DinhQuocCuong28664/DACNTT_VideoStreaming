const User = require('../src/models/User');

/**
 * Chính sách mật khẩu khi đặt mật khẩu mới.
 *
 * Kiểm bằng validate() nên không cần kết nối DB. Validation của Mongoose
 * chạy trước hook băm mật khẩu, nên nó thấy mật khẩu gốc.
 */
const errorFor = async (password) => {
  const user = new User({ username: 'nguoidung', email: 'a@b.co', password });
  try {
    await user.validate();
  } catch (err) {
    return err.errors && err.errors.password ? err.errors.password.message : null;
  }
  return null;
};

describe('Chính sách mật khẩu', () => {
  it('từ chối mật khẩu dưới 8 ký tự', async () => {
    expect(await errorFor('1234567')).toBe('Password must be at least 8 characters');
  });

  it('chấp nhận 8 ký tự trở lên', async () => {
    expect(await errorFor('12345678')).toBeNull();
  });

  it('chấp nhận đúng 72 byte, là giới hạn bcrypt còn dùng tới', async () => {
    expect(await errorFor('a'.repeat(72))).toBeNull();
  });

  it('từ chối quá 72 byte thay vì để bcrypt lặng lẽ cắt đuôi', async () => {
    expect(await errorFor('a'.repeat(73))).toBe('Password cannot exceed 72 bytes');
  });

  it('đếm theo byte UTF-8: 30 chữ "ệ" (3 byte mỗi chữ) là 90 byte', async () => {
    expect(await errorFor('ệ'.repeat(30))).toBe('Password cannot exceed 72 bytes');
  });
});
