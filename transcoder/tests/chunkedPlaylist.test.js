const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  readChunkRendition,
  buildMediaPlaylist,
  collectSegments,
  renditionStats,
  validateChunkResults,
  sumSeconds,
} = require('../src/chunked/playlist');
const { buildChunkPlan, parseRational } = require('../src/chunked/plan');
const { parseMediaPlaylist, buildMasterPlaylist } = require('../src/transcoder');

/**
 * Ghép kết quả các đoạn thành playlist và kiểm tra tính nhất quán trước khi công bố.
 */

const seg = (file, duration, bytes = 1000) => ({ file, duration, bytes });

describe('buildMediaPlaylist', () => {
  const segments = [seg('segment_c0000_000.ts', 6.006), seg('segment_c0000_001.ts', 6.006), seg('segment_c0001_000.ts', 3.937267)];
  const text = buildMediaPlaylist(segments);

  it('có đủ phần đầu và ENDLIST, cùng định dạng với playlist ffmpeg tự ghi', () => {
    expect(text.startsWith('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n')).toBe(true);
    expect(text.endsWith('#EXT-X-ENDLIST\n')).toBe(true);
    expect(text).toContain('#EXTINF:6.006000,\nsegment_c0000_000.ts\n');
  });

  it('đọc lại bằng parseMediaPlaylist ra đúng danh sách ban đầu, đúng thứ tự', () => {
    expect(parseMediaPlaylist(text)).toEqual(segments.map(({ file, duration }) => ({ file, duration })));
  });

  it('TARGETDURATION là độ dài segment dài nhất làm tròn (RFC 8216 §4.3.3.1)', () => {
    expect(buildMediaPlaylist([seg('a.ts', 6.006), seg('b.ts', 7.4)])).toContain('#EXT-X-TARGETDURATION:7\n');
    expect(buildMediaPlaylist([seg('a.ts', 0.2)])).toContain('#EXT-X-TARGETDURATION:1\n');
  });

  it('EXTINF làm tròn của mọi segment không bao giờ vượt TARGETDURATION', () => {
    // 6,6 s làm tròn thành 7: nếu TARGETDURATION làm tròn xuống (6) thì playlist vi phạm RFC.
    for (const durations of [[6.6, 6.006], [6.5, 6], [6.49, 6.51], [2.5]]) {
      const text = buildMediaPlaylist(durations.map((d, i) => seg(`s${i}.ts`, d)));
      const target = Number(/#EXT-X-TARGETDURATION:(\d+)/.exec(text)[1]);
      for (const d of durations) expect(Math.round(d)).toBeLessThanOrEqual(target);
    }
  });
});

describe('collectSegments', () => {
  it('nối segment theo thứ tự đoạn và bỏ qua đoạn không có mức đó', () => {
    const results = [
      { renditions: { '720p': { segments: [seg('a.ts', 6)] } } },
      { renditions: { '720p': { segments: [seg('b.ts', 6), seg('c.ts', 6)] } } },
      { renditions: {} },
    ];
    expect(collectSegments(results, '720p').map((s) => s.file)).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(collectSegments(results, '360p')).toEqual([]);
  });
});

describe('renditionStats', () => {
  it('BANDWIDTH lấy từ segment nặng nhất, làm tròn LÊN, trung bình theo tổng byte/tổng giây', () => {
    const stats = renditionStats([seg('a.ts', 6, 750000), seg('b.ts', 6, 900001), seg('c.ts', 3, 300000)]);
    expect(stats.peak).toBe(Math.ceil((900001 * 8) / 6));
    expect(stats.average).toBe(Math.round(((750000 + 900001 + 300000) * 8) / 15));
    expect(stats.segments).toBe(3);
  });

  it('bỏ segment không đo được; không có gì để đo thì trả null', () => {
    expect(renditionStats([seg('a.ts', 0, 100), seg('b.ts', 6, 0)])).toBeNull();
    expect(renditionStats([])).toBeNull();
    expect(renditionStats([seg('a.ts', 0, 100), seg('b.ts', 6, 600)]).segments).toBe(1);
  });

  it('cho cùng kết quả với đường một-job khi đưa vào buildMasterPlaylist', () => {
    const stats = renditionStats([seg('a.ts', 6, 750000), seg('b.ts', 6, 900001)]);
    const { content } = buildMasterPlaylist(
      [{ name: '720p', videoBitrate: '1500k', audioBitrate: '128k', width: 1280, height: 720 }],
      { '720p': stats },
      { '720p': 'avc1.4d401f,mp4a.40.2' }
    );
    expect(content).toContain(`BANDWIDTH=${stats.peak},CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=1280x720`);
  });
});

describe('validateChunkResults', () => {
  // 4 đoạn: mỗi đoạn 50 segment x 6,006 s = 300,3 s; đoạn cuối mở.
  const plan = buildChunkPlan({ frameCount: 9000 * 3 + 5000, fps: parseRational('30000/1001'), gopsPerChunk: 50 });
  const names = ['360p', '720p'];

  const goodSegments = (k, count = 50, duration = 6.006) =>
    Array.from({ length: count }, (_, i) => seg(`segment_c${String(k).padStart(4, '0')}_${String(i).padStart(3, '0')}.ts`, duration));

  const goodResults = () =>
    plan.chunks.map((c, k) => {
      const segments = goodSegments(k, c.expectedSegments || 27, 6.006);
      return { index: k, renditions: { '360p': { segments }, '720p': { segments } } };
    });

  it('chấp nhận một bộ kết quả đúng kế hoạch', () => {
    expect(validateChunkResults({ plan, results: goodResults(), renditionNames: names })).toEqual({ errors: [], warnings: [] });
  });

  it('thiếu kết quả của một đoạn là lỗi', () => {
    const results = goodResults();
    results[2] = undefined;
    const { errors } = validateChunkResults({ plan, results, renditionNames: names });
    expect(errors).toEqual(['đoạn 2: không có kết quả']);
  });

  it('đoạn giữa không có segment là lỗi, nhưng đoạn cuối rỗng thì chấp nhận (ước lượng khung hình cao)', () => {
    const results = goodResults();
    results[1] = { index: 1, renditions: { '360p': { segments: [] }, '720p': { segments: [] } } };
    expect(validateChunkResults({ plan, results, renditionNames: names }).errors).toEqual(['đoạn 1: không sinh ra segment nào']);

    const lastEmpty = goodResults();
    lastEmpty[3] = { index: 3, renditions: { '360p': { segments: [] }, '720p': { segments: [] } } };
    expect(validateChunkResults({ plan, results: lastEmpty, renditionNames: names }).errors).toEqual([]);
  });

  it('các mức không cùng ranh giới segment là lỗi (vi phạm RFC 8216 §6.2.4, đổi mức sẽ vỡ hình)', () => {
    const results = goodResults();
    results[1].renditions['720p'] = { segments: goodSegments(1, 49) };
    expect(validateChunkResults({ plan, results, renditionNames: names }).errors[0]).toMatch(/đoạn 1: mức 720p và 360p/);

    const results2 = goodResults();
    results2[1].renditions['720p'] = { segments: goodSegments(1, 50, 6.1) };
    expect(validateChunkResults({ plan, results: results2, renditionNames: names }).errors[0]).toMatch(/đoạn 1: mức 720p/);
  });

  it('đoạn dài khác kế hoạch quá 0,25 s là lỗi vì pts đoạn sau theo kế hoạch: khe hở hoặc chồng lấn thật', () => {
    const results = goodResults();
    const segments = goodSegments(1, 50, 6.0);
    results[1] = { index: 1, renditions: { '360p': { segments }, '720p': { segments } } };
    const { errors } = validateChunkResults({ plan, results, renditionNames: names });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/đoạn 1: dài 300.000 s, kế hoạch 300.3 s/);
  });

  it('một khung thừa mỗi đoạn (33 ms ở 29,97 fps) phải lộ ra, không lọt qua ngưỡng tính bằng giây', () => {
    // Chính lỗi đã gặp: -t ở đầu vào cho 541 khung thay vì 540. 33 ms vẫn nhỏ hơn mọi ngưỡng
    // "50 ms" kiểu cũ, nhưng ở 48 đoạn nó cộng dồn thành 1,6 s lệch giữa EXTINF và pts.
    const results = goodResults();
    const segments = [...goodSegments(1, 50), seg('segment_c0001_050.ts', 1001 / 30000)];
    results[1] = { index: 1, renditions: { '360p': { segments }, '720p': { segments } } };
    const verdict = validateChunkResults({ plan, results, renditionNames: names });
    expect(verdict.errors).toEqual([]);
    expect(verdict.warnings).toEqual(expect.arrayContaining([expect.stringMatching(/đoạn 1: lệch 0\.033/)]));
  });

  it('lệch dưới nửa khung (làm tròn micro-giây) không cảnh báo', () => {
    const results = goodResults();
    const segments = goodSegments(1, 50, 6.006 + 0.000002);
    results[1] = { index: 1, renditions: { '360p': { segments }, '720p': { segments } } };
    expect(validateChunkResults({ plan, results, renditionNames: names })).toEqual({ errors: [], warnings: [] });
  });

  it('lệch từ 3 khung trở lên là lỗi', () => {
    const results = goodResults();
    const segments = [...goodSegments(1, 50), seg('segment_c0001_050.ts', (4 * 1001) / 30000)]; // 4 khung thừa
    results[1] = { index: 1, renditions: { '360p': { segments }, '720p': { segments } } };
    expect(validateChunkResults({ plan, results, renditionNames: names }).errors[0]).toMatch(/đoạn 1: dài/);
  });

  it('không kiểm thời lượng của đoạn cuối: nó mở nên độ dài tuỳ nguồn', () => {
    const results = goodResults();
    const segments = goodSegments(3, 3, 2);
    results[3] = { index: 3, renditions: { '360p': { segments }, '720p': { segments } } };
    expect(validateChunkResults({ plan, results, renditionNames: names })).toEqual({ errors: [], warnings: [] });
  });
});

