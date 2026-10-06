const { EventEmitter } = require('events');

jest.mock('child_process', () => ({ spawn: jest.fn() }));
const { spawn } = require('child_process');

const { assessEncodeProgress, runFFmpeg, EncodeTooSlowError } = require('../src/transcoder');
const config = require('../src/config');

/**
 * Rào chắn thời gian mã hoá.
 *
 * Số thật làm chuẩn (docs/results/transcode-timing.json, Fargate 1 vCPU, thang
 * cũ): hệ số 3,7 giây chạy mỗi giây video. Job bị dừng ở 7.200 s, ngân sách cho
 * riêng FFmpeg là 6.300 s, nên video 26,7 phút (5.917 s) vừa kịp và video 4 giờ
 * (~53.000 s) chắc chắn không.
 */
const guard = config.ffmpeg;
const budget = guard.maxEncodeSeconds;
const margin = guard.encodeGuard.margin;

describe('assessEncodeProgress', () => {
  it('chưa kết luận khi không biết độ dài video hoặc chưa có tiến độ', () => {
    expect(assessEncodeProgress({ elapsedSeconds: 600, positionSeconds: 100, totalDuration: 0 }).enough).toBe(false);
    expect(assessEncodeProgress({ elapsedSeconds: 600, positionSeconds: 100, totalDuration: NaN }).enough).toBe(false);
    expect(assessEncodeProgress({ elapsedSeconds: 600, positionSeconds: 0, totalDuration: 3600 }).enough).toBe(false);
  });

  it('chưa kết luận trong lúc khởi động, dù tốc độ trông rất chậm', () => {
    const early = assessEncodeProgress({ elapsedSeconds: guard.encodeGuard.warmupSeconds - 1, positionSeconds: 10, totalDuration: 14400 });
    expect(early).toEqual({ enough: false, projectedSeconds: null, breach: false });
  });

  it('chưa kết luận khi mới mã hoá được quá ít giây video', () => {
    const few = assessEncodeProgress({ elapsedSeconds: 600, positionSeconds: guard.encodeGuard.minPositionSeconds - 1, totalDuration: 14400 });
    expect(few.enough).toBe(false);
  });

  it('dự kiến = độ dài video × (thời gian chạy / vị trí đã mã hoá)', () => {
    const v = assessEncodeProgress({ elapsedSeconds: 370, positionSeconds: 100, totalDuration: 1600 });
    expect(v.enough).toBe(true);
    expect(v.projectedSeconds).toBeCloseTo(1600 * 3.7, 5);
  });

  it('video 26,7 phút ở hệ số 3,7 (đã đo trên Fargate) vừa kịp: không vi phạm', () => {
    const v = assessEncodeProgress({ elapsedSeconds: 600, positionSeconds: 600 / 3.7, totalDuration: 1600 });
    expect(v.projectedSeconds).toBeLessThan(budget);
    expect(v.breach).toBe(false);
  });

  it('video 4 giờ ở hệ số 3,7 vi phạm, và biết ngay từ vài phút đầu', () => {
    const v = assessEncodeProgress({ elapsedSeconds: 300, positionSeconds: 300 / 3.7, totalDuration: 4 * 3600 });
    expect(v.projectedSeconds).toBeGreaterThan(budget * margin);
    expect(v.breach).toBe(true);
  });

  it('video 4 giờ ở 4 vCPU (hệ số 0,675) không vi phạm khi ngân sách đủ lớn', () => {
    const big = { maxEncodeSeconds: 6 * 3600, encodeGuard: guard.encodeGuard };
    const v = assessEncodeProgress({ elapsedSeconds: 600, positionSeconds: 600 / 0.675, totalDuration: 4 * 3600 }, big);
    expect(v.breach).toBe(false);
  });

  it('biên độ: đúng ngân sách × biên độ thì chưa vi phạm, vượt chút ít thì vi phạm', () => {
    const at = assessEncodeProgress({ elapsedSeconds: 600, positionSeconds: 600 / ((budget * margin) / 3600), totalDuration: 3600 });
    expect(at.projectedSeconds).toBeCloseTo(budget * margin, 3);
    expect(at.breach).toBe(false);
    const over = assessEncodeProgress({ elapsedSeconds: 600, positionSeconds: 600 / ((budget * margin * 1.01) / 3600), totalDuration: 3600 });
    expect(over.breach).toBe(true);
  });
});

/** FFmpeg giả: phát vài dòng tiến độ, ghi nhận có bị kill hay không. */
const fakeFfmpeg = () => {
  const proc = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = jest.fn(() => { setImmediate(() => proc.emit('close', null)); });
  spawn.mockReturnValue(proc);
  return proc;
};

