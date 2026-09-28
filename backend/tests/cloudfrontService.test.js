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

      expect(resource).toBe('https://cdn.zelostech.site/videos/video123/*');
    });

    it('nên loại bỏ tiền tố giao thức nếu biến môi trường có sẵn https://', () => {
      process.env.CLOUDFRONT_DOMAIN = 'https://cdn.zelostech.site/';

      const resource = cloudfrontService.buildResourcePattern('video123');

      expect(resource).toBe('https://cdn.zelostech.site/videos/video123/*');
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
      // (chiều giải mã ngược lại: - -> +, _ -> =, ~ -> /)
      const policyJson = Buffer.from(
        cookies['CloudFront-Policy'].replace(/-/g, '+').replace(/_/g, '=').replace(/~/g, '/'),
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

    const VIDEO_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const VIDEO_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const INDEX = cloudfrontService.PLAYBACK_INDEX_COOKIE;

    const createMockReq = (indexValue) => ({ cookies: indexValue ? { [INDEX]: indexValue } : {} });
    const createMockRes = () => ({ cookie: jest.fn(), clearCookie: jest.fn() });
    const playbackSets = (res) =>
      res.cookie.mock.calls.filter(([name]) => name !== INDEX);
    const indexValue = (res) => res.cookie.mock.calls.find(([name]) => name === INDEX)[1];

    it('nên đặt đủ ba cookie vào phản hồi', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(), res, VIDEO_A);

      expect(playbackSets(res).map((call) => call[0])).toEqual([
        'CloudFront-Policy',
        'CloudFront-Signature',
        'CloudFront-Key-Pair-Id',
      ]);
    });

    it('nên đặt giá trị thật cho từng cookie, không để rỗng', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(), res, VIDEO_A);

      for (const [ten, giaTri] of playbackSets(res)) {
        expect(typeof giaTri).toBe('string');
        expect(giaTri.length).toBeGreaterThan(0);
        expect(ten).toBeTruthy();
      }
    });

    it('nên gắn bộ cookie vào đúng thư mục của video (Path=/videos/{id}/)', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(), res, VIDEO_A);

      for (const call of playbackSets(res)) {
        expect(call[2].path).toBe(`/videos/${VIDEO_A}/`);
      }
    });

    /**
     * Lỗi đã sửa: trước đây mọi video dùng chung ba cookie ở Path=/, nên mở
     * video thứ hai ở tab khác ghi đè cookie của video thứ nhất và hai tab
     * giành nhau ở từng segment. Giờ cấp cho video B không được đụng tới bộ
     * cookie của video A.
     */
    it('không xoá hay ghi đè bộ cookie của video khác đang xem ở tab khác', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(VIDEO_A), res, VIDEO_B);

      const touchedPaths = [
        ...res.cookie.mock.calls.map((call) => call[2].path),
        ...res.clearCookie.mock.calls.map((call) => call[1].path),
      ];
      expect(touchedPaths).not.toContain(`/videos/${VIDEO_A}/`);
      expect(indexValue(res)).toBe(`${VIDEO_A},${VIDEO_B}`);
    });

    it('nên xoá bộ cookie kiểu cũ ở Path=/ để request tới CDN không mang hai bộ trùng tên', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(), res, VIDEO_A);

      const clearedAtRoot = res.clearCookie.mock.calls.filter((call) => call[1].path === '/');
      expect(clearedAtRoot.map((call) => call[0])).toEqual([
        'CloudFront-Policy',
        'CloudFront-Signature',
        'CloudFront-Key-Pair-Id',
      ]);
    });

    it('chỉ theo dõi tối đa MAX_TRACKED_VIDEOS video và thu hồi cookie của video cũ nhất', () => {
      const max = cloudfrontService.MAX_TRACKED_VIDEOS;
      const ids = Array.from({ length: max }, (_, i) => i.toString(16).padStart(24, '0'));
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(ids.join(',')), res, VIDEO_A);

      const tracked = indexValue(res).split(',');
      expect(tracked).toHaveLength(max);
      expect(tracked).not.toContain(ids[0]);
      expect(tracked[tracked.length - 1]).toBe(VIDEO_A);
      expect(res.clearCookie.mock.calls.some((call) => call[1].path === `/videos/${ids[0]}/`)).toBe(true);
    });

    it('bỏ qua giá trị lạ trong cookie chỉ mục do trình duyệt gửi lên', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq('../../etc,<script>,' + VIDEO_B), res, VIDEO_A);

      expect(indexValue(res)).toBe(`${VIDEO_B},${VIDEO_A}`);
    });

    it('nên đặt cờ httpOnly để JavaScript phía trình duyệt không đọc được chữ ký', () => {
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(), res, VIDEO_A);

      for (const call of res.cookie.mock.calls) {
        expect(call[2].httpOnly).toBe(true);
      }
    });

    it('nên bật cờ secure ở môi trường production', () => {
      process.env.NODE_ENV = 'production';
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(), res, VIDEO_A);

      for (const call of res.cookie.mock.calls) {
        expect(call[2].secure).toBe(true);
      }
    });

    it('nên áp dụng COOKIE_DOMAIN để cookie được gửi kèm sang tên miền con của CDN', () => {
      process.env.COOKIE_DOMAIN = '.zelostech.site';
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(), res, VIDEO_A);

      for (const call of playbackSets(res)) {
        expect(call[2].domain).toBe('.zelostech.site');
      }
    });

    it('không nên đặt thuộc tính domain khi biến COOKIE_DOMAIN bỏ trống', () => {
      delete process.env.COOKIE_DOMAIN;
      const res = createMockRes();

      cloudfrontService.attachPlaybackCookies(createMockReq(), res, VIDEO_A);

      for (const call of res.cookie.mock.calls) {
        expect(call[2].domain).toBeUndefined();
      }
    });
  });

  describe('clearPlaybackCookies', () => {
    beforeEach(enableSigning);

    const VIDEO_A = 'aaaaaaaaaaaaaaaaaaaaaaaa';
    const VIDEO_B = 'bbbbbbbbbbbbbbbbbbbbbbbb';
    const INDEX = cloudfrontService.PLAYBACK_INDEX_COOKIE;

    it('nên xoá bộ cookie của mọi video đã cấp, bộ kiểu cũ, và cookie chỉ mục', () => {
      const res = { clearCookie: jest.fn() };

      cloudfrontService.clearPlaybackCookies({ cookies: { [INDEX]: `${VIDEO_A},${VIDEO_B}` } }, res);

      const cleared = res.clearCookie.mock.calls.map(([name, options]) => `${options.path} ${name}`);
      for (const path of [`/videos/${VIDEO_A}/`, `/videos/${VIDEO_B}/`, '/']) {
        expect(cleared).toContain(`${path} CloudFront-Policy`);
        expect(cleared).toContain(`${path} CloudFront-Signature`);
        expect(cleared).toContain(`${path} CloudFront-Key-Pair-Id`);
      }
      expect(cleared).toContain(`/api ${INDEX}`);
    });

    /**
     * Đây là bài kiểm tra quan trọng nhất của nhóm này. Trình duyệt chỉ xoá
     * một cookie khi domain và path của lệnh xoá trùng khớp với lúc đặt; lệch
     * dù chỉ một thuộc tính thì nó coi đây là cookie khác, âm thầm không làm
     * gì, và cookie cũ vẫn còn hiệu lực. Máy chủ vẫn trả 200 nên không có dấu
     * hiệu nào cho thấy việc thu hồi đã thất bại.
     *
     * So sánh trực tiếp với tham số mà attachPlaybackCookies dùng, thay vì
     * viết lại giá trị mong đợi bằng hằng số — nếu sau này ai đó đổi domain
     * hay path ở một bên mà quên bên kia, test này phải gãy.
     */
    it('nên dùng đúng domain/path/sameSite như lúc đặt, nếu không trình duyệt sẽ không xoá', () => {
      process.env.COOKIE_DOMAIN = '.zelostech.site';

      const resDat = { cookie: jest.fn(), clearCookie: jest.fn() };
      cloudfrontService.attachPlaybackCookies({ cookies: {} }, resDat, VIDEO_A);
      const datTheoTen = new Map(resDat.cookie.mock.calls.map(([name, , options]) => [name, options]));
      const indexLucDat = resDat.cookie.mock.calls.find(([name]) => name === INDEX)[1];

      const resXoa = { clearCookie: jest.fn() };
      cloudfrontService.clearPlaybackCookies({ cookies: { [INDEX]: indexLucDat } }, resXoa);

      for (const name of datTheoTen.keys()) {
        const optionsLucDat = datTheoTen.get(name);
        const optionsLucXoa = resXoa.clearCookie.mock.calls.find(
          ([tenXoa, options]) => tenXoa === name && options.path === optionsLucDat.path
        );
        expect(optionsLucXoa).toBeDefined();
        const [, xoa] = optionsLucXoa;
        expect(xoa.domain).toBe(optionsLucDat.domain);
        expect(xoa.sameSite).toBe(optionsLucDat.sameSite);
        expect(xoa.secure).toBe(optionsLucDat.secure);
        expect(xoa.httpOnly).toBe(optionsLucDat.httpOnly);
      }
    });

    it('không nên đặt thuộc tính domain khi COOKIE_DOMAIN bỏ trống', () => {
      delete process.env.COOKIE_DOMAIN;
      const res = { clearCookie: jest.fn() };

      cloudfrontService.clearPlaybackCookies({ cookies: {} }, res);

      for (const call of res.clearCookie.mock.calls) {
        expect(call[1].domain).toBeUndefined();
      }
    });

    it('vẫn xoá bộ kiểu cũ khi trình duyệt không gửi cookie chỉ mục', () => {
      const res = { clearCookie: jest.fn() };

      cloudfrontService.clearPlaybackCookies({}, res);

      expect(res.clearCookie.mock.calls.filter((call) => call[1].path === '/')).toHaveLength(3);
    });
  });
});