describe('readChunkRendition', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chunk-rendition-'));
  afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

  it('đọc playlist của đoạn kèm kích thước từng segment', () => {
    fs.writeFileSync(path.join(dir, 'a.ts'), Buffer.alloc(1234));
    fs.writeFileSync(path.join(dir, 'b.ts'), Buffer.alloc(99));
    fs.writeFileSync(path.join(dir, 'playlist.m3u8'), '#EXTM3U\n#EXTINF:6.006000,\na.ts\n#EXTINF:2.5,\nb.ts\n#EXT-X-ENDLIST\n');
    expect(readChunkRendition(dir)).toEqual([
      { file: 'a.ts', duration: 6.006, bytes: 1234 },
      { file: 'b.ts', duration: 2.5, bytes: 99 },
    ]);
    expect(sumSeconds(readChunkRendition(dir))).toBeCloseTo(8.506);
  });

  it('không có playlist cho danh sách rỗng; playlist nhắc tới segment thiếu tệp thì ném lỗi', () => {
    expect(readChunkRendition(path.join(dir, 'nope'))).toEqual([]);

    const broken = fs.mkdtempSync(path.join(dir, 'broken-'));
    fs.writeFileSync(path.join(broken, 'playlist.m3u8'), '#EXTM3U\n#EXTINF:6,\nmissing.ts\n#EXT-X-ENDLIST\n');
    expect(() => readChunkRendition(broken)).toThrow();
  });
});