const hms = (s) => {
  const h = String(Math.floor(s / 3600)).padStart(2, '0');
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const sec = (s % 60).toFixed(2).padStart(5, '0');
  return `${h}:${m}:${sec}`;
};

describe('runFFmpeg với rào chắn thời gian', () => {
  let nowMs;
  beforeEach(() => {
    nowMs = 1_000_000;
    jest.spyOn(Date, 'now').mockImplementation(() => nowMs);
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    jest.spyOn(console, 'log').mockImplementation(() => {});
    spawn.mockReset();
  });
  afterEach(() => jest.restoreAllMocks());

  /** Đẩy một dòng tiến độ sau `wallSeconds` giây chạy, ở vị trí `position` giây video. */
  const tick = (proc, wallSeconds, position) => {
    nowMs = 1_000_000 + wallSeconds * 1000;
    proc.stderr.emit('data', Buffer.from(`frame=1 fps=1 time=${hms(position)} bitrate=1k speed=1x`));
  };

  it('dừng FFmpeg và báo EncodeTooSlowError khi video 4 giờ không thể kịp', async () => {
    const proc = fakeFfmpeg();
    const done = runFFmpeg(['-i', 'x'], 4 * 3600);

    // Hệ số 3,7: chạy 200 s mới được 54 s video, chưa đủ 60 s video để kết luận.
    tick(proc, 200, 200 / 3.7);
    expect(proc.kill).not.toHaveBeenCalled();
    // Qua khởi động, vi phạm lần đầu: chưa dừng ngay, phải kéo dài đủ sustainSeconds.
    tick(proc, 300, 300 / 3.7);
    expect(proc.kill).not.toHaveBeenCalled();
    // 40 giây sau vẫn vi phạm: dừng.
    tick(proc, 340, 340 / 3.7);

    await expect(done).rejects.toBeInstanceOf(EncodeTooSlowError);
    expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
    await done.catch((e) => {
      expect(e.code).toBe('ENCODE_TOO_SLOW');
      expect(e.message).toMatch(/quá dài/);
      // 4 giờ video ở hệ số 3,7 ≈ 14,8 giờ; ngân sách 6300 s = 105 phút; video dài 4,0 giờ
      expect(e.message).toBe(
        'Video quá dài so với tài nguyên của job: mã hoá dự kiến mất ~14,8 giờ, vượt ngân sách 105 phút (video dài 4,0 giờ)'
      );
      expect(e.projectedSeconds).toBeGreaterThan(budget * margin);
    });
  });

  it('không dừng video vẫn kịp ngân sách', async () => {
    const proc = fakeFfmpeg();
    const done = runFFmpeg(['-i', 'x'], 1600);        // 26,7 phút

    for (const wall of [200, 300, 400, 500, 600]) tick(proc, wall, wall / 3.7);
    expect(proc.kill).not.toHaveBeenCalled();

    proc.emit('close', 0);
    await expect(done).resolves.toBeUndefined();
  });

  it('một đoạn chậm thoáng qua không đủ để dừng: vi phạm phải kéo dài liên tục', async () => {
    const proc = fakeFfmpeg();
    const done = runFFmpeg(['-i', 'x'], 4 * 3600);

    tick(proc, 300, 300 / 3.7);        // dự kiến vượt biên độ: bắt đầu đếm
    tick(proc, 310, 100);              // vẫn vượt, mới được 10 s < sustainSeconds: chưa dừng
    tick(proc, 340, 340 / 0.5);        // tốc độ hồi (cảnh nhẹ), dự kiến về dưới biên độ: đếm về 0
    expect(proc.kill).not.toHaveBeenCalled();

    tick(proc, 400, 400 / 3.7);        // chậm lại: bắt đầu đếm lại từ đầu
    tick(proc, 420, 420 / 3.7);        // mới 20 s kể từ lần vượt này, vẫn chưa dừng
    expect(proc.kill).not.toHaveBeenCalled();

    proc.emit('close', 0);
    await expect(done).resolves.toBeUndefined();
  });

  it('video không rõ độ dài thì không bao giờ bị rào chắn dừng', async () => {
    const proc = fakeFfmpeg();
    const done = runFFmpeg(['-i', 'x'], 0);

    tick(proc, 5000, 10);
    expect(proc.kill).not.toHaveBeenCalled();

    proc.emit('close', 0);
    await expect(done).resolves.toBeUndefined();
  });

  it('FFmpeg thoát lỗi thường vẫn báo lỗi thường, không phải EncodeTooSlowError', async () => {
    const proc = fakeFfmpeg();
    const done = runFFmpeg(['-i', 'x'], 600);
    proc.emit('close', 1);
    await expect(done).rejects.toThrow('FFmpeg exited with code 1');
    await done.catch((e) => expect(e).not.toBeInstanceOf(EncodeTooSlowError));
  });
});
