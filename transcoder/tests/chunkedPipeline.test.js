const fs = require('fs');
const os = require('os');
const path = require('path');

const realConfig = require('../src/config');
const { createPipeline } = require('../src/chunked/pipeline');
const { summarizeProbe } = require('../src/chunked/probe');
const { createLocalIo } = require('../scripts/lib/localIo');
const { createFakeDb, createFakeNotify, createFakeSubmit } = require('../scripts/lib/fakes');

/**
 * Lớp điều phối của pipeline chia đoạn, với I/O cục bộ và đối tượng giả cho DB/Batch/ffmpeg.
 * Phần ffmpeg thật đã được kiểm bằng scripts/verify-chunked.js và verify-pipeline.js; ở đây kiểm các
 * nhánh QUYẾT ĐỊNH: khi nào chia đoạn, khi nào lùi về một-job, và chuyện gì xảy ra khi có lỗi.
 */

const VIDEO_ID = '6a78c10f1c4541ef615cf01d';
const RAW_KEY = `videos/user/${VIDEO_ID}/source.mp4`;

const probeJson = ({ seconds = 14400, size = [1920, 1080], audio = true, videoOverrides = {}, audioOverrides = {} } = {}) => ({
  format: { duration: String(seconds), start_time: '0.000000' },
  streams: [
    {
      index: 0,
      codec_type: 'video',
      codec_name: 'h264',
      width: size[0],
      height: size[1],
      avg_frame_rate: '30000/1001',
      r_frame_rate: '30000/1001',
      nb_frames: String(Math.round((seconds * 30000) / 1001)),
      duration: String(seconds),
      start_time: '0.000000',
      disposition: { attached_pic: 0 },
      ...videoOverrides,
    },
    ...(audio
      ? [{ index: 1, codec_type: 'audio', codec_name: 'aac', channels: 2, start_time: '0.000000', duration: String(seconds), ...audioOverrides }]
      : []),
  ],
});

const makeConfig = (overrides = {}) => ({
  ...realConfig,
  chunked: { ...realConfig.chunked, enabled: true, thresholdSeconds: 1200, gopsPerChunk: 50, ffmpegAttempts: 2, ...overrides.chunked },
  moderation: { ...realConfig.moderation, enabled: false, ...overrides.moderation },
});

/**
 * ffmpeg giả: đọc từ chính các đối số xem cần ghi tệp nào, rồi ghi segment + playlist giả.
 * `segmentsPerOutput` là số segment mỗi mức; `fail` cho phép giả lập lỗi theo lần gọi.
 */
const fakeFfmpeg = ({ segmentsPerOutput = 3, segmentSeconds = 6.006, fail = () => false, calls = [] } = {}) => async ({ args, label }) => {
  calls.push({ args, label });
  const attempt = calls.length;
  if (fail(attempt, args, label)) throw new Error(`${label}: ffmpeg mã thoát 1\nHTTP error 403 Forbidden`);

  // Đầu ra âm thanh: ghi tệp m4a. Đầu ra HLS: ghi segment + playlist cho từng mức.
  const last = args[args.length - 1];
  if (last.endsWith('.m4a')) {
    fs.mkdirSync(path.dirname(last), { recursive: true });
    fs.writeFileSync(last, Buffer.alloc(1000));
    return { seconds: 0 };
  }
  args.forEach((a, i) => {
    if (a !== '-hls_segment_filename') return;
    const pattern = args[i + 1];
    const playlist = args[i + 2];
    fs.mkdirSync(path.dirname(playlist), { recursive: true });
    let text = '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n';
    for (let n = 0; n < segmentsPerOutput; n += 1) {
      const file = pattern.replace('%03d', String(n).padStart(3, '0'));
      fs.writeFileSync(file, Buffer.alloc(500 + n));
      text += `#EXTINF:${segmentSeconds.toFixed(6)},\n${path.basename(file)}\n`;
    }
    fs.writeFileSync(playlist, `${text}#EXT-X-ENDLIST\n`);
  });
  return { seconds: 0 };
};

