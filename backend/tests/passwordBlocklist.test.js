const crypto = require('crypto');
const { findWeakness } = require('../src/utils/passwordBlocklist');
const pwned = require('../src/services/pwnedPasswordService');
const authService = require('../src/services/authService');
const User = require('../src/models/User');

jest.mock('../src/models/User');

process.env.JWT_SECRET = 'test_secret_key_for_unit_tests_only_32chars';

const sha1 = (s) => crypto.createHash('sha1').update(s, 'utf8').digest('hex').toUpperCase();

describe('findWeakness: mật khẩu hiển nhiên', () => {
  it.each(['12345678', 'qwertyui', 'iloveyou', 'matkhau123', 'password1'])(
    'chặn mật khẩu phổ biến %s',
    (password) => {
      expect(findWeakness(password)).toBe('common');
    }
  );

  it.each([
    ['Password1!', 'từ gốc kèm số và ký hiệu ở cuối'],
    ['P@ssw0rd', 'đổi chữ bằng số và ký hiệu'],
    ['Admin@123', 'từ gốc kèm @123'],
    ['MatKhau2026', 'tiếng Việt kèm năm'],
  ])('chặn %s (%s)', (password) => {
    expect(findWeakness(password)).toBe('common');
  });

  it.each(['11111111', 'abcdefgh', '87654321', '12341234', 'abababab'])(
    'chặn mẫu hiển nhiên %s',
    (password) => {
      expect(findWeakness(password)).toBe('common');
    }
  );

  it.each(['Ngoi-Nha-Nho-2026', 'correct horse battery staple', 'trung-lap-9XkQ', 'u7#Lm2$vPq'])(
    'cho qua mật khẩu không hiển nhiên %s',
    (password) => {
      expect(findWeakness(password)).toBeNull();
    }
  );

  it('không đụng tới mật khẩu ngắn hơn 8 ký tự: model từ chối chúng bằng thông điệp riêng', () => {
    expect(findWeakness('1234567')).toBeNull();
    expect(findWeakness('abc')).toBeNull();
  });

  it('không phân biệt hoa thường', () => {
    expect(findWeakness('QWERTYUI')).toBe('common');
  });
});

describe('findWeakness: đặc thù ngữ cảnh', () => {
  it('chặn mật khẩu chứa tên người dùng', () => {
    expect(findWeakness('nguoidung-2026-x', { username: 'nguoidung' })).toBe('personal');
  });

  it('chặn mật khẩu chứa phần đầu của email', () => {
    expect(findWeakness('tester.long#77', { email: 'tester.long@example.com' })).toBe('personal');
  });

  it('bỏ qua tên quá ngắn để khỏi chặn nhầm', () => {
    expect(findWeakness('Qk-lan-8Vz-mat', { username: 'lan', email: 'lan@example.com' })).toBeNull();
  });

  it('chặn tên của chính dịch vụ này', () => {
    expect(findWeakness('zelostech-2026-Q')).toBe('personal');
  });
});

