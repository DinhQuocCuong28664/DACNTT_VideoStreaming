/**
 * Kiểm thử endpoint quên mật khẩu, tập trung vào một tính chất bảo mật:
 * phản hồi KHÔNG được tiết lộ email có tồn tại trong hệ thống hay không.
 *
 * Các test ở đây cố ý so sánh phản hồi giữa hai nhánh với nhau, thay vì
 * so từng nhánh với một chuỗi hằng chép từ code. Chép chuỗi từ code chỉ
 * chứng minh code không đổi, còn tính chất cần giữ là hai nhánh giống
 * NHAU — nếu sau này thông điệp có sửa, test vẫn phải bắt được việc hai
 * nhánh lệch nhau.
 */
const authController = require('../src/controllers/authController');
const authService = require('../src/services/authService');
const emailService = require('../src/services/emailService');

jest.mock('../src/services/authService');
jest.mock('../src/services/emailService');

const createMockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

/** Người dùng giả, đủ để controller thu hồi token khi gửi mail hỏng */
const createMockUser = () => ({
  email: 'nguoidung@example.com',
  resetPasswordToken: 'token_da_bam',
  resetPasswordExpire: new Date(Date.now() + 900000),
  save: jest.fn().mockResolvedValue(undefined),
});

describe('POST /api/auth/forgot-password — chống dò email đã đăng ký', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('nên trả về 200 khi email KHÔNG ứng với tài khoản nào', async () => {
    authService.forgotPassword.mockResolvedValue(null);

    const req = { body: { email: 'khongtontai@example.com' } };
    const res = createMockRes();
    const next = jest.fn();

    await authController.forgotPassword(req, res, next);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(next).not.toHaveBeenCalled();
    // Không được gửi mail cho địa chỉ không có tài khoản
    expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('nên trả về phản hồi GIỐNG HỆT dù email có tồn tại hay không', async () => {
    // Nhánh 1: email không tồn tại
    authService.forgotPassword.mockResolvedValue(null);
    const resKhongTonTai = createMockRes();
    await authController.forgotPassword(
      { body: { email: 'khongtontai@example.com' } },
      resKhongTonTai,
      jest.fn()
    );

    // Nhánh 2: email tồn tại, gửi mail thành công
    authService.forgotPassword.mockResolvedValue({
      user: createMockUser(),
      resetToken: 'token_thô',
    });
    emailService.sendPasswordResetEmail.mockResolvedValue(undefined);
    const resTonTai = createMockRes();
    await authController.forgotPassword(
      { body: { email: 'nguoidung@example.com' } },
      resTonTai,
      jest.fn()
    );

    // Đây là tính chất cần bảo vệ: kẻ tấn công không phân biệt được hai nhánh
    expect(resTonTai.status.mock.calls).toEqual(resKhongTonTai.status.mock.calls);
    expect(resTonTai.json.mock.calls).toEqual(resKhongTonTai.json.mock.calls);
  });

  it('nên giữ nguyên phản hồi đó ngay cả khi gửi mail thất bại', async () => {
    // Nếu lỗi gửi mail làm rò ra 500, thì chính mã 500 đó đã tiết lộ tài
    // khoản có thật — lỗ hổng cũ quay lại dưới hình thức khác.
    authService.forgotPassword.mockResolvedValue(null);
    const resKhongTonTai = createMockRes();
    await authController.forgotPassword(
      { body: { email: 'khongtontai@example.com' } },
      resKhongTonTai,
      jest.fn()
    );

    const user = createMockUser();
    authService.forgotPassword.mockResolvedValue({ user, resetToken: 'token_thô' });
    emailService.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP timeout'));

    const resLoiMail = createMockRes();
    const next = jest.fn();
    await authController.forgotPassword(
      { body: { email: 'nguoidung@example.com' } },
      resLoiMail,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(resLoiMail.status.mock.calls).toEqual(resKhongTonTai.status.mock.calls);
    expect(resLoiMail.json.mock.calls).toEqual(resKhongTonTai.json.mock.calls);
  });

  it('nên thu hồi token đặt lại khi gửi mail thất bại', async () => {
    // Không được để lại một token còn hiệu lực mà người dùng chẳng bao giờ nhận
    const user = createMockUser();
    authService.forgotPassword.mockResolvedValue({ user, resetToken: 'token_thô' });
    emailService.sendPasswordResetEmail.mockRejectedValue(new Error('SMTP timeout'));

    await authController.forgotPassword(
      { body: { email: 'nguoidung@example.com' } },
      createMockRes(),
      jest.fn()
    );

    expect(user.resetPasswordToken).toBeUndefined();
    expect(user.resetPasswordExpire).toBeUndefined();
    expect(user.save).toHaveBeenCalled();
  });

  it('nên gửi mail đặt lại tới đúng địa chỉ khi tài khoản tồn tại', async () => {
    const user = createMockUser();
    authService.forgotPassword.mockResolvedValue({ user, resetToken: 'token_thô' });
    emailService.sendPasswordResetEmail.mockResolvedValue(undefined);

    await authController.forgotPassword(
      { body: { email: 'nguoidung@example.com' } },
      createMockRes(),
      jest.fn()
    );

    expect(emailService.sendPasswordResetEmail).toHaveBeenCalledTimes(1);
    const [nguoiNhan, resetUrl] = emailService.sendPasswordResetEmail.mock.calls[0];
    expect(nguoiNhan).toBe(user.email);
    // Liên kết phải trỏ tới trang frontend kèm token thô, không phải route API
    expect(resetUrl).toContain('/reset-password/token_thô');
  });
});
