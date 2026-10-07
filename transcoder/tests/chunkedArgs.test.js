const path = require('path');
const { buildChunkArgs, buildAudioArgs, httpInputOptions, chunkLabel } = require('../src/chunked/ffmpegArgs');
const { buildChunkPlan, parseRational } = require('../src/chunked/plan');
const { videoEncodeArgs, planRenditions } = require('../src/transcoder');
const config = require('../src/config');

/**
 * Lệnh ffmpeg của đường chia đoạn. Mỗi kiểm tra dưới đây gắn với một phát hiện đo được
 * (E1-E5 trong docs/CHUNKED_TRANSCODING_DESIGN.md) hoặc một cách hỏng cụ thể.
 */

const URL_VIDEO = 'https://raw.s3.amazonaws.com/videos/u/v/source.mp4?X-Amz-Signature=a';
const URL_A64 = 'https://raw.s3.amazonaws.com/work/v/audio-64k.m4a?X-Amz-Signature=b';
const URL_A128 = 'https://raw.s3.amazonaws.com/work/v/audio-128k.m4a?X-Amz-Signature=c';

const plan = buildChunkPlan({ frameCount: 100000, fps: parseRational('30000/1001'), gopsPerChunk: 50 });
const renditions = planRenditions({ width: 1920, height: 1080 }, config.ffmpeg.renditions);

const build = (overrides = {}) =>
  buildChunkArgs({
    videoUrl: URL_VIDEO,
    videoStreamIndex: 0,
    audio: [
      { bitrate: '64k', url: URL_A64 },
      { bitrate: '128k', url: URL_A128 },
    ],
    renditions,
    chunk: plan.chunks[3],
    gopFrames: plan.gopFrames,
    segmentSeconds: 6,
    outputDir: path.join('out', 'chunk'),
    ...overrides,
  });

const indexesOf = (args, flag) => args.reduce((acc, a, i) => (a === flag ? [...acc, i] : acc), []);
const after = (args, flag, from = 0) => args[args.indexOf(flag, from) + 1];

