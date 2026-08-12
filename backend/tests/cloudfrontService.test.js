const crypto = require('crypto');
const cloudfrontService = require('../src/services/cloudfrontService');

/**
 * Sinh một cặp khóa RSA thật ngay trong bộ test.
 *
 * Việc dùng khóa thật thay vì giả lập giúp kiểm chứng rằng chuỗi chữ ký được
 * tạo ra đúng theo thuật toán mà CloudFront yêu cầu, thay vì chỉ kiểm tra việc
 * hàm có được gọi hay không.
 */
const { privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const ORIGINAL_ENV = { ...process.env };

const enableSigning = () => {
  process.env.CLOUDFRONT_KEY_PAIR_ID = 'K2ABCDEFGHIJKL';
  process.env.CLOUDFRONT_PRIVATE_KEY = privateKey;
  process.env.CLOUDFRONT_DOMAIN = 'cdn.zelostech.site';
};

const disableSigning = () => {
  delete process.env.CLOUDFRONT_KEY_PAIR_ID;
  delete process.env.CLOUDFRONT_PRIVATE_KEY;
  delete process.env.CLOUDFRONT_DOMAIN;
};

describe('Dịch vụ cấp CloudFront Signed Cookie', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe('isSigningEnabled', () => {
    it('nên trả về false khi chưa cấu hình đủ biến môi trường', () => {
      disableSigning();
      expect(cloudfrontService.isSigningEnabled()).toBe(false);
    });

    it('nên trả về false khi thiếu khóa bí mật', () => {
      enableSigning();
      delete process.env.CLOUDFRONT_PRIVATE_KEY;
      expect(cloudfrontService.isSigningEnabled()).toBe(false);
    });

    it('nên trả về true khi đã cấu hình đầy đủ', () => {
      enableSigning();
      expect(cloudfrontService.isSigningEnabled()).toBe(true);
    });
  });

  describe('buildResourcePattern', () => {
    beforeEach(enableSigning);

    it('nên giới hạn phạm vi ký trong đúng thư mục của video', () => {
      const resource = cloudfrontService.buildResourcePattern('video123');

      expect(resource).toBe('https://cdn.zelostech.site/videos/*/video123/*');
    });

    it('nên loại bỏ tiền tố giao thức nếu biến môi trường có sẵn https://', () => {
      process.env.CLOUDFRONT_DOMAIN = 'https://cdn.zelostech.site/';

      const resource = cloudfrontService.buildResourcePattern('video123');

      expect(resource).toBe('https://cdn.zelostech.site/videos/*/video123/*');
    });

    it('không được cấp quyền sang video khác', () => {
      const resourceA = cloudfrontService.buildResourcePattern('videoA');

      expect(resourceA).not.toContain('videoB');
      // Ký tự đại diện chỉ nằm ở phần userId và phần tệp bên trong thư mục video
      expect(resourceA.endsWith('/videoA/*')).toBe(true);
    });
  });

  describe('generatePlaybackCookies', () => {
    beforeEach(enableSigning);

    it('nên báo lỗi 503 khi máy chủ chưa bật cơ chế ký', () => {
      disableSigning();

      expect(() => cloudfrontService.generatePlaybackCookies('video123')).toThrow(
        expect.objectContaining({ statusCode: 503 })
      );
    });

    it('nên sinh đủ ba cookie theo đặc tả của CloudFront', () => {
      const { cookies } = cloudfrontService.generatePlaybackCookies('video123');

      // Phải là CloudFront-Policy (Custom Policy) chứ không phải CloudFront-Expires:
      // chỉ Custom Policy mới hỗ trợ ký tự đại diện trong đường dẫn tài nguyên.
      expect(cookies).toHaveProperty('CloudFront-Policy');
      expect(cookies).toHaveProperty('CloudFront-Signature');
      expect(cookies).toHaveProperty('CloudFront-Key-Pair-Id');
      expect(cookies).not.toHaveProperty('CloudFront-Expires');
    });

    it('nên sinh giá trị cookie không rỗng cho cả ba cookie', () => {
      const { cookies } = cloudfrontService.generatePlaybackCookies('video123');

      for (const value of Object.values(cookies)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    });

    it('cookie Policy nên mã hóa đúng tài nguyên dạng wildcard của video', () => {
      const { cookies, resource } = cloudfrontService.generatePlaybackCookies('video123');

      // CloudFront dùng base64 an toàn cho URL: + / = được thay bằng - _ ~
      const policyJson = Buffer.from(
        cookies['CloudFront-Policy'].replace(/-/g, '+').replace(/_/g, '/').replace(/~/g, '='),
        'base64'
      ).toString('utf8');

      const parsed = JSON.parse(policyJson);
      expect(parsed.Statement[0].Resource).toBe(resource);
      expect(parsed.Statement[0].Condition.DateLessThan).toHaveProperty('AWS:EpochTime');
    });

    it('nên đặt đúng Key Pair Id đã cấu hình', () => {
      const { cookies } = cloudfrontService.generatePlaybackCookies('video123');

      expect(cookies['CloudFront-Key-Pair-Id']).toBe('K2ABCDEFGHIJKL');
    });

    it('nên đặt thời điểm hết hạn trong tương lai', () => {
      const { expiresAt } = cloudfrontService.generatePlaybackCookies('video123');

      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('nên đặt thời hạn đúng bằng hằng số cấu hình', () => {
      const truoc = Date.now();
      const { expiresAt } = cloudfrontService.generatePlaybackCookies('video123');

      const thoiLuong = expiresAt.getTime() - truoc;
      const duKien = cloudfrontService.COOKIE_TTL_SECONDS * 1000;

      // Cho phép sai lệch nhỏ do thời gian thực thi
      expect(Math.abs(thoiLuong - duKien)).toBeLessThan(2000);
    });

    it('nên sinh chữ ký khác nhau cho các video khác nhau', () => {
      const a = cloudfrontService.generatePlaybackCookies('videoA');
      const b = cloudfrontService.generatePlaybackCookies('videoB');

      expect(a.cookies['CloudFront-Signature']).not.toBe(b.cookies['CloudFront-Signature']);
    });

    it('nên chấp nhận khóa bí mật có ký tự xuống dòng bị mã hóa dạng \\n', () => {
      process.env.CLOUDFRONT_PRIVATE_KEY = privateKey.replace(/\n/g, '\\n');

      expect(() => cloudfrontService.generatePlaybackCookies('video123')).not.toThrow();
    });
  });

  describe('attachPlaybackCookies', () => {
    beforeEach(enableSigning);

    const createMockRes = () => ({ cookie: jest.fn() });

    it('nên đặt đủ ba cookie vào phản hồi', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(res, 'video123');

      expect(res.cookie).toHaveBeenCalledTimes(3);
      const tenCookie = res.cookie.mock.calls.map((call) => call[0]);
      expect(tenCookie).toEqual([
        'CloudFront-Policy',
        'CloudFront-Signature',
        'CloudFront-Key-Pair-Id',
      ]);
    });

    it('nên đặt giá trị thật cho từng cookie, không để rỗng', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(res, 'video123');

      for (const [ten, giaTri] of res.cookie.mock.calls.map((c) => [c[0], c[1]])) {
        expect(typeof giaTri).toBe('string');
        expect(giaTri.length).toBeGreaterThan(0);
        expect(ten).toBeTruthy();
      }
    });

    it('nên đặt cờ httpOnly để JavaScript phía trình duyệt không đọc được chữ ký', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(res, 'video123');

      for (const call of res.cookie.mock.calls) {
        expect(call[2].httpOnly).toBe(true);
      }
    });

    it('nên bật cờ secure ở môi trường production', () => {
      process.env.NODE_ENV = 'production';
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(res, 'video123');

      for (const call of res.cookie.mock.calls) {
        expect(call[2].secure).toBe(true);
      }
    });

    it('nên áp dụng COOKIE_DOMAIN để cookie được gửi kèm sang tên miền con của CDN', () => {
      process.env.COOKIE_DOMAIN = '.zelostech.site';
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(res, 'video123');

      for (const call of res.cookie.mock.calls) {
        expect(call[2].domain).toBe('.zelostech.site');
      }
    });

    it('không nên đặt thuộc tính domain khi biến COOKIE_DOMAIN bỏ trống', () => {
      delete process.env.COOKIE_DOMAIN;
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(res, 'video123');

      for (const call of res.cookie.mock.calls) {
        expect(call[2].domain).toBeUndefined();
      }
    });
  });
});
