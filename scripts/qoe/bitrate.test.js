/**
 * Khoá lại cách quy đổi "số byte đã tải" thành bitrate.
 *
 * Chạy được mà không cần Chromium: `require('playwright')` nằm bên trong
 * `runMeasurement` chứ không ở đầu `collect.js`, nên nạp module này trong Jest
 * không kéo theo trình duyệt.
 */

const {
  parseRenditionPlaylist,
  measureRenditionBitrates,
  collectLadderComparison,
  renditionToHeight,
  RENDITION_PATTERN,
  RENDITION_PLAYLIST_PATTERN,
} = require('./collect');

describe('parseRenditionPlaylist', () => {
  const playlist = [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:7',
    '#EXT-X-MEDIA-SEQUENCE:0',
    '#EXTINF:6.000000,',
    'segment_000.ts',
    '#EXTINF:6.000000,',
    'segment_001.ts',
    '#EXTINF:2.166667,',
    'segment_002.ts',
    '#EXT-X-ENDLIST',
  ].join('\n');

  it('đọc được thời lượng của từng segment', () => {
    const map = parseRenditionPlaylist(playlist);

    expect(map.size).toBe(3);
    expect(map.get('segment_000.ts')).toBeCloseTo(6.0, 6);
    expect(map.get('segment_002.ts')).toBeCloseTo(2.166667, 6);
  });

  it('không nhầm chỉ thị #EXT-X-ENDLIST thành tên tệp', () => {
    expect(parseRenditionPlaylist(playlist).has('#EXT-X-ENDLIST')).toBe(false);
  });

  it('bỏ qua dòng trống giữa #EXTINF và URI', () => {
    const withBlank = ['#EXTM3U', '#EXTINF:6.000000,', '', 'segment_000.ts'].join('\n');

    expect(parseRenditionPlaylist(withBlank).get('segment_000.ts')).toBeCloseTo(6.0, 6);
  });

  it('bỏ qua #EXTINF không có URI theo sau', () => {
    const truncated = ['#EXTM3U', '#EXTINF:6.000000,'].join('\n');

    expect(parseRenditionPlaylist(truncated).size).toBe(0);
  });

  it('chịu được playlist rỗng', () => {
    expect(parseRenditionPlaylist('').size).toBe(0);
  });

  it('chịu được dòng kết thúc kiểu CRLF', () => {
    const crlf = ['#EXTM3U', '#EXTINF:6.000000,', 'segment_000.ts'].join('\r\n');

    expect(parseRenditionPlaylist(crlf).get('segment_000.ts')).toBeCloseTo(6.0, 6);
  });
});

describe('renditionToHeight', () => {
  it.each([
    ['360p', 360],
    ['720p', 720],
    ['1080p', 1080],
  ])('%s → %i', (name, height) => {
    expect(renditionToHeight(name)).toBe(height);
  });
});

describe('RENDITION_PATTERN', () => {
  it('tách được cả tên rendition lẫn tên tệp segment', () => {
    const match = RENDITION_PATTERN.exec(
      'https://cdn.zelostech.site/videos/abc123/1080p/segment_007.ts'
    );

    expect(match[1]).toBe('1080p');
    expect(match[2]).toBe('segment_007.ts');
  });

  it('không khớp với playlist', () => {
    expect(
      RENDITION_PATTERN.exec('https://cdn.zelostech.site/videos/abc123/1080p/playlist.m3u8')
    ).toBeNull();
  });

  it('RENDITION_PLAYLIST_PATTERN tách được tên rendition từ playlist', () => {
    const match = RENDITION_PLAYLIST_PATTERN.exec(
      'https://cdn.zelostech.site/videos/abc123/720p/playlist.m3u8'
    );

    expect(match[1]).toBe('720p');
  });
});

