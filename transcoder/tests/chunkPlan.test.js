const {
  parseRational,
  gopFramesFor,
  buildChunkPlan,
  estimateFrameCount,
  audioBitrateFor,
  audioBitratesFor,
  frameSeconds,
} = require('../src/chunked/plan');

/**
 * Kế hoạch chia đoạn (docs/CHUNKED_TRANSCODING_DESIGN.md, E1/E2).
 *
 * Các bất biến dưới đây chính là điều kiện để playlist ghép từ nhiều đoạn giống như
 * một lần mã hoá liền: không khe hở, không chồng lấn, mỗi đoạn đúng một số segment.
 */

const FPS_CASES = [
  ['25', '25/1', 150],
  ['30', '30/1', 180],
  ['24', '24/1', 144],
  ['60', '60/1', 360],
  ['50', '50/1', 300],
  ['29,97 (NTSC)', '30000/1001', 180],
  ['23,976 (NTSC)', '24000/1001', 144],
  ['59,94 (NTSC)', '60000/1001', 360],
  ['15', '15/1', 90],
];

describe('parseRational', () => {
  it('đọc phân số ffprobe, số nguyên và đối tượng, rút gọn về tối giản', () => {
    expect(parseRational('30000/1001')).toEqual({ num: 30000, den: 1001 });
    expect(parseRational('50/2')).toEqual({ num: 25, den: 1 });
    expect(parseRational('25')).toEqual({ num: 25, den: 1 });
    expect(parseRational(25)).toEqual({ num: 25, den: 1 });
    expect(parseRational({ num: 60000, den: 2002 })).toEqual({ num: 30000, den: 1001 });
  });

  it('nhận ra tốc độ NTSC từ số thực', () => {
    expect(parseRational(30000 / 1001)).toEqual({ num: 30000, den: 1001 });
    expect(parseRational(24000 / 1001)).toEqual({ num: 24000, den: 1001 });
  });

  it('trả null cho giá trị không dùng được, gồm "0/0" ffprobe dùng cho "không rõ"', () => {
    for (const bad of ['0/0', '30/0', '', 'abc', null, undefined, 0, -5, NaN, { num: 0, den: 1 }, 29.123456]) {
      expect(parseRational(bad)).toBeNull();
    }
  });
});

describe('gopFramesFor', () => {
  it.each(FPS_CASES)('%s fps → GOP làm tròn lên, quy ra giây >= độ dài segment', (_label, text, expected) => {
    const fps = parseRational(text);
    const frames = gopFramesFor(fps, 6);
    expect(frames).toBe(expected);
    // Bất biến cốt lõi: keyframe đến đúng lúc bộ cắt HLS cần segment mới.
    expect(frames * frameSeconds(fps)).toBeGreaterThanOrEqual(6 - 1e-9);
  });

  it('không bao giờ trả về 0, kể cả framerate rất thấp', () => {
    expect(gopFramesFor({ num: 1, den: 100 }, 6)).toBeGreaterThanOrEqual(1);
  });
});

