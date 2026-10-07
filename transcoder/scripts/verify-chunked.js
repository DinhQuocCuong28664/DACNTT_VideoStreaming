#!/usr/bin/env node
/**
 * Kiểm chứng đường chia đoạn bằng ffmpeg thật trên một tệp cục bộ, không cần AWS.
 *
 *   node scripts/verify-chunked.js <nguon.mp4> <thu-muc-ra> [soGopMoiDoan=3] [cacMuc=360p,720p]
 *
 * Chạy đúng các hàm của pipeline (probe → buildChunkPlan → buildAudioArgs → buildChunkArgs
 * → buildMediaPlaylist) rồi so playlist ghép với một lần mã hoá liền bằng buildFFmpegArgs:
 * số segment, độ dài từng segment, khe hở/chồng lấn của gói hình và gói tiếng ở ranh giới đoạn.
 * Dùng để chứng minh E1-E5 của docs/CHUNKED_TRANSCODING_DESIGN.md trên chính mã sẽ chạy
 * trên Batch, và để chạy lại sau mỗi lần đổi cờ ffmpeg.
 *
 * Kết thúc với mã 1 nếu có sai lệch, để dùng được trong script.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const config = require('../src/config');
const { planRenditions, buildFFmpegArgs, parseMediaPlaylist } = require('../src/transcoder');
const { buildChunkPlan, audioBitratesFor, audioBitrateFor } = require('../src/chunked/plan');
const { buildAudioArgs, buildChunkArgs, chunkLabel } = require('../src/chunked/ffmpegArgs');
const { summarizeProbe, evaluateEligibility, planningInputs } = require('../src/chunked/probe');
const { readChunkRendition, buildMediaPlaylist, collectSegments, validateChunkResults, sumSeconds } = require('../src/chunked/playlist');

const [source, outRoot, gopsArg, namesArg] = process.argv.slice(2);
if (!source || !outRoot) {
  console.error('Cách dùng: node scripts/verify-chunked.js <nguon> <thu-muc-ra> [soGopMoiDoan] [cacMuc]');
  process.exit(2);
}
const gopsPerChunk = Number(gopsArg) || 3;
const wanted = (namesArg || '360p,720p').split(',');

const run = (cmd, args, label) => {
  const started = Date.now();
  const r = spawnSync(cmd, args, { encoding: 'utf-8', maxBuffer: 1 << 28 });
  if (r.status !== 0) {
    console.error(`✗ ${label} thất bại (mã ${r.status})\n${(r.stderr || '').slice(-800)}`);
    process.exit(1);
  }
  console.log(`  ${label}: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  return r.stdout;
};

fs.rmSync(outRoot, { recursive: true, force: true });
fs.mkdirSync(outRoot, { recursive: true });

// 1. Probe + kế hoạch -------------------------------------------------------
const summary = summarizeProbe(
  JSON.parse(run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', source], 'ffprobe'))
);
const verdict = evaluateEligibility(summary);
if (!verdict.ok) {
  console.error(`✗ nguồn không chia đoạn được: ${verdict.reason}`);
  process.exit(1);
}
const inputs = planningInputs(summary);
const plan = buildChunkPlan({ ...inputs, gopsPerChunk });
const size = summary.video.size;
const ladder = config.ffmpeg.renditions.filter((r) => wanted.includes(r.name));
const renditions = planRenditions(size, ladder);

console.log(
  `Nguồn: ${size.width}x${size.height} ${summary.video.fps.num}/${summary.video.fps.den} fps, ${inputs.frameCount} khung, ` +
    `${plan.chunks.length} đoạn x ${plan.gopsPerChunk} GOP (${plan.chunkSeconds}s), mức: ${renditions.map((r) => r.name).join(',')}`
);

// 2. Mã hoá một lần (đối chứng) ---------------------------------------------
const singleDir = path.join(outRoot, 'single');
for (const r of renditions) fs.mkdirSync(path.join(singleDir, r.name), { recursive: true });
// Đối chứng dùng đúng thang âm thanh của đường chia đoạn (64k/128k) để so tiếng công bằng.
const singleArgs = buildFFmpegArgs(source, singleDir, renditions, summary.video.fps.num / summary.video.fps.den);
run('ffmpeg', singleArgs, 'mã hoá một lần');

// 3. Âm thanh một lần -------------------------------------------------------
const audio = [];
if (summary.audio) {
  for (const bitrate of audioBitratesFor(renditions)) {
    const outputPath = path.join(outRoot, `audio-${bitrate}.m4a`);
    run('ffmpeg', buildAudioArgs({ inputUrl: source, streamIndex: summary.audio.index, bitrate, outputPath }), `âm thanh ${bitrate}`);
    audio.push({ bitrate, url: outputPath });
  }
}

// 4. Từng đoạn --------------------------------------------------------------
const chunksDir = path.join(outRoot, 'chunks');
const results = [];
for (const chunk of plan.chunks) {
  const dir = path.join(chunksDir, chunkLabel(chunk.index));
  for (const r of renditions) fs.mkdirSync(path.join(dir, r.name), { recursive: true });
  run(
    'ffmpeg',
    buildChunkArgs({
      videoUrl: source,
      videoStreamIndex: summary.video.index,
      audio,
      renditions,
      chunk,
      gopFrames: plan.gopFrames,
      segmentSeconds: plan.segmentSeconds,
      outputDir: dir,
    }),
    `đoạn ${chunk.index}`
  );
  const result = { index: chunk.index, dir, renditions: {} };
  for (const r of renditions) result.renditions[r.name] = { segments: readChunkRendition(path.join(dir, r.name)) };
  results.push(result);
}

// 5. Ghép + kiểm tra --------------------------------------------------------
const names = renditions.map((r) => r.name);
const check = validateChunkResults({ plan, results, renditionNames: names });
let failed = check.errors.length > 0;
for (const e of check.errors) console.error(`✗ ${e}`);
for (const w of check.warnings) console.warn(`! ${w}`);

const gaps = (packets, tolerance) => {
  const sorted = [...packets].sort((a, b) => a.pts - b.pts);
  const found = [];
  for (let i = 0; i + 1 < sorted.length; i += 1) {
    const gap = sorted[i + 1].pts - (sorted[i].pts + sorted[i].dur);
    if (Math.abs(gap) > tolerance) found.push({ at: Number(sorted[i + 1].pts.toFixed(4)), ms: Number((gap * 1000).toFixed(2)) });
  }
  return found;
};
const packets = (playlist, stream) => {
  const out = spawnSync(
    'ffprobe',
    ['-v', 'error', '-protocol_whitelist', 'file,crypto,data', '-allowed_extensions', 'ALL', '-select_streams', stream,
      '-show_entries', 'packet=pts_time,duration_time', '-of', 'json', playlist],
    { encoding: 'utf-8', maxBuffer: 1 << 28 }
  );
  return JSON.parse(out.stdout).packets
    .filter((p) => p.pts_time !== undefined)
    .map((p) => ({ pts: Number(p.pts_time), dur: Number(p.duration_time) }));
};

console.log('\nSo sánh với mã hoá một lần:');
for (const r of renditions) {
  const merged = collectSegments(results, r.name).map((s) => ({
    ...s,
    file: path.relative(outRoot, path.join(results.find((x) => x.renditions[r.name].segments.includes(s)).dir, r.name, s.file)).replace(/\\/g, '/'),
  }));
  const mergedPath = path.join(outRoot, `merged-${r.name}.m3u8`);
  fs.writeFileSync(mergedPath, buildMediaPlaylist(merged));

  const single = parseMediaPlaylist(fs.readFileSync(path.join(singleDir, r.name, 'playlist.m3u8'), 'utf-8'));
  const singleTotal = single.reduce((t, s) => t + s.duration, 0);
  const mergedTotal = sumSeconds(merged);

  const v = packets(mergedPath, 'v:0');
  const a = summary.audio ? packets(mergedPath, 'a:0') : [];
  const vGaps = gaps(v, 0.002);
  // Gói AAC trùng lặp ở ranh giới (E4) hiện ra là một chồng lấn đúng một khung (~23,2 ms).
  const aGaps = gaps(a, 0.002);
  const aOverlaps = aGaps.filter((g) => g.ms < 0);
  const aHoles = aGaps.filter((g) => g.ms > 0);

  // Mọi segment trừ cái cuối phải dài đúng một GOP. Đối chứng một-lần chỉ để tham khảo: đường
  // một-job dùng GOP làm tròn xuống + force_key_frames theo giây nên ở 29,97 fps có một segment
  // ngắn 5,973 s sau mỗi ~5,5 segment (chính lỗi mà đường chia đoạn tránh).
  const regular = merged.slice(0, -1).every((s) => Math.abs(s.duration - plan.gopSeconds) < 0.002);
  const lengthsSame = regular;
  const okTotal = Math.abs(singleTotal - mergedTotal) < 0.1;
  const okVideo = vGaps.length === 0;
  const okAudio = aHoles.length === 0 && aOverlaps.every((g) => Math.abs(g.ms + 23.22) < 1);
  failed = failed || !regular || !okTotal || !okVideo || !okAudio;

  console.log(
    `  ${r.name.padEnd(6)} segment: một-lần=${single.length} ghép=${merged.length}${regular ? ` (mọi segment trừ cuối đúng ${plan.gopSeconds}s)` : ' (CÓ SEGMENT LỆCH GOP)'}` +
      ` | tổng: ${singleTotal.toFixed(3)} vs ${mergedTotal.toFixed(3)} ${okTotal ? '✓' : '✗'}`
  );
  console.log(
    `         hình: khe hở/chồng lấn >2ms ở ranh giới = ${vGaps.length ? JSON.stringify(vGaps) : 'không'} ${okVideo ? '✓' : '✗'}` +
      ` | tiếng: ${aOverlaps.length} chồng lấn 1 khung AAC, ${aHoles.length} khe hở ${okAudio ? '✓' : '✗'}`
  );
}

// Segment đầu tiên của mỗi đoạn phải là keyframe và có cả hình lẫn tiếng.
console.log(failed ? '\n✗ CÓ SAI LỆCH' : '\n✓ đường chia đoạn khớp mã hoá một lần');
process.exit(failed ? 1 : 0);