describe('measureRenditionBitrates', () => {
  const durations = (entries) => new Map(Object.entries(entries));

  it('tính bitrate bằng 8 × byte ÷ giây', () => {
    // 3 000 000 byte trong 6 giây = 4 000 000 bit/s.
    const result = measureRenditionBitrates(
      [{ rendition: '1080p', file: 'segment_000.ts', bytes: 3_000_000 }],
      new Map([['1080p', durations({ 'segment_000.ts': 6 })]])
    );

    expect(result.get(1080).bitrate).toBe(4_000_000);
    expect(result.get(1080).segments).toBe(1);
  });

  it('dùng thời lượng thật của segment cuối, không mặc định 6 giây', () => {
    // Đây là lý do phải đọc EXTINF. Tổng 4 000 000 byte trong 8 giây thật
    // = 4 000 000 bit/s. Nếu coi mỗi segment là 6 giây thì mẫu số thành 12 và
    // kết quả tụt xuống 2 666 667 bit/s — sai 33%, luôn sai về phía thấp.
    const result = measureRenditionBitrates(
      [
        { rendition: '1080p', file: 'segment_000.ts', bytes: 3_000_000 },
        { rendition: '1080p', file: 'segment_001.ts', bytes: 1_000_000 },
      ],
      new Map([['1080p', durations({ 'segment_000.ts': 6, 'segment_001.ts': 2 })]])
    );

    expect(result.get(1080).bitrate).toBe(4_000_000);
    expect(result.get(1080).seconds).toBe(8);
  });

  it('tính từng rendition độc lập với nhau', () => {
    const result = measureRenditionBitrates(
      [
        { rendition: '360p', file: 'segment_000.ts', bytes: 300_000 },
        { rendition: '1080p', file: 'segment_000.ts', bytes: 3_000_000 },
      ],
      new Map([
        ['360p', durations({ 'segment_000.ts': 6 })],
        ['1080p', durations({ 'segment_000.ts': 6 })],
      ])
    );

    expect(result.get(360).bitrate).toBe(400_000);
    expect(result.get(1080).bitrate).toBe(4_000_000);
  });

  it('bỏ qua segment không tra được thời lượng thay vì đoán', () => {
    // Đoán bừa một giá trị sẽ tạo ra con số trông hợp lý nhưng sai, khó phát
    // hiện hơn hẳn so với việc thiếu số liệu.
    const result = measureRenditionBitrates(
      [
        { rendition: '1080p', file: 'segment_000.ts', bytes: 3_000_000 },
        { rendition: '1080p', file: 'segment_999.ts', bytes: 9_000_000 },
      ],
      new Map([['1080p', durations({ 'segment_000.ts': 6 })]])
    );

    expect(result.get(1080).bitrate).toBe(4_000_000);
    expect(result.get(1080).segments).toBe(1);
  });

  it('bỏ qua rendition không có playlist', () => {
    const result = measureRenditionBitrates(
      [{ rendition: '720p', file: 'segment_000.ts', bytes: 1_000_000 }],
      new Map()
    );

    expect(result.size).toBe(0);
  });

  it.each([
    ['thời lượng bằng 0', 0],
    ['thời lượng âm', -6],
  ])('bỏ qua segment có %s', (_label, duration) => {
    const result = measureRenditionBitrates(
      [{ rendition: '1080p', file: 'segment_000.ts', bytes: 3_000_000 }],
      new Map([['1080p', durations({ 'segment_000.ts': duration })]])
    );

    expect(result.size).toBe(0);
  });

  it('bỏ qua segment có số byte bằng 0', () => {
    const result = measureRenditionBitrates(
      [{ rendition: '1080p', file: 'segment_000.ts', bytes: 0 }],
      new Map([['1080p', durations({ 'segment_000.ts': 6 })]])
    );

    expect(result.size).toBe(0);
  });

  it('trả về Map rỗng khi không có segment nào', () => {
    expect(measureRenditionBitrates([], new Map()).size).toBe(0);
  });

  it('cộng dồn khi cùng một segment được tải lại', () => {
    // hls.js có thể tải lại một segment sau khi tua hoặc khi gặp lỗi mạng.
    // Cộng cả byte lẫn thời lượng thì tỉ số giữ nguyên, bitrate không đổi —
    // đó là hành vi đúng, vì bitrate là thuộc tính của bản mã hoá.
    const result = measureRenditionBitrates(
      [
        { rendition: '1080p', file: 'segment_000.ts', bytes: 3_000_000 },
        { rendition: '1080p', file: 'segment_000.ts', bytes: 3_000_000 },
      ],
      new Map([['1080p', durations({ 'segment_000.ts': 6 })]])
    );

    expect(result.get(1080).bitrate).toBe(4_000_000);
    expect(result.get(1080).segments).toBe(2);
  });

  it('phát hiện được mức chênh so với BANDWIDTH khai báo', () => {
    // Tái hiện một lát cắt 30 giây mã hoá ra MP4: khai 4192 kbit/s, thật
    // 3242. Bản chuyển mã đầy đủ dạng MPEG-TS lại lệch NGƯỢC chiều (4338
    // trung bình, 5390 đỉnh) — xem bảng trong README. Giữ cả hai chiều trong
    // bộ test vì bộ đo phải bộc lộ được lệch theo bất kỳ chiều nào.
    const bytes = Math.round((3_242_000 * 6) / 8);
    const result = measureRenditionBitrates(
      [{ rendition: '1080p', file: 'segment_000.ts', bytes }],
      new Map([['1080p', durations({ 'segment_000.ts': 6 })]])
    );

    const ratio = result.get(1080).bitrate / 4_192_000;
    expect(ratio).toBeGreaterThan(0.75);
    expect(ratio).toBeLessThan(0.79);
  });
});