describe('buildChunkPlan', () => {
  const plan = (overrides = {}) =>
    buildChunkPlan({
      frameCount: 432000, // 4 giờ ở 30 fps
      fps: parseRational('30/1'),
      gopsPerChunk: 50,
      ...overrides,
    });

  it('video 4 giờ ở 30 fps: 48 đoạn 5 phút, mỗi đoạn đúng 50 segment', () => {
    const p = plan();
    expect(p.gopFrames).toBe(180);
    expect(p.chunkFrames).toBe(9000);
    expect(p.chunkSeconds).toBe(300);
    expect(p.chunks).toHaveLength(48);
    for (const c of p.chunks.slice(0, -1)) {
      expect(c.frames).toBe(9000);
      expect(c.expectedSegments).toBe(50);
    }
  });

  it('đoạn cuối mở (không -t) để đọc tới hết tệp dù ước lượng khung hình lệch', () => {
    const last = plan().chunks.at(-1);
    expect(last.frames).toBeNull();
    expect(last.durationSeconds).toBeNull();
    expect(last.expectedSegments).toBeNull();
  });

  it.each(FPS_CASES)('%s fps: ranh giới là bội GOP, liền nhau, offset đều đặn', (_label, text) => {
    const fps = parseRational(text);
    const p = buildChunkPlan({ frameCount: 100000, fps, gopsPerChunk: 7 });
    expect(p.chunks.length).toBeGreaterThan(2);

    p.chunks.forEach((c, k) => {
      expect(c.startFrame).toBe(k * p.chunkFrames);
      expect(c.startFrame % p.gopFrames).toBe(0);
    });
    for (const c of p.chunks.slice(0, -1)) {
      expect(c.frames % p.gopFrames).toBe(0);
    }
  });

  it('E2: mọi đoạn (kể cả đoạn 0) có pts đầu ra = vị trí khung + MỘT hằng số chung', () => {
    // pts đầu ra của khung đầu đoạn = start_time hình + startFrame/fps − seek + tsOffset.
    // Hằng số đó phải bằng nhau ở mọi đoạn, mọi framerate, mọi start_time của luồng hình;
    // lệch nhau là khe hở hoặc chồng lấn ở ranh giới đoạn.
    for (const [, text] of FPS_CASES) {
      for (const videoStartOffset of [0, 0.0667, 0.5, 2]) {
        const fps = parseRational(text);
        const d = frameSeconds(fps);
        const p = buildChunkPlan({ frameCount: 90000, fps, gopsPerChunk: 5, videoStartOffset, tsOffsetBase: 1 });

        for (const c of p.chunks) {
          const firstPts = videoStartOffset + c.startFrame * d - c.seekSeconds + c.tsOffsetSeconds;
          expect(firstPts - c.startFrame * d).toBeCloseTo(1 + 0.5 * d, 4);
        }
      }
    }
  });

  it('cửa sổ đọc của đoạn k kết thúc đúng chỗ đoạn k+1 bắt đầu (không khe hở, không chồng lấn)', () => {
    for (const [, text] of FPS_CASES) {
      for (const videoStartOffset of [0, 0.0667, 1.25]) {
        const p = buildChunkPlan({ frameCount: 90000, fps: parseRational(text), gopsPerChunk: 5, videoStartOffset });
        for (let k = 0; k < p.chunks.length - 1; k += 1) {
          const end = p.chunks[k].seekSeconds + p.chunks[k].durationSeconds;
          expect(end).toBeCloseTo(p.chunks[k + 1].seekSeconds, 4);
        }
      }
    }
  });

  it('seek lùi nửa khung so với khung đầu để -ss không dính khung trước và không bỏ khung đầu', () => {
    const fps = parseRational('30000/1001');
    const d = frameSeconds(fps);
    const p = buildChunkPlan({ frameCount: 100000, fps, gopsPerChunk: 10, videoStartOffset: 0.0667 });
    const c = p.chunks[3];
    const firstFrameTime = 0.0667 + c.startFrame * d;
    expect(firstFrameTime - c.seekSeconds).toBeCloseTo(d / 2, 4);
  });

  it('đoạn 0 không bao giờ có -ss âm; phần chênh được bù vào offset', () => {
    const p = plan({ videoStartOffset: 0 });
    expect(p.chunks[0].seekSeconds).toBe(0);
    // Không có phần bù thì đoạn 0 lệch 0,5 khung so với các đoạn còn lại.
    expect(p.chunks[0].tsOffsetSeconds).toBeCloseTo(1 + 0.5 / 30, 5);
    expect(p.chunks[1].tsOffsetSeconds).toBeCloseTo(300 + 1, 5);
  });

  it('khoảng cách offset giữa hai đoạn liền nhau bằng đúng độ dài đoạn', () => {
    const p = buildChunkPlan({ frameCount: 100000, fps: parseRational('30000/1001'), gopsPerChunk: 50 });
    // Từ đoạn 1 trở đi `-ss` không bị chặn nên offset cách đều đúng một đoạn. Đoạn 0 là
    // ngoại lệ có chủ đích (kém nửa khung vì phần bù ở trên); tính đúng của nó đã được
    // kiểm bằng bất biến E2.
    for (let k = 2; k < p.chunks.length; k += 1) {
      expect(p.chunks[k].tsOffsetSeconds - p.chunks[k - 1].tsOffsetSeconds).toBeCloseTo(p.chunkSeconds, 4);
    }
    // 9000 khung ở 30000/1001 = 300,3 s chính xác, không phải 300.
    expect(p.chunkSeconds).toBe(300.3);
  });

  it('phần dư ngắn hơn một GOP được gộp vào đoạn trước thay vì thành đoạn riêng', () => {
    const base = plan({ frameCount: 9000 * 3 });
    expect(base.chunks).toHaveLength(3);

    const smallTail = plan({ frameCount: 9000 * 3 + 100 }); // 100 < 180 khung
    expect(smallTail.chunks).toHaveLength(3);
    expect(smallTail.chunks.at(-1).frames).toBeNull();

    const bigTail = plan({ frameCount: 9000 * 3 + 180 }); // đúng một GOP
    expect(bigTail.chunks).toHaveLength(4);
  });

  it('video chỉ vừa một đoạn cho ra một đoạn duy nhất, và đoạn đó mở', () => {
    const p = plan({ frameCount: 5000 });
    expect(p.chunks).toHaveLength(1);
    expect(p.chunks[0].frames).toBeNull();
  });

  it('từ chối đầu vào không hợp lệ thay vì sinh kế hoạch sai', () => {
    expect(() => buildChunkPlan({ frameCount: 0, fps: parseRational('30/1') })).toThrow();
    expect(() => buildChunkPlan({ frameCount: 1000, fps: null })).toThrow();
    expect(() => plan({ gopsPerChunk: 0 })).toThrow();
    expect(() => plan({ gopsPerChunk: 1.5 })).toThrow();
  });

  it('video 48 giờ vẫn nằm trong giới hạn 10.000 phần tử của array job', () => {
    const p = buildChunkPlan({ frameCount: 48 * 3600 * 30, fps: parseRational('30/1') });
    expect(p.chunks).toHaveLength(576);
    expect(p.chunks.length).toBeLessThanOrEqual(10000);
  });
});

