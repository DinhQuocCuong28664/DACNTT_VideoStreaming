#!/usr/bin/env node
/**
 * Chạy TOÀN BỘ pipeline chia đoạn cục bộ bằng ffmpeg thật: plan → âm thanh → từng đoạn → ghép.
 *
 *   node scripts/verify-pipeline.js <nguon> <thu-muc-ra> [soGopMoiDoan=3] [nguongGiay=10]
 *
 * Dùng đúng createPipeline() chạy trên Batch; chỉ S3 (thư mục), MongoDB (bộ nhớ), Batch (bản
 * ghi giả, các job con được chạy lần lượt theo đúng thứ tự phụ thuộc) và kiểm duyệt là bản giả.
 * Khác verify-chunked.js (kiểm lệnh ffmpeg từng mảnh), script này kiểm cả khâu điều phối: kế hoạch,
 * tên tệp, kết quả từng đoạn, ghép, master playlist, thumbnail, dọn tệp tạm, trạng thái video.
 */
const fs = require('fs');
const path = require('path');

const config = require('../src/config');
const { createPipeline } = require('../src/chunked/pipeline');
const { probeSource } = require('../src/chunked/probe');
const { runFfmpegProcess } = require('../src/chunked/run');
const { parseMediaPlaylist } = require('../src/transcoder');
const { createLocalIo } = require('./lib/localIo');
const { createFakeDb, createFakeNotify, createFakeSubmit } = require('./lib/fakes');
const { packets, gaps, AAC_FRAME_MS } = require('./lib/analyze');

const [source, outRoot, gopsArg, thresholdArg] = process.argv.slice(2);
if (!source || !outRoot) {
  console.error('Cách dùng: node scripts/verify-pipeline.js <nguon> <thu-muc-ra> [soGopMoiDoan] [nguongGiay]');
  process.exit(2);
}

// Bật pipeline và hạ ngưỡng để nguồn ngắn dùng để thử cũng đi đường chia đoạn.
config.chunked.enabled = true;
config.chunked.thresholdSeconds = Number(thresholdArg) || 10;
config.chunked.gopsPerChunk = Number(gopsArg) || 3;
config.chunked.ffmpegAttempts = 1;
config.moderation.enabled = false;

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });

const VIDEO_ID = '6a78c10f1c4541ef615cf01d';
const RAW_KEY = `videos/user/${VIDEO_ID}/${path.basename(source)}`;

const io = createLocalIo({ root: outRoot, sourcePath: source });
const db = createFakeDb({ status: 'UPLOADING' });
const notify = createFakeNotify();
const submit = createFakeSubmit();

const pipeline = createPipeline({
  config,
  io,
  db,
  submit,
  probe: probeSource,
  runFfmpeg: runFfmpegProcess,
  moderate: async () => null,
  notify,
  tmpRoot: path.join(outRoot, 'tmp'),
});

const failures = [];
const check = (ok, message) => {
  console.log(`  ${ok ? '✓' : '✗'} ${message}`);
  if (!ok) failures.push(message);
};