describe('buildChunkArgs', () => {
  it('mở nguồn qua HTTP với đúng cửa sổ của đoạn, -ss và -t đặt TRƯỚC -i', () => {
    const args = build();
    const firstInput = args.indexOf('-i');
    expect(args.slice(0, firstInput)).toContain('-ss');
    expect(args.slice(0, firstInput)).toContain('-t');
    expect(args[firstInput + 1]).toBe(URL_VIDEO);
    expect(after(args, '-ss')).toBe(plan.chunks[3].seekSeconds.toFixed(6));
    expect(after(args, '-t')).toBe(plan.chunks[3].durationSeconds.toFixed(6));
  });

  it('mỗi tệp âm thanh được mở với cửa sổ TIẾNG (bắt đầu đúng khung đầu), khác cửa sổ hình nửa khung', () => {
    const args = build();
    const inputs = indexesOf(args, '-i');
    expect(inputs).toHaveLength(3);
    const windows = inputs.map((at, n) => {
      const from = n === 0 ? 0 : inputs[n - 1] + 2;
      const slice = args.slice(from, at);
      return [after(slice, '-ss'), after(slice, '-t')];
    });
    const c = plan.chunks[3];
    expect(windows[0]).toEqual([c.seekSeconds.toFixed(6), c.durationSeconds.toFixed(6)]);
    const audioWindow = [c.audioSeekSeconds.toFixed(6), c.audioDurationSeconds.toFixed(6)];
    expect(windows[1]).toEqual(audioWindow);
    expect(windows[2]).toEqual(audioWindow);
    expect(windows[1]).not.toEqual(windows[0]);
  });

  it('giới hạn đoạn đúng số khung bằng -frames:v ở mỗi đầu ra, trừ đoạn cuối (mở)', () => {
    // -t ở đầu vào cắt theo gói tin nên với nguồn có B-frame vẫn lọt một khung thừa (541 thay vì 540).
    const args = build();
    const limits = indexesOf(args, '-frames:v').map((i) => args[i + 1]);
    expect(limits).toEqual(renditions.map(() => String(plan.chunks[3].frames)));

    const last = build({ chunk: plan.chunks.at(-1) });
    expect(last).not.toContain('-frames:v');
  });

  it('E3/E4: âm thanh được SAO CHÉP, không bao giờ mã hoá lại theo đoạn', () => {
    const args = build();
    expect(args).not.toContain('aac');
    expect(indexesOf(args, '-c:a')).toHaveLength(renditions.length);
    for (const i of indexesOf(args, '-c:a')) expect(args[i + 1]).toBe('copy');
  });

  it('chọn tệp âm thanh theo mức: 64k cho mức nhỏ, 128k cho 720p/1080p', () => {
    const args = build();
    const maps = [];
    args.forEach((a, i) => {
      if (a === '-map') maps.push(args[i + 1]);
    });
    // Mỗi mức: một -map hình rồi một -map tiếng. Đầu vào 1 = 64k, đầu vào 2 = 128k.
    const audioMaps = maps.filter((m) => m.endsWith(':a:0'));
    const expected = renditions.map((r) => (parseInt(r.name, 10) <= 480 ? '1:a:0' : '2:a:0'));
    expect(audioMaps).toEqual(expected);
    expect(maps.filter((m) => !m.endsWith(':a:0'))).toEqual(renditions.map(() => '0:0'));
  });

  it('dùng chỉ số luồng hình tuyệt đối của planner, không đoán 0:v:0', () => {
    const args = build({ videoStreamIndex: 2 });
    expect(args).toContain('0:2');
    expect(args).not.toContain('0:v:0');
  });

  it('cờ mã hoá hình giống hệt đường một-job (videoEncodeArgs)', () => {
    const args = build();
    for (const r of renditions) {
      const flags = videoEncodeArgs(r);
      const at = args.findIndex((a, i) => a === '-vf' && args[i + 1] === flags[1]);
      expect(at).toBeGreaterThan(-1);
      expect(args.slice(at, at + flags.length)).toEqual(flags);
    }
  });

  it('E1: GOP cố định bằng số khung, KHÔNG dùng -force_key_frames theo giây', () => {
    const args = build();
    expect(args).not.toContain('-force_key_frames');
    for (const flag of ['-g', '-keyint_min']) {
      for (const i of indexesOf(args, flag)) expect(args[i + 1]).toBe(String(plan.gopFrames));
    }
    expect(plan.gopFrames).toBe(180);
    for (const i of indexesOf(args, '-sc_threshold')) expect(args[i + 1]).toBe('0');
  });

  it('E2: -output_ts_offset theo kế hoạch, cho mọi mức', () => {
    const args = build();
    const offsets = indexesOf(args, '-output_ts_offset').map((i) => args[i + 1]);
    expect(offsets).toHaveLength(renditions.length);
    for (const o of offsets) expect(o).toBe(plan.chunks[3].tsOffsetSeconds.toFixed(6));
  });

  it('tên segment chứa số thứ tự đoạn và đánh số từ 0, nên các đoạn không ghi đè lên nhau', () => {
    const args = build();
    const names = indexesOf(args, '-hls_segment_filename').map((i) => args[i + 1]);
    expect(names).toEqual(renditions.map((r) => path.join('out', 'chunk', r.name, 'segment_c0003_%03d.ts')));
    for (const i of indexesOf(args, '-start_number')) expect(args[i + 1]).toBe('0');
  });

  it('đoạn 0 không có -ss ở đầu vào hình, đoạn cuối không có -t (đọc tới hết tệp)', () => {
    const first = build({ chunk: plan.chunks[0] });
    expect(first.slice(0, first.indexOf('-i'))).not.toContain('-ss');
    expect(first).toContain('-t');

    const last = build({ chunk: plan.chunks.at(-1) });
    expect(last).not.toContain('-t');
    expect(last).toContain('-ss');
  });

  it('nguồn không có tiếng: không có đầu vào âm thanh, không -c:a, không -map âm thanh', () => {
    const args = build({ audio: [] });
    expect(indexesOf(args, '-i')).toHaveLength(1);
    expect(args).not.toContain('-c:a');
    expect(args.some((a) => /:a:0$/.test(a))).toBe(false);
  });

  it('chỉ có một bitrate âm thanh (nguồn nhỏ chỉ có mức thấp): mức nào cũng map vào đầu vào 1', () => {
    const small = planRenditions({ width: 426, height: 240 }, config.ffmpeg.renditions);
    const args = build({ renditions: small, audio: [{ bitrate: '64k', url: URL_A64 }] });
    const audioMaps = args.filter((a) => /:a:0$/.test(a));
    expect(audioMaps).toEqual(small.map(() => '1:a:0'));
  });

  it('cờ đọc lại khi ngắt chỉ áp cho URL http(s), không áp cho tệp cục bộ', () => {
    const remote = build();
    expect(remote).toContain('-reconnect');
    expect(remote).toContain('-rw_timeout');

    const local = build({
      videoUrl: 'C:\\media\\source.mp4',
      audio: [{ bitrate: '64k', url: 'C:\\media\\a.m4a' }],
    });
    expect(local).not.toContain('-reconnect');
    expect(httpInputOptions('/tmp/x.mp4')).toEqual([]);
  });
});

describe('buildAudioArgs', () => {
  const args = buildAudioArgs({ inputUrl: URL_VIDEO, streamIndex: 1, bitrate: '128k', outputPath: 'audio-128k.m4a' });

  it('mã hoá một lần luồng âm thanh được chọn, cùng thông số với đường một-job', () => {
    expect(after(args, '-map')).toBe('0:1');
    expect(after(args, '-c:a')).toBe('aac');
    expect(after(args, '-b:a')).toBe('128k');
    expect(after(args, '-ar')).toBe('44100');
    expect(after(args, '-ac')).toBe('2');
    expect(args.at(-1)).toBe('audio-128k.m4a');
  });

  it('không bao giờ xử lý hình', () => {
    expect(args).not.toContain('libx264');
    expect(args).not.toContain('-vf');
  });

  it('đặt moov lên đầu tệp để job đoạn đọc một dải qua HTTP mà không dò tới cuối', () => {
    expect(after(args, '-movflags')).toBe('+faststart');
  });
});

describe('chunkLabel', () => {
  it('đệm số 0 để tên segment của mọi đoạn khác nhau và xếp đúng thứ tự', () => {
    expect(chunkLabel(0)).toBe('0000');
    expect(chunkLabel(42)).toBe('0042');
    expect(chunkLabel(575)).toBe('0575');
  });
});
