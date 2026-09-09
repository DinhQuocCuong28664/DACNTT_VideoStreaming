/**
 * Kiểm thử việc suy ra framerate và tính GOP.
 *
 * Bối cảnh: trước đây GOP bị hardcode `segmentDuration * 30`, tức là giả định
 * mọi video nguồn đều 30 fps. Với nguồn 24 fps, GOP thành 7,5 giây — dài hơn
 * `-hls_time 6` — nên FFmpeg không có keyframe nào tại giây thứ 6 và độ dài
 * segment trôi khỏi giá trị cấu hình. Với nguồn 60 fps thì ngược lại, keyframe
 * dày gấp đôi mức cần thiết và tốn bitrate vô ích.
 *
 * RFC 8216 §6.2.4 quy định (normative) "Matching content in Variant Streams
 * MUST have matching timestamps", còn §4.3.3.1 buộc EXTINF làm tròn phải nhỏ
 * hơn hoặc bằng target duration. Cả hai chỉ được bảo đảm khi keyframe rơi đúng
 * biên segment ở mọi rendition, nên đây là ràng buộc chuẩn hoá chứ không phải
 * lựa chọn thẩm mỹ.
 */

const {
  parseFrameRate,
  resolveFrameRate,
  computeGopSize,
  buildForceKeyFramesExpr,
  buildFFmpegArgs,
  DEFAULT_FPS,
} = require('../src/transcoder');

const SEGMENT_SECONDS = 6;

describe('parseFrameRate — đọc chuỗi phân số của ffprobe', () => {
  it('đọc được phân số nguyên', () => {
    expect(parseFrameRate('30/1')).toBe(30);
    expect(parseFrameRate('24/1')).toBe(24);
    expect(parseFrameRate('60/1')).toBe(60);
  });

  it('đọc được phân số NTSC 29.97 và 23.976', () => {
    expect(parseFrameRate('30000/1001')).toBeCloseTo(29.97, 2);
    expect(parseFrameRate('24000/1001')).toBeCloseTo(23.976, 3);
  });

  it('coi "0/0" là không xác định chứ không phải bằng không', () => {
    // ffprobe dùng 0/0 để báo không suy ra được, nếu hiểu thành 0 fps thì
    // GOP sẽ bằng 0 và libx264 chỉ sinh đúng một keyframe ở đầu video.
    expect(parseFrameRate('0/0')).toBeNull();
    expect(parseFrameRate('30/0')).toBeNull();
    expect(parseFrameRate('0/1')).toBeNull();
  });

  it('không chấp nhận giá trị rác', () => {
    expect(parseFrameRate('N/A')).toBeNull();
    expect(parseFrameRate('')).toBeNull();
    expect(parseFrameRate(undefined)).toBeNull();
    expect(parseFrameRate(null)).toBeNull();
    expect(parseFrameRate({})).toBeNull();
  });
});

describe('resolveFrameRate — chọn nguồn framerate đáng tin', () => {
  it('ưu tiên avg_frame_rate hơn r_frame_rate', () => {
    const result = resolveFrameRate({
      avg_frame_rate: '24/1',
      r_frame_rate: '30/1',
    });

    expect(result.fps).toBe(24);
    expect(result.source).toBe('avg_frame_rate');
  });

  it('bỏ qua r_frame_rate phi thực tế của tệp VFR', () => {
    // Tệp quay từ điện thoại hay khai r_frame_rate là 1000/1 vì đó là bội
    // chung nhỏ nhất của các mốc thời gian, không phải tốc độ khung hình.
    const result = resolveFrameRate({
      avg_frame_rate: '30000/1001',
      r_frame_rate: '1000/1',
    });

    expect(result.fps).toBeCloseTo(29.97, 2);
    expect(result.source).toBe('avg_frame_rate');
  });

  it('không tin r_frame_rate ngay cả khi avg_frame_rate hỏng', () => {
    const result = resolveFrameRate({
      avg_frame_rate: '0/0',
      r_frame_rate: '90000/1',
    });

    expect(result.fps).toBe(DEFAULT_FPS);
    expect(result.source).toBe('default');
  });

  it('lùi về r_frame_rate khi avg_frame_rate không đọc được nhưng r hợp lý', () => {
    const result = resolveFrameRate({
      avg_frame_rate: '0/0',
      r_frame_rate: '25/1',
    });

    expect(result.fps).toBe(25);
    expect(result.source).toBe('r_frame_rate');
  });

  it('lùi về mặc định khi không có stream nào', () => {
    expect(resolveFrameRate(undefined).fps).toBe(DEFAULT_FPS);
    expect(resolveFrameRate(null).source).toBe('default');
    expect(resolveFrameRate({}).source).toBe('default');
  });
});