describe('pwnedPasswordService.countBreaches', () => {
  const makeFetch = (body, init = {}) =>
    jest.fn().mockResolvedValue({ ok: true, text: async () => body, ...init });

  it('chỉ gửi 5 ký tự đầu của SHA-1, không gửi hậu tố hay mật khẩu', async () => {
    const hash = sha1('MatKhauKhacThuong');
    const fetchImpl = makeFetch('ABCDEF:3\r\n');

    await pwned.countBreaches('MatKhauKhacThuong', { fetchImpl, endpoint: 'https://pw.test/range/' });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe(`https://pw.test/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain(hash.slice(5, 12));
    expect(url).not.toContain('MatKhauKhacThuong');
    expect(options.headers['Add-Padding']).toBe('true');
  });

  it('trả về số vụ lộ khi hậu tố có trong phản hồi', async () => {
    const hash = sha1('hunter2hunter2');
    const body = `0000000000000000000000000000000000A:1\r\n${hash.slice(5)}:4271\r\nFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF:2\r\n`;

    const count = await pwned.countBreaches('hunter2hunter2', { fetchImpl: makeFetch(body) });

    expect(count).toBe(4271);
  });

  it('trả về 0 khi hậu tố không có trong phản hồi', async () => {
    const count = await pwned.countBreaches('mat-khau-chua-tung-lo', {
      fetchImpl: makeFetch('0000000000000000000000000000000000A:1\r\n'),
    });

    expect(count).toBe(0);
  });

  it('coi dòng đệm có số lần 0 là không bị lộ', async () => {
    const hash = sha1('dong-dem-gia');

    const count = await pwned.countBreaches('dong-dem-gia', { fetchImpl: makeFetch(`${hash.slice(5)}:0\r\n`) });

    expect(count).toBe(0);
  });

  it('trả về null khi dịch vụ trả mã lỗi: không biết thì cho qua', async () => {
    const count = await pwned.countBreaches('bat-ky-mat-khau', { fetchImpl: makeFetch('', { ok: false }) });

    expect(count).toBeNull();
  });

  it('trả về null khi mạng lỗi', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('ENOTFOUND'));

    expect(await pwned.countBreaches('bat-ky-mat-khau', { fetchImpl })).toBeNull();
  });

  it('trả về null khi quá thời gian chờ thay vì treo đăng ký', async () => {
    const fetchImpl = jest.fn(
      (url, { signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    expect(await pwned.countBreaches('bat-ky-mat-khau', { fetchImpl, timeoutMs: 20 })).toBeNull();
  });
});

describe('pwnedPasswordService.isEnabled', () => {
  it('bật ở production', () => {
    expect(pwned.isEnabled({ NODE_ENV: 'production' })).toBe(true);
  });

  it('tắt trong test để không gọi mạng thật', () => {
    expect(pwned.isEnabled({ NODE_ENV: 'test' })).toBe(false);
  });

  it('tắt được bằng PASSWORD_BREACH_CHECK=false', () => {
    expect(pwned.isEnabled({ NODE_ENV: 'production', PASSWORD_BREACH_CHECK: 'false' })).toBe(false);
  });
});

describe('authService áp dụng kiểm tra mật khẩu', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('từ chối mật khẩu phổ biến bằng 400 PASSWORD_TOO_COMMON và không tạo tài khoản', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(authService.register('nguoidung', 'a@example.com', 'password123')).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'PASSWORD_TOO_COMMON',
        messageKey: 'auth.passwordCommon',
      });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('từ chối mật khẩu chứa tên người dùng', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(
        authService.register('nguoidung', 'a@example.com', 'nguoidung-2026-xyz')
      ).rejects.toMatchObject({ statusCode: 400, errorCode: 'PASSWORD_PERSONAL' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('từ chối mật khẩu đã bị lộ', async () => {
      User.findOne.mockResolvedValue(null);
      jest.spyOn(pwned, 'isEnabled').mockReturnValue(true);
      jest.spyOn(pwned, 'countBreaches').mockResolvedValue(5);

      await expect(
        authService.register('nguoidung', 'a@example.com', 'Mot-Mat-Khau-Hay-Gap')
      ).rejects.toMatchObject({ statusCode: 400, errorCode: 'PASSWORD_BREACHED' });
      expect(User.create).not.toHaveBeenCalled();
    });

    it('cho qua khi dịch vụ kiểm tra không trả lời', async () => {
      User.findOne.mockResolvedValue(null);
      jest.spyOn(pwned, 'isEnabled').mockReturnValue(true);
      jest.spyOn(pwned, 'countBreaches').mockResolvedValue(null);
      User.create.mockResolvedValue({ _id: '6b1f1b1f1b1f1b1f1b1f1b1f', email: 'a@example.com' });

      const result = await authService.register('nguoidung', 'a@example.com', 'Mat-Khau-Rat-Dai-Va-La-2026');

      expect(User.create).toHaveBeenCalledTimes(1);
      expect(result.token).toBeDefined();
    });

    it('cho qua khi mật khẩu không có trong danh sách bị lộ', async () => {
      User.findOne.mockResolvedValue(null);
      jest.spyOn(pwned, 'isEnabled').mockReturnValue(true);
      jest.spyOn(pwned, 'countBreaches').mockResolvedValue(0);
      User.create.mockResolvedValue({ _id: '6b1f1b1f1b1f1b1f1b1f1b1f', email: 'a@example.com' });

      await authService.register('nguoidung', 'a@example.com', 'Mat-Khau-Rat-Dai-Va-La-2026');

      expect(User.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('resetPassword', () => {
    it('từ chối mật khẩu mới yếu và không lưu', async () => {
      const save = jest.fn();
      User.findOne.mockResolvedValue({ username: 'nguoidung', email: 'a@example.com', save });

      await expect(authService.resetPassword('a'.repeat(64), '12345678')).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'PASSWORD_TOO_COMMON',
      });
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('changePassword', () => {
    it('từ chối mật khẩu mới yếu sau khi đã kiểm mật khẩu hiện tại, và không lưu', async () => {
      const save = jest.fn();
      const user = {
        username: 'nguoidung',
        email: 'a@example.com',
        matchPassword: jest.fn().mockResolvedValue(true),
        save,
      };
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

      await expect(authService.changePassword('uid', 'mat-khau-cu-ok', 'qwertyui')).rejects.toMatchObject({
        statusCode: 400,
        errorCode: 'PASSWORD_TOO_COMMON',
      });
      expect(save).not.toHaveBeenCalled();
    });

    it('vẫn từ chối bằng 401 khi mật khẩu hiện tại sai, trước khi nói về mật khẩu mới', async () => {
      const user = { matchPassword: jest.fn().mockResolvedValue(false), save: jest.fn() };
      User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });

      await expect(authService.changePassword('uid', 'sai', '12345678')).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });
});
