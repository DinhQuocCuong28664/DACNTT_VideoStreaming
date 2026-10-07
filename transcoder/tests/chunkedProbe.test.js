const { summarizeProbe, evaluateEligibility, planningInputs } = require('../src/chunked/probe');

/**
 * Đọc và đánh giá nguồn. Các mẫu dưới đây là hình dạng đầu ra thật của ffprobe cho
 * những loại tệp thường gặp; mỗi ca "lùi về đường một-job" là một cách chia đoạn
 * sẽ SAI nếu không bị chặn.
 */

const videoStream = (overrides = {}) => ({
  index: 0,
  codec_type: 'video',
  codec_name: 'h264',
  width: 1920,
  height: 1080,
  avg_frame_rate: '30000/1001',
  r_frame_rate: '30000/1001',
  nb_frames: '431568',
  duration: '14400.012000',
  start_time: '0.000000',
  disposition: { attached_pic: 0 },
  ...overrides,
});

const audioStream = (overrides = {}) => ({
  index: 1,
  codec_type: 'audio',
  codec_name: 'aac',
  channels: 2,
  start_time: '0.000000',
  duration: '14400.020000',
  ...overrides,
});

const probe = (streams, format = {}) => ({
  streams,
  format: { duration: '14400.020000', start_time: '0.000000', ...format },
});

describe('summarizeProbe', () => {
  it('rút gọn một tệp MP4 thường: phân số framerate, chỉ số luồng, kích thước hiển thị', () => {
    const s = summarizeProbe(probe([videoStream(), audioStream()]));
    expect(s.video).toMatchObject({
      index: 0,
      fps: { num: 30000, den: 1001 },
      baseFps: { num: 30000, den: 1001 },
      nbFrames: 431568,
      start: 0,
      size: { width: 1920, height: 1080 },
    });
    expect(s.audio).toMatchObject({ index: 1, channels: 2, start: 0 });
    expect(s.formatDuration).toBeCloseTo(14400.02);
  });

  it('bỏ qua ảnh bìa: luồng video đầu tiên không phải attached_pic mới là hình thật', () => {
    const cover = videoStream({ index: 0, codec_name: 'mjpeg', width: 600, height: 600, disposition: { attached_pic: 1 } });
    const s = summarizeProbe(probe([cover, videoStream({ index: 1 }), audioStream({ index: 2 })]));
    expect(s.video.index).toBe(1);
    expect(s.video.codec).toBe('h264');
  });

  it('chọn luồng âm thanh nhiều kênh nhất, giống quy tắc mặc định của ffmpeg', () => {
    const s = summarizeProbe(
      probe([videoStream(), audioStream({ index: 1, channels: 2 }), audioStream({ index: 2, channels: 6 }), audioStream({ index: 3, channels: 6 })])
    );
    expect(s.audio.index).toBe(2); // hoà thì lấy cái đầu tiên
  });

  it('nguồn không có tiếng cho audio null', () => {
    expect(summarizeProbe(probe([videoStream()])).audio).toBeNull();
  });

  it('khung xoay 90° được hoán đổi rộng/cao (video dọc quay bằng điện thoại)', () => {
    const rotated = videoStream({ width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] });
    expect(summarizeProbe(probe([rotated])).video.size).toEqual({ width: 1080, height: 1920 });
  });

  it('chịu được đầu vào rỗng hoặc thiếu trường', () => {
    expect(summarizeProbe({}).video).toBeNull();
    expect(summarizeProbe(null).audio).toBeNull();
  });
});

describe('evaluateEligibility', () => {
  const ok = (streams, format) => evaluateEligibility(summarizeProbe(probe(streams, format)));

  it('nhận nguồn CFR bình thường', () => {
    expect(ok([videoStream(), audioStream()])).toEqual({ ok: true });
    expect(ok([videoStream()])).toEqual({ ok: true });
  });

  it('từ chối nguồn VFR: avg và r_frame_rate vênh nhau (điện thoại hay khai 90000/1)', () => {
    const verdict = ok([videoStream({ avg_frame_rate: '29970/1000', r_frame_rate: '90000/1' })]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/VFR/);
  });

  it('sai số làm tròn nhỏ giữa avg và r_frame_rate vẫn là CFR', () => {
    expect(ok([videoStream({ avg_frame_rate: '2997/100', r_frame_rate: '30000/1001' })]).ok).toBe(true);
  });

  it('từ chối khi không đọc được framerate hoặc framerate phi lý', () => {
    expect(ok([videoStream({ avg_frame_rate: '0/0' })]).ok).toBe(false);
    expect(ok([videoStream({ avg_frame_rate: '1000/1', r_frame_rate: '1000/1' })]).ok).toBe(false);
    expect(ok([videoStream({ avg_frame_rate: '5/1', r_frame_rate: '5/1' })]).ok).toBe(false);
  });

  it('từ chối nguồn không có luồng hình hoặc không biết thời lượng', () => {
    expect(evaluateEligibility(summarizeProbe(probe([audioStream()]))).ok).toBe(false);
    const noDuration = probe([videoStream({ nb_frames: 'N/A', duration: 'N/A' })], { duration: 'N/A' });
    expect(evaluateEligibility(summarizeProbe(noDuration)).ok).toBe(false);
  });

  it('từ chối khi hình và tiếng bắt đầu lệch nhau quá 0,25 s (chia đoạn sẽ làm lệch tiếng)', () => {
    const verdict = ok([videoStream({ start_time: '0.000000' }), audioStream({ start_time: '0.400000' })]);
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toMatch(/lệch/);
  });

  it('chấp nhận độ lệch nhỏ thường thấy giữa hình và tiếng', () => {
    expect(ok([videoStream({ start_time: '0.066667' }), audioStream({ start_time: '0.000000' })]).ok).toBe(true);
  });
});

describe('planningInputs', () => {
  it('lấy số khung hình từ nb_frames và độ lệch điểm bắt đầu của hình so với tệp', () => {
    const summary = summarizeProbe(
      probe([videoStream({ start_time: '0.066667' }), audioStream({ start_time: '0.000000' })], { start_time: '0.000000' })
    );
    const inputs = planningInputs(summary);
    expect(inputs.frameCount).toBe(431568);
    expect(inputs.videoStartOffset).toBeCloseTo(0.066667, 5);
    expect(inputs.fps).toEqual({ num: 30000, den: 1001 });
    expect(inputs.duration).toBeCloseTo(14400.012, 3);
  });

  it('start_time của tệp lớn hơn 0 (MPEG-TS, ghi từ giữa chừng): offset tính từ đầu tệp', () => {
    const summary = summarizeProbe(
      probe([videoStream({ start_time: '10.500000' })], { start_time: '10.000000' })
    );
    expect(planningInputs(summary).videoStartOffset).toBeCloseTo(0.5, 6);
  });

  it('không có nb_frames thì ước lượng từ thời lượng luồng hình, không phải thời lượng cả tệp', () => {
    const summary = summarizeProbe(
      probe([videoStream({ nb_frames: 'N/A', duration: '100.000000' })], { duration: '130.000000' })
    );
    expect(planningInputs(summary).frameCount).toBe(Math.round((100 * 30000) / 1001));
  });
});