describe('computeGopSize — GOP phải phủ trọn một segment', () => {
  // Điều kiện then chốt: GOP tính theo giây không được VƯỢT segmentDuration,
  // nếu không sẽ không có keyframe nào để cắt tại biên segment.
  const cases = [
    { label: '24 fps (điện ảnh)', fps: 24, expected: 144 },
    { label: '23.976 fps (NTSC film)', fps: 24000 / 1001, expected: 143 },
    { label: '25 fps (PAL)', fps: 25, expected: 150 },
    { label: '29.97 fps (NTSC)', fps: 30000 / 1001, expected: 179 },
    { label: '30 fps', fps: 30, expected: 180 },
    { label: '50 fps', fps: 50, expected: 300 },
    { label: '60 fps', fps: 60, expected: 360 },
  ];

  it.each(cases)('$label → GOP $expected khung hình', ({ fps, expected }) => {
    expect(computeGopSize(fps, SEGMENT_SECONDS)).toBe(expected);
  });

  it.each(cases)('$label → GOP không bao giờ dài hơn một segment', ({ fps }) => {
    const gopSeconds = computeGopSize(fps, SEGMENT_SECONDS) / fps;

    // Bất biến chính: phải có keyframe tại hoặc TRƯỚC mỗi biên segment.
    // Với tốc độ NTSC, làm tròn lên sẽ cho 6,006 giây và phá vỡ điều này.
    expect(gopSeconds).toBeLessThanOrEqual(SEGMENT_SECONDS);

    // Và không được ngắn quá mức cần thiết: sai lệch tối đa đúng một khung hình.
    expect(gopSeconds).toBeGreaterThan(SEGMENT_SECONDS - 1 / fps);
  });

  it('cho thấy đúng lỗi mà bản sửa này khắc phục', () => {
    // Công thức cũ: segmentDuration * 30, bất kể fps thật.
    const gopCu = SEGMENT_SECONDS * 30;

    // Nguồn 24 fps: 180 khung hình ở 24 fps là 7,5 giây > 6 giây.
    expect(gopCu / 24).toBeCloseTo(7.5, 2);
    expect(gopCu / 24).toBeGreaterThan(SEGMENT_SECONDS);

    // Nguồn 60 fps: 180 khung hình ở 60 fps chỉ là 3 giây, keyframe dày gấp đôi.
    expect(gopCu / 60).toBeCloseTo(3, 2);

    // Công thức mới trả về đúng 6 giây ở cả hai.
    expect(computeGopSize(24, SEGMENT_SECONDS) / 24).toBeCloseTo(SEGMENT_SECONDS, 2);
    expect(computeGopSize(60, SEGMENT_SECONDS) / 60).toBeCloseTo(SEGMENT_SECONDS, 2);

    // Và với NTSC thì ngắn hơn 6 giây một chút chứ không dài hơn.
    const ntsc = 30000 / 1001;
    expect(computeGopSize(ntsc, SEGMENT_SECONDS)).toBe(179);
    expect(computeGopSize(ntsc, SEGMENT_SECONDS) / ntsc).toBeLessThan(SEGMENT_SECONDS);
  });

  it('không bao giờ trả về 0', () => {
    // -g 0 khiến libx264 chỉ sinh keyframe ở khung hình đầu tiên.
    expect(computeGopSize(0.01, SEGMENT_SECONDS)).toBeGreaterThanOrEqual(1);
  });
});

describe('buildForceKeyFramesExpr — lớp bảo đảm độc lập framerate', () => {
  it('ép keyframe theo mốc thời gian tuyệt đối', () => {
    expect(buildForceKeyFramesExpr(SEGMENT_SECONDS)).toBe('expr:gte(t,n_forced*6)');
    expect(buildForceKeyFramesExpr(4)).toBe('expr:gte(t,n_forced*4)');
  });
});

describe('buildFFmpegArgs — tham số truyền cho FFmpeg', () => {
  const renditions = [
    { name: '360p', width: 640, height: 360, videoBitrate: '400k', audioBitrate: '64k', maxrate: '500k', bufsize: '800k' },
    { name: '720p', width: 1280, height: 720, videoBitrate: '1500k', audioBitrate: '128k', maxrate: '2000k', bufsize: '3000k' },
  ];

  const valuesAfter = (args, flag) =>
    args.reduce((acc, arg, i) => (arg === flag ? [...acc, args[i + 1]] : acc), []);

  it('đặt -g theo framerate thật, không phải 30 cố định', () => {
    const args = buildFFmpegArgs('in.mp4', '/out', renditions, 24);

    expect(valuesAfter(args, '-g')).toEqual(['144', '144']);
    expect(valuesAfter(args, '-keyint_min')).toEqual(['144', '144']);
  });

  it('đặt -keyint_min bằng -g để GOP đóng', () => {
    const args = buildFFmpegArgs('in.mp4', '/out', renditions, 60);

    expect(valuesAfter(args, '-g')).toEqual(valuesAfter(args, '-keyint_min'));
  });

  it('giữ scene detection tắt ở mọi rendition', () => {
    // Bật lên thì mỗi rendition có thể cắt ở chỗ khác nhau, vi phạm
    // RFC 8216 §6.2.4 về trùng timestamp giữa các variant.
    const args = buildFFmpegArgs('in.mp4', '/out', renditions, 30);

    expect(valuesAfter(args, '-sc_threshold')).toEqual(['0', '0']);
  });

  it('ép cùng một biểu thức keyframe cho mọi rendition', () => {
    const args = buildFFmpegArgs('in.mp4', '/out', renditions, 30);
    const exprs = valuesAfter(args, '-force_key_frames');

    expect(exprs).toHaveLength(renditions.length);
    expect(new Set(exprs).size).toBe(1);
    expect(exprs[0]).toBe('expr:gte(t,n_forced*6)');
  });

  it('giữ nguyên hành vi cũ khi không truyền framerate', () => {
    // Trường hợp xấu nhất phải bằng đúng mã cũ chứ không tệ hơn.
    const args = buildFFmpegArgs('in.mp4', '/out', renditions);

    expect(valuesAfter(args, '-g')).toEqual(['180', '180']);
  });

  it('chỉ đọc tệp nguồn một lần dù xuất nhiều rendition', () => {
    const args = buildFFmpegArgs('in.mp4', '/out', renditions, 30);

    expect(args.filter((a) => a === '-i')).toHaveLength(1);
  });
});