describe('estimateFrameCount', () => {
  const fps = parseRational('30000/1001');

  it('ưu tiên nb_frames, rồi thời lượng luồng hình, rồi thời lượng cả tệp', () => {
    expect(estimateFrameCount({ nbFrames: 2098, videoDuration: 70.003, formatDuration: 70.1 }, fps)).toBe(2098);
    expect(estimateFrameCount({ nbFrames: NaN, videoDuration: 70.003, formatDuration: 99 }, fps)).toBe(2098);
    expect(estimateFrameCount({ videoDuration: 0, formatDuration: 70.003 }, fps)).toBe(2098);
  });

  it('trả 0 khi không có thông tin để ước lượng', () => {
    expect(estimateFrameCount({}, fps)).toBe(0);
  });
});

describe('nhóm bitrate âm thanh cho video dài', () => {
  it('64k cho các mức <= 480p, 128k cho 720p và 1080p', () => {
    expect(['144p', '240p', '360p', '480p'].map(audioBitrateFor)).toEqual(['64k', '64k', '64k', '64k']);
    expect(['720p', '1080p'].map(audioBitrateFor)).toEqual(['128k', '128k']);
  });

  it('chỉ mã hoá những bitrate thực sự được dùng, theo thứ tự cố định', () => {
    expect(audioBitratesFor([{ name: '144p' }, { name: '480p' }, { name: '720p' }, { name: '1080p' }])).toEqual(['64k', '128k']);
    // Nguồn nhỏ chỉ có các mức thấp: không tốn một lượt mã hoá 128k vô ích.
    expect(audioBitratesFor([{ name: '144p' }, { name: '240p' }])).toEqual(['64k']);
  });
});