describe('collectLadderComparison', () => {
  const log = (advertised, measured) => ({
    bitrateLadder: advertised,
    measuredBitrateLadder: measured,
  });

  it('cộng dồn byte và giây qua nhiều lần đo rồi mới chia', () => {
    // Lần đo 1: 1 segment. Lần đo 2: 3 segment. Bitrate thật của bản mã hoá
    // giống nhau ở cả hai, nên kết quả gộp phải bằng đúng bitrate đó.
    const result = collectLadderComparison([
      log({ 1080: 4_192_000 }, { 1080: { bitrate: 4_000_000, bytes: 3_000_000, seconds: 6, segments: 1 } }),
      log({ 1080: 4_192_000 }, { 1080: { bitrate: 4_000_000, bytes: 9_000_000, seconds: 18, segments: 3 } }),
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].measured).toBe(4_000_000);
    expect(result[0].segments).toBe(4);
  });

  it('cho lần đo tải nhiều segment hơn trọng số lớn hơn', () => {
    // Nếu lấy trung bình cộng hai bitrate thì ra 3 000 000. Cộng dồn byte/giây
    // thì lần đo 3 segment lấn át, ra 3 500 000 — đó mới là con số đúng.
    const result = collectLadderComparison([
      log({ 1080: 4_192_000 }, { 1080: { bitrate: 2_000_000, bytes: 1_500_000, seconds: 6, segments: 1 } }),
      log({ 1080: 4_192_000 }, { 1080: { bitrate: 4_000_000, bytes: 9_000_000, seconds: 18, segments: 3 } }),
    ]);

    expect(result[0].measured).toBe(3_500_000);
  });

  it('tính tỉ lệ so với con số khai báo', () => {
    const result = collectLadderComparison([
      log({ 1080: 4_000_000 }, { 1080: { bitrate: 3_200_000, bytes: 2_400_000, seconds: 6, segments: 1 } }),
    ]);

    expect(result[0].ratio).toBeCloseTo(0.8, 6);
  });

  it('sắp xếp theo chiều cao tăng dần', () => {
    const result = collectLadderComparison([
      log({ 1080: 4_192_000, 360: 464_000, 720: 1_628_000 }, {}),
    ]);

    expect(result.map((r) => r.height)).toEqual([360, 720, 1080]);
  });

  it('báo measured null cho bậc thang chưa từng được tải', () => {
    const result = collectLadderComparison([log({ 360: 464_000 }, {})]);

    expect(result[0].measured).toBeNull();
    expect(result[0].ratio).toBeNull();
    expect(result[0].segments).toBe(0);
  });

  it('vẫn liệt kê bậc thang đo được dù master playlist không đọc được', () => {
    const result = collectLadderComparison([
      log({}, { 720: { bitrate: 1_340_000, bytes: 1_005_000, seconds: 6, segments: 1 } }),
    ]);

    expect(result[0].height).toBe(720);
    expect(result[0].advertised).toBeNull();
    expect(result[0].ratio).toBeNull();
  });

  it('bộc lộ được bậc thang có bitrate VƯỢT con số khai báo', () => {
    // Số liệu thật của video 6aa1dd6f822dec77e188e56b: 1080p khai 4192 kbit/s
    // nhưng trung bình thật là 4338. RFC 8216 §4.3.4.2 bắt BANDWIDTH phải là
    // cận trên của bitrate segment, nên tỉ lệ > 1 là vi phạm chuẩn — và là
    // chiều lệch khiến hls.js chọn mức quá nặng rồi nghẽn.
    const bytes = Math.round((4_338_000 * 263.433) / 8);
    const result = collectLadderComparison([
      log(
        { 1080: 4_192_000 },
        { 1080: { bitrate: 4_338_000, bytes, seconds: 263.433, segments: 44 } }
      ),
    ]);

    expect(result[0].ratio).toBeGreaterThan(1);
    expect(result[0].ratio).toBeCloseTo(1.035, 2);
  });

  it('chịu được danh sách rỗng và giá trị thiếu', () => {
    expect(collectLadderComparison([])).toEqual([]);
    expect(collectLadderComparison(undefined)).toEqual([]);
    expect(collectLadderComparison([{}])).toEqual([]);
  });
});