describe('createPipeline', () => {
  let root;
  let io;
  let db;
  let notify;
  let submit;
  let probeCalls;
  let probeResult;
  let moderate;

  const build = (extra = {}) =>
    createPipeline({
      config: extra.config || makeConfig(),
      io: extra.io || io,
      db: extra.db || db,
      submit: extra.submit || submit,
      probe: async (url) => {
        probeCalls.push(url);
        if (probeResult instanceof Error) throw probeResult;
        return probeResult;
      },
      runFfmpeg: extra.runFfmpeg || fakeFfmpeg(),
      moderate: extra.moderate || moderate,
      notify: extra.notify || notify,
      tmpRoot: path.join(root, 'tmp'),
    });

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'pipeline-test-'));
    io = createLocalIo({ root, sourcePath: path.join(root, 'source.mp4') });
    db = createFakeDb({ status: 'UPLOADING' });
    notify = createFakeNotify();
    submit = createFakeSubmit();
    probeCalls = [];
    probeResult = summarizeProbe(probeJson());
    moderate = jest.fn(async () => ({ status: 'approved', labels: [], maxConfidence: 0 }));
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(root, { recursive: true, force: true });
  });

  // ───────────────────────────────────────────────────────────────────────
  describe('planJob', () => {
    it('bỏ qua video đã bị xoá hoặc đã READY mà không đọc nguồn', async () => {
      const gone = build({ db: createFakeDb({ exists: false }) });
      expect((await gone.planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY })).mode).toBe('skipped');

      const ready = build({ db: createFakeDb({ status: 'READY' }) });
      expect((await ready.planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY })).mode).toBe('skipped');

      expect(probeCalls).toEqual([]);
      expect(submit.specs).toEqual([]);
    });

    it('lùi về đường một-job khi không đọc được nguồn, và KHÔNG đụng vào video', async () => {
      probeResult = new Error('ffprobe thất bại (mã 1): HTTP error 403');
      const outcome = await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });

      expect(outcome.mode).toBe('single');
      expect(outcome.reason).toMatch(/không đọc được nguồn/);
      expect(db.state.status).toBe('UPLOADING');
      expect(submit.specs).toEqual([]);
    });

    it('video không vượt ngưỡng đi đường một-job như trước giờ', async () => {
      probeResult = summarizeProbe(probeJson({ seconds: 1200 })); // đúng ngưỡng: không vượt
      const outcome = await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
      expect(outcome.mode).toBe('single');
      expect(db.state.status).toBe('UPLOADING');
      expect(submit.specs).toEqual([]);
    });

    it('không biết thời lượng (WebM ghi từ trình duyệt) thì đi đường một-job', async () => {
      probeResult = summarizeProbe(probeJson({ videoOverrides: { duration: 'N/A', nb_frames: 'N/A' }, seconds: 'N/A' }));
      expect((await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY })).mode).toBe('single');
    });

    it('nguồn VFR dài: lùi về một-job kèm lý do, không chia đoạn sai', async () => {
      probeResult = summarizeProbe(probeJson({ videoOverrides: { avg_frame_rate: '29970/1000', r_frame_rate: '90000/1' } }));
      const outcome = await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
      expect(outcome.mode).toBe('single');
      expect(outcome.reason).toMatch(/VFR/);
      expect(submit.specs).toEqual([]);
    });

    it('lùi về một-job khi chia ra chưa tới 2 đoạn (array job cần ít nhất 2 phần tử)', async () => {
      const outcome = await build({ config: makeConfig({ chunked: { thresholdSeconds: 10, gopsPerChunk: 5000 } }) }).planJob({
        videoId: VIDEO_ID,
        rawS3Key: RAW_KEY,
      });
      expect(outcome.mode).toBe('single');
      expect(outcome.reason).toMatch(/không đáng chia/);
    });

    describe('khi chia đoạn', () => {
      it('nhận video, ghi kế hoạch, rồi nộp ĐÚNG thứ tự: âm thanh → mảng đoạn → ghép', async () => {
        const outcome = await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });

        expect(outcome.mode).toBe('chunked');
        expect(db.state.status).toBe('PROCESSING');

        const [a64, a128, chunks, finalize] = submit.specs;
        expect([a64, a128].map((s) => s.command[2])).toEqual(['audio', 'audio']);
        expect([a64, a128].map((s) => s.environment.AUDIO_BITRATE)).toEqual(['64k', '128k']);

        expect(chunks.command[2]).toBe('chunk');
        expect(chunks.arraySize).toBe(48); // 4 giờ, đoạn 5 phút
        expect(chunks.dependsOn).toEqual(['job-1', 'job-2']); // chờ cả hai job âm thanh

        expect(finalize.command[2]).toBe('finalize');
        expect(finalize.dependsOn).toEqual(['job-3']); // chờ array job, tức mọi đoạn
        expect(outcome.jobs).toEqual({ audio: ['job-1', 'job-2'], chunks: 'job-3', finalize: 'job-4' });
      });

      it('mọi job con mang đúng VIDEO_ID và RAW_S3_KEY', async () => {
        await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
        for (const spec of submit.specs) {
          expect(spec.environment).toMatchObject({ VIDEO_ID, RAW_S3_KEY: RAW_KEY });
        }
      });

      it('job âm thanh và ghép có timeout dài; job đoạn dùng timeout mặc định của job definition', async () => {
        await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
        const [a64, , chunks, finalize] = submit.specs;
        expect(a64.timeoutSeconds).toBe(realConfig.chunked.longJobTimeoutSeconds);
        expect(finalize.timeoutSeconds).toBe(realConfig.chunked.longJobTimeoutSeconds);
        expect(chunks.timeoutSeconds).toBeUndefined();
      });

      it('đường chia đoạn nhận ĐỦ thang chất lượng, không phải thang rút gọn của video dài', async () => {
        await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
        const document = await io.getWorkJson(io.workKey(VIDEO_ID, 'plan.json'));
        expect(document.renditions.map((r) => r.name)).toEqual(['144p', '240p', '360p', '480p', '720p', '1080p']);
      });

      it('ghi kế hoạch đủ để các job con làm việc mà không phải hỏi lại', async () => {
        await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
        const document = await io.getWorkJson(io.workKey(VIDEO_ID, 'plan.json'));

        expect(document).toMatchObject({
          version: 1,
          videoId: VIDEO_ID,
          rawS3Key: RAW_KEY,
          source: { videoStreamIndex: 0, audioStreamIndex: 1, width: 1920, height: 1080 },
        });
        expect(document.plan.chunks).toHaveLength(48);
        expect(document.audio).toEqual([
          { bitrate: '64k', key: `work/${VIDEO_ID}/audio-64k.m4a` },
          { bitrate: '128k', key: `work/${VIDEO_ID}/audio-128k.m4a` },
        ]);
      });

      it('nguồn nhỏ chỉ có các mức thấp thì chỉ mã hoá một bitrate âm thanh', async () => {
        probeResult = summarizeProbe(probeJson({ size: [426, 240] }));
        await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
        expect(submit.specs.filter((s) => s.command[2] === 'audio').map((s) => s.environment.AUDIO_BITRATE)).toEqual(['64k']);
      });

      it('nguồn không có tiếng: không job âm thanh, mảng đoạn không phải chờ ai', async () => {
        probeResult = summarizeProbe(probeJson({ audio: false }));
        await build().planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });

        expect(submit.specs.map((s) => s.command[2])).toEqual(['chunk', 'finalize']);
        expect(submit.specs[0].dependsOn).toEqual([]);
        const document = await io.getWorkJson(io.workKey(VIDEO_ID, 'plan.json'));
        expect(document.audio).toEqual([]);
        expect(document.source.audioStreamIndex).toBeNull();
      });

      it('job trùng lặp (S3 event gửi hai lần) không nộp lại pipeline', async () => {
        const pipeline = build();
        expect((await pipeline.planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY })).mode).toBe('chunked');
        const before = submit.specs.length;

        const again = await pipeline.planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
        expect(again.mode).toBe('skipped');
        expect(again.reason).toMatch(/already submitted/);
        expect(submit.specs).toHaveLength(before);
      });

      it('nộp job hỏng giữa chừng: video bị đánh ERROR, chủ video được báo, lỗi được ném tiếp', async () => {
        let n = 0;
        const flaky = async (spec) => {
          n += 1;
          if (n === 3) throw new Error('AccessDeniedException: batch:SubmitJob');
          return submit(spec);
        };
        await expect(build({ submit: flaky }).planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY })).rejects.toThrow(/AccessDenied/);

        expect(db.state.status).toBe('ERROR');
        expect(db.state.error).toMatch(/^plan: AccessDeniedException/);
        expect(notify.sent.failed).toHaveLength(1);
      });

      it('chưa nộp xong thì chưa đánh dấu đã nộp, để job thử lại sau Spot bị thu hồi vẫn nộp được', async () => {
        const failing = async () => {
          throw new Error('boom');
        };
        await expect(build({ submit: failing }).planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY })).rejects.toThrow('boom');
        expect(await io.getWorkJson(io.workKey(VIDEO_ID, 'submitted.json'))).toBeNull();
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  describe('chunkJob', () => {
    const planned = async (probeOverrides = {}) => {
      probeResult = summarizeProbe(probeJson({ seconds: 3000, ...probeOverrides })); // 50 phút → 10 đoạn
      const pipeline = build();
      await pipeline.planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
      db.state.status = 'PROCESSING';
      return pipeline;
    };

    it('mã hoá đoạn đúng chỉ số, ký lại URL, ghi kết quả CUỐI CÙNG sau khi đã upload', async () => {
      const calls = [];
      await planned();
      const pipeline = build({ runFfmpeg: fakeFfmpeg({ calls }) });

      const result = await pipeline.chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 3 });
      expect(result).toEqual({ skipped: false, segments: 3 });

      // Segment lên "bucket processed" dưới videos/<id>/<mức>/ với tên chứa số đoạn.
      const uploaded = fs.readdirSync(path.join(io.processedRoot, 'videos', VIDEO_ID, '720p'));
      expect(uploaded.sort()).toEqual(['segment_c0003_000.ts', 'segment_c0003_001.ts', 'segment_c0003_002.ts']);

      // playlist riêng của đoạn không được đẩy lên: bản cuối do job ghép dựng.
      expect(fs.existsSync(path.join(io.processedRoot, 'videos', VIDEO_ID, '720p', 'playlist.m3u8'))).toBe(false);

      const saved = await io.getWorkJson(io.workKey(VIDEO_ID, 'chunks/0003.json'));
      expect(saved.index).toBe(3);
      expect(saved.renditions['720p'].segments).toHaveLength(3);
      expect(saved.renditions['720p'].segments[0]).toMatchObject({ file: 'segment_c0003_000.ts', duration: 6.006, bytes: 500 });
      expect(saved.codecs).toBeUndefined(); // chỉ đoạn 0 thăm dò codec

      expect(calls[0].args.join(' ')).toContain('-output_ts_offset');
    });

    it('chỉ đoạn 0 thăm dò CODECS', async () => {
      await planned();
      const pipeline = build({ runFfmpeg: fakeFfmpeg() });
      await pipeline.chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 0 });
      const saved = await io.getWorkJson(io.workKey(VIDEO_ID, 'chunks/0000.json'));
      expect(saved.codecs).toEqual({}); // tệp giả không có codec thật, nhưng khoá có mặt: đã thử thăm dò
    });

    it('thử lại ffmpeg trong CÙNG job và ký lại URL mỗi lần (URL cũ có thể đã hết hạn)', async () => {
      await planned();
      const signed = [];
      const originalSourceUrl = io.sourceUrl;
      io.sourceUrl = async (key) => {
        signed.push(key);
        return originalSourceUrl(key);
      };

      const calls = [];
      const pipeline = build({ runFfmpeg: fakeFfmpeg({ calls, fail: (attempt) => attempt === 1 }) });
      const result = await pipeline.chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 2 });

      expect(result.skipped).toBe(false);
      expect(calls).toHaveLength(2);
      expect(signed).toHaveLength(2);
      expect(db.state.status).toBe('PROCESSING');
    });

    it('hết số lần thử thì đánh ERROR một lần, báo chủ video một lần, và ném lỗi', async () => {
      await planned();
      const pipeline = build({ runFfmpeg: fakeFfmpeg({ fail: () => true }) });

      await expect(pipeline.chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 1 })).rejects.toThrow(/403/);
      expect(db.state.status).toBe('ERROR');
      expect(db.state.error).toMatch(/^chunk 1: /);
      expect(notify.sent.failed).toHaveLength(1);
    });

    it('một đoạn thất bại làm các đoạn còn lại dừng sớm, không mã hoá vô ích và không hồi sinh video', async () => {
      await planned();
      const calls = [];
      const bad = build({ runFfmpeg: fakeFfmpeg({ fail: () => true }) });
      await expect(bad.chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 0 })).rejects.toThrow();

      const later = build({ runFfmpeg: fakeFfmpeg({ calls }) });
      const result = await later.chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 1 });

      expect(result).toEqual({ skipped: true });
      expect(calls).toEqual([]);
      expect(db.state.status).toBe('ERROR'); // vẫn ERROR, không bị kéo về PROCESSING
      expect(notify.sent.failed).toHaveLength(1); // không gửi thêm email
    });

    it('video đã bị xoá thì bỏ qua êm', async () => {
      await planned();
      db.state.exists = false;
      const calls = [];
      const result = await build({ runFfmpeg: fakeFfmpeg({ calls }) }).chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 0 });
      expect(result).toEqual({ skipped: true });
      expect(calls).toEqual([]);
    });

    it('đoạn giữa không ra segment nào là lỗi, nhưng đoạn CUỐI rỗng thì chấp nhận', async () => {
      await planned();
      const empty = fakeFfmpeg({ segmentsPerOutput: 0 });

      await expect(build({ runFfmpeg: empty }).chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 2 })).rejects.toThrow(/không sinh ra segment/);

      db.state.status = 'PROCESSING';
      const document = await io.getWorkJson(io.workKey(VIDEO_ID, 'plan.json'));
      const lastIndex = document.plan.chunks.length - 1;
      const result = await build({ runFfmpeg: empty }).chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: lastIndex });
      expect(result).toEqual({ skipped: false, segments: 0 });
    });

    it('chỉ số đoạn ngoài kế hoạch là lỗi rõ ràng', async () => {
      await planned();
      await expect(build({ runFfmpeg: fakeFfmpeg() }).chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 999 })).rejects.toThrow(/không có đoạn 999/);
    });

    it('dọn thư mục tạm cục bộ dù thành công hay thất bại', async () => {
      await planned();
      await build({ runFfmpeg: fakeFfmpeg() }).chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 4 });
      expect(fs.existsSync(path.join(root, 'tmp', `${VIDEO_ID}-chunk-0004`))).toBe(false);

      db.state.status = 'PROCESSING';
      await build({ runFfmpeg: fakeFfmpeg({ fail: () => true }) }).chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index: 5 }).catch(() => {});
      expect(fs.existsSync(path.join(root, 'tmp', `${VIDEO_ID}-chunk-0005`))).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  describe('audioJob', () => {
    it('mã hoá âm thanh một lần và đặt đúng khoá để các job đoạn tìm thấy', async () => {
      probeResult = summarizeProbe(probeJson({ seconds: 3000 }));
      const pipeline = build({ runFfmpeg: fakeFfmpeg() });
      await pipeline.planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
      db.state.status = 'PROCESSING';

      const result = await pipeline.audioJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, bitrate: '128k' });
      expect(result.key).toBe(`work/${VIDEO_ID}/audio-128k.m4a`);
      expect(fs.existsSync(path.join(io.rawRoot, result.key))).toBe(true);
    });

    it('bitrate không có trong kế hoạch là lỗi và đánh ERROR', async () => {
      probeResult = summarizeProbe(probeJson({ seconds: 3000 }));
      const pipeline = build({ runFfmpeg: fakeFfmpeg() });
      await pipeline.planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
      db.state.status = 'PROCESSING';

      await expect(pipeline.audioJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, bitrate: '192k' })).rejects.toThrow(/192k/);
      expect(db.state.status).toBe('ERROR');
    });

    it('video không còn xử lý thì bỏ qua', async () => {
      const calls = [];
      const result = await build({ runFfmpeg: fakeFfmpeg({ calls }) }).audioJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, bitrate: '64k' });
      expect(result).toEqual({ skipped: true });
      expect(calls).toEqual([]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  describe('finalizeJob', () => {
    /**
     * Chạy plan → âm thanh → mọi đoạn bằng ffmpeg giả. Mặc định dùng video ngắn với đoạn 3 GOP và
     * ngưỡng hạ thấp: 120 s ra 7 đoạn, mỗi đoạn 3 segment x 6,006 s đúng như ffmpeg giả ghi, nên kế hoạch
     * và kết quả khớp nhau. Truyền mismatch để dùng đoạn 50 GOP (kế hoạch) với ffmpeg giả vẫn ra 3 segment.
     */
    const runPipeline = async ({ moderationEnabled = false, mismatch = false } = {}) => {
      const seconds = mismatch ? 3000 : 120;
      probeResult = summarizeProbe(probeJson({ seconds }));
      const config = makeConfig({
        chunked: mismatch ? {} : { thresholdSeconds: 10, gopsPerChunk: 3 },
        moderation: { enabled: moderationEnabled },
      });
      const pipeline = build({ config, runFfmpeg: fakeFfmpeg({ segmentsPerOutput: 3 }) });
      const outcome = await pipeline.planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
      for (const spec of submit.specs.filter((s) => s.command[2] === 'audio')) {
        await pipeline.audioJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, bitrate: spec.environment.AUDIO_BITRATE });
      }
      for (let index = 0; index < outcome.chunks; index += 1) {
        await pipeline.chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index });
      }
      return { pipeline, chunks: outcome.chunks };
    };

    const leftover = () =>
      fs.readdirSync(path.join(io.rawRoot, 'work', VIDEO_ID), { recursive: true }).filter((f) => /\.(json|m4a)$/.test(f));

    it('từ chối công bố khi các đoạn không khớp kế hoạch (ffmpeg giả ra 3 segment thay vì 50)', async () => {
      const { pipeline } = await runPipeline({ mismatch: true });
      await expect(pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY })).rejects.toThrow(/không nhất quán/);
      expect(db.state.status).toBe('ERROR');
      expect(db.state.hlsUrl).toBeNull();
    });

    it('ghép xong thì READY, gửi đúng một email, và master.m3u8 lên SAU CÙNG', async () => {
      const { pipeline, chunks } = await runPipeline();
      const order = [];
      const originalPut = io.putProcessedFile;
      io.putProcessedFile = async (local, key) => {
        order.push(key);
        return originalPut(local, key);
      };

      const result = await pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });

      expect(result.skipped).toBe(false);
      expect(db.state.status).toBe('READY');
      expect(db.state.hlsUrl).toBe(result.hlsUrl);
      expect(notify.sent.ready).toHaveLength(1);
      expect(order.at(-1)).toBe(`videos/${VIDEO_ID}/master.m3u8`);
      expect(order.slice(0, -1).every((k) => k.endsWith('playlist.m3u8') || k.endsWith('thumbnail.jpg'))).toBe(true);
    });

    it('playlist ghép nối đúng thứ tự đoạn và master có BANDWIDTH đo từ segment', async () => {
      const { pipeline, chunks } = await runPipeline();
      await pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });

      const dir = path.join(io.processedRoot, 'videos', VIDEO_ID);
      const playlist = fs.readFileSync(path.join(dir, '720p', 'playlist.m3u8'), 'utf-8');
      const files = [...playlist.matchAll(/^(segment_\S+)$/gm)].map((m) => m[1]);
      expect(files).toHaveLength(chunks * 3); // mỗi đoạn 3 segment
      expect(files.slice(0, 4)).toEqual(['segment_c0000_000.ts', 'segment_c0000_001.ts', 'segment_c0000_002.ts', 'segment_c0001_000.ts']);
      expect([...files].sort()).toEqual(files); // đúng thứ tự tăng dần

      const master = fs.readFileSync(path.join(dir, 'master.m3u8'), 'utf-8');
      expect(master).toMatch(/BANDWIDTH=\d+/);
      expect(master.match(/EXT-X-STREAM-INF/g)).toHaveLength(6);
    });

    it('dọn mọi tệp tạm của video sau khi READY', async () => {
      const { pipeline, chunks } = await runPipeline();
      await pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
      expect(leftover()).toEqual([]);
    });

    it('kiểm duyệt bật: chạy trên nguồn qua HTTP và ghi kết quả CÙNG lệnh READY', async () => {
      const { pipeline } = await runPipeline({ moderationEnabled: true });
      await pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });

      expect(moderate).toHaveBeenCalledTimes(1);
      expect(moderate.mock.calls[0][0]).toBe(path.join(root, 'source.mp4'));
      expect(moderate.mock.calls[0][1]).toBeCloseTo(120, 0); // thời lượng video, không phải của một đoạn
      expect(db.state.moderation).toMatchObject({ status: 'approved' });
      expect(notify.sent.ready[0].moderation).toMatchObject({ status: 'approved' });
    });

    it('thiếu kết quả của một đoạn thì không công bố, đánh ERROR', async () => {
      const { pipeline, chunks } = await runPipeline();
      fs.rmSync(path.join(io.rawRoot, io.workKey(VIDEO_ID, 'chunks/0004.json')));

      await expect(pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY })).rejects.toThrow(/đoạn 4: không có kết quả/);
      expect(db.state.status).toBe('ERROR');
      expect(db.state.hlsUrl).toBeNull();
    });

    it('job ghép chạy trùng khi video đã READY: không ghi đè, không gửi email lần hai', async () => {
      const { pipeline, chunks } = await runPipeline();
      await pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
      expect(notify.sent.ready).toHaveLength(1);

      const again = await pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
      expect(again).toEqual({ skipped: true });
      expect(notify.sent.ready).toHaveLength(1);
    });

    it('thua cuộc đua ghi READY (hai job ghép cùng qua bước kiểm tra): không gửi email trùng', async () => {
      const { pipeline } = await runPipeline();
      // Một job khác ghi READY ngay trước lệnh ghi của job này, sau khi job này đã qua bước kiểm tra "còn sống".
      const original = db.updateVideoReady;
      db.updateVideoReady = async (id, data) => {
        db.state.status = 'READY';
        return original(id, data);
      };

      const result = await pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });

      expect(result.skipped).toBe(false);
      expect(db.state.status).toBe('READY');
      expect(notify.sent.ready).toEqual([]); // job thắng cuộc mới là bên gửi
      expect(notify.sent.failed).toEqual([]);
    });

    it('video bị xoá giữa chừng: bỏ qua và dọn tệp tạm', async () => {
      const { pipeline, chunks } = await runPipeline();
      db.state.exists = false;

      expect(await pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY })).toEqual({ skipped: true });
      expect(leftover()).toEqual([]);
    });
  });
});