(async () => {
  console.log('1. plan');
  const outcome = await pipeline.planJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });
  check(outcome.mode === 'chunked', `planner chọn đường chia đoạn (${outcome.mode}${outcome.reason ? `: ${outcome.reason}` : ''})`);
  if (outcome.mode !== 'chunked') process.exit(1);

  const specs = submit.specs;
  const arraySpec = specs.find((s) => s.arraySize);
  const finalizeSpec = specs[specs.length - 1];
  check(db.state.status === 'PROCESSING', 'video chuyển sang PROCESSING');
  check(arraySpec.dependsOn.length === specs.filter((s) => s.command[2] === 'audio').length, 'array job đợi mọi job âm thanh');
  check(finalizeSpec.dependsOn[0] === outcome.jobs.chunks, 'job ghép đợi array job');

  console.log('2. chạy các job con theo thứ tự phụ thuộc (các đoạn chạy 3 đoạn song song)');
  for (const spec of specs.filter((s) => s.command[2] === 'audio')) {
    await pipeline.audioJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, bitrate: spec.environment.AUDIO_BITRATE });
  }
  const indexes = [...Array(arraySpec.arraySize).keys()];
  let next = 0;
  const lane = async () => {
    while (next < indexes.length) {
      const index = indexes[next++];
      await pipeline.chunkJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY, index });
    }
  };
  await Promise.all([lane(), lane(), lane()]);
  const done = await pipeline.finalizeJob({ videoId: VIDEO_ID, rawS3Key: RAW_KEY });

  console.log('3. kiểm tra kết quả');
  check(!done.skipped && db.state.status === 'READY', `video READY (${db.state.status})`);
  check(notify.sent.ready.length === 1 && notify.sent.failed.length === 0, 'đúng một email "sẵn sàng", không email lỗi');

  const videoDir = path.join(io.processedRoot, 'videos', VIDEO_ID);
  const masterPath = path.join(videoDir, 'master.m3u8');
  check(fs.existsSync(masterPath), 'master.m3u8 đã có');
  check(fs.existsSync(path.join(videoDir, 'thumbnail.jpg')), 'thumbnail.jpg đã có');

  const master = fs.readFileSync(masterPath, 'utf-8');
  const variants = [...master.matchAll(/#EXT-X-STREAM-INF:([^\n]*)\n(\S+)/g)].map((m) => ({ attrs: m[1], uri: m[2] }));
  check(variants.length > 0, `master có ${variants.length} variant`);
  check(variants.every((v) => /BANDWIDTH=\d+/.test(v.attrs) && /CODECS="avc1\.[0-9a-f]{6}(,mp4a\.40\.2)?"/.test(v.attrs)), 'mọi variant có BANDWIDTH đo được và CODECS đọc từ luồng');

  const duration = db.state.duration;
  for (const v of variants) {
    const playlist = path.join(videoDir, v.uri);
    const segments = parseMediaPlaylist(fs.readFileSync(playlist, 'utf-8'));
    const total = segments.reduce((t, s) => t + s.duration, 0);
    const missing = segments.filter((s) => !fs.existsSync(path.join(path.dirname(playlist), s.file)));
    const v0 = packets(playlist, 'v:0');
    const a0 = packets(playlist, 'a:0');
    const vGaps = gaps(v0, 0.002);
    const aGaps = gaps(a0, 0.002);
    const aHoles = aGaps.filter((g) => g.ms > 0);
    const aBad = aGaps.filter((g) => g.ms < 0 && Math.abs(g.ms + AAC_FRAME_MS) > 1);
    const regular = segments.slice(0, -1).every((s) => Math.abs(s.duration - segments[0].duration) < 0.002);

    const name = v.uri.split('/')[0];
    // CODECS phải khớp luồng thật: có mp4a khi và chỉ khi playlist có tiếng.
    check(/mp4a\.40\.2/.test(v.attrs) === (a0.length > 0), `${name}: CODECS ${a0.length > 0 ? 'có' : 'không có'} mp4a đúng với luồng`);
    check(missing.length === 0, `${name}: ${segments.length} segment, đủ tệp trên "bucket processed"`);
    check(Math.abs(total - duration) < 0.15, `${name}: tổng ${total.toFixed(3)}s khớp thời lượng video ${duration.toFixed(3)}s`);
    check(regular, `${name}: mọi segment trừ cuối cùng độ dài ${segments[0].duration}s`);
    check(vGaps.length === 0, `${name}: hình liền mạch qua ranh giới đoạn${vGaps.length ? ` ${JSON.stringify(vGaps)}` : ''}`);
    check(aHoles.length === 0 && aBad.length === 0, `${name}: tiếng không khe hở${a0.length ? '' : ' (nguồn không có tiếng)'}`);
  }

  const leftover = fs.readdirSync(path.join(io.rawRoot, 'work', VIDEO_ID), { recursive: true }).filter((f) => /\.(json|m4a)$/.test(f));
  check(leftover.length === 0, `đã dọn hết tệp tạm của pipeline${leftover.length ? ` (còn ${leftover.join(', ')})` : ''}`);
  check(!fs.existsSync(path.join(outRoot, 'tmp', `${VIDEO_ID}-final`)), 'đã dọn thư mục tạm cục bộ');

  console.log(failures.length === 0 ? '\n✓ pipeline chia đoạn chạy đúng từ đầu đến cuối' : `\n✗ ${failures.length} KIỂM TRA THẤT BẠI`);
  process.exit(failures.length === 0 ? 0 : 1);
})().catch((err) => {
  console.error('✗ pipeline lỗi:', err.stack || err.message);
  process.exit(1);
});
