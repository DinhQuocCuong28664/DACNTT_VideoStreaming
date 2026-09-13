#!/usr/bin/env node
/**
 * Chạy phép đo QoE trên NHIỀU video nguồn rồi gộp kết quả thành một bảng.
 *
 * ============================================================================
 * VÌ SAO CẦN TỆP NÀY
 * ============================================================================
 * Phép đo hiện có trong báo cáo chạy trên đúng **một** video, và chương 6 tự
 * ghi lại hạn chế đó. Một mẫu duy nhất thì không phân biệt được "hệ thống hành
 * xử như vậy" với "nội dung đó khiến hệ thống hành xử như vậy".
 *
 * Thứ cần biến thiên là **độ phức tạp hình ảnh**, vì nó quyết định số bit nội
 * dung cần, và do đó quyết định các bậc thang bitrate tách nhau hay co cụm.
 * KHÔNG cần biến thiên thời lượng: thời lượng chỉ cần dài hơn cửa sổ đo, quá
 * ngưỡng đó thì dài thêm không cho thêm dữ liệu mà vẫn tốn thời gian chuyển mã.
 *
 * ============================================================================
 * HAI CHẾ ĐỘ
 * ============================================================================
 *   node scripts/qoe/compare.js probe samples/a.mp4 samples/b.mp4 ...
 *       Đo độ phức tạp của các tệp nguồn TRƯỚC khi tải lên. Dùng để biết ba
 *       video định chọn có thật sự khác nhau hay không.
 *
 *   node scripts/qoe/compare.js run --manifest docs/results/qoe-sources.json
 *       Chạy ma trận video × hồ sơ mạng, rồi gộp thành bảng so sánh.
 *
 * Tệp manifest có dạng:
 *   [
 *     { "label": "tinh",  "url": "https://zelostech.site/watch/<id>" },
 *     { "label": "vua",   "url": "https://zelostech.site/watch/<id>" },
 *     { "label": "dong",  "url": "https://zelostech.site/watch/<id>" }
 *   ]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = __dirname;
const RESULTS = path.resolve(HERE, '../../docs/results');

const PROFILES = ['unthrottled', 'fast3g', 'slow3g'];
const RUNS = 5;
const DURATION = 120;
const WARMUPS = 2;

/**
 * Độ phức tạp đo bằng bitrate ở CRF cố định.
 *
 * Ở chế độ CRF, bộ mã hoá giữ chất lượng không đổi và để bitrate trôi theo nội
 * dung, nên bitrate thu được tỉ lệ thuận với độ phức tạp. Đây là cách đo thẳng
 * thứ mình quan tâm, thay vì đoán qua thể loại video — một cảnh quay tĩnh trong
 * phim hành động vẫn là cảnh tĩnh.
 *
 * Bỏ qua 30 giây đầu vì nhiều video mở đầu bằng logo hoặc màn đen, vốn không
 * đại diện cho phần còn lại.
 */
function probeComplexity(file) {
  const tmp = path.join(os.tmpdir(), `qoe-probe-${process.pid}-${Date.now()}.mp4`);
  try {
    const enc = spawnSync('ffmpeg', [
      '-hide_banner', '-loglevel', 'error',
      '-ss', '30', '-i', file, '-t', '60',
      '-c:v', 'libx264', '-crf', '23', '-preset', 'fast',
      '-an', '-y', tmp,
    ]);
    if (enc.status !== 0) return null;

    const pr = spawnSync('ffprobe', [
      '-v', 'error', '-show_entries', 'format=bit_rate',
      '-of', 'csv=p=0', tmp,
    ], { encoding: 'utf8' });
    if (pr.status !== 0) return null;

    const bps = Number(String(pr.stdout).trim());
    return Number.isFinite(bps) ? bps : null;
  } finally {
    try { fs.unlinkSync(tmp); } catch { /* tệp tạm */ }
  }
}

function runProbe(files) {
  if (files.length === 0) {
    console.error('Cần ít nhất một tệp. Ví dụ: compare.js probe samples/*.mp4');
    process.exit(1);
  }

  console.log('Đo độ phức tạp ở CRF 23, 60 giây kể từ giây thứ 30.\n');
  const rows = [];
  for (const f of files) {
    process.stdout.write(`  ${path.basename(f).slice(0, 44).padEnd(46)}`);
    const bps = probeComplexity(f);
    if (bps === null) {
      console.log('không đo được');
      continue;
    }
    console.log(`${(bps / 1000).toFixed(0).padStart(6)} kbit/s`);
    rows.push({ file: f, kbps: bps / 1000 });
  }

  if (rows.length < 2) return;

  const lo = Math.min(...rows.map((r) => r.kbps));
  const hi = Math.max(...rows.map((r) => r.kbps));
  const spread = hi / lo;

  console.log('');
  console.log(`  Chênh lệch cao nhất so với thấp nhất: ${spread.toFixed(1)} lần`);
  if (spread < 2) {
    // Ba video khác nội dung nhưng cùng độ phức tạp thì phép đo sẽ ra ba kết
    // quả giống nhau, và điều đó không gỡ được hạn chế "một mẫu duy nhất" —
    // nó chỉ chứng minh cùng một mẫu ba lần.
    console.log('  ⚠️  Dưới 2 lần: các nguồn này quá giống nhau về độ phức tạp.');
    console.log('     Cần thêm một nguồn tĩnh hơn hoặc một nguồn nhiều chuyển động hơn.');
  } else {
    console.log('  ✅ Đủ tách biệt để so sánh.');
  }
}

/** Đường dẫn tệp kết quả của một cặp video × hồ sơ. */
const outPath = (label, profile) =>
  path.join(RESULTS, `qoe-playback-${label}-${profile}.json`);

function runMatrix(manifestPath, force) {
  const videos = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const total = videos.length * PROFILES.length;
  const minutes = Math.round((total * (WARMUPS + RUNS) * DURATION) / 60);

  console.log('════════════════════════════════════════════════');
  console.log('  SO SÁNH QoE TRÊN NHIỀU VIDEO NGUỒN');
  console.log('════════════════════════════════════════════════');
  console.log(`  Video      : ${videos.length}`);
  console.log(`  Hồ sơ mạng : ${PROFILES.join(', ')}`);
  console.log(`  Mỗi cặp    : ${WARMUPS} lượt khởi động + ${RUNS} lượt đo × ${DURATION}s`);
  console.log(`  Ước tính   : khoảng ${minutes} phút`);
  console.log('');
  console.log('  ⚠️  Đừng dùng máy làm việc khác trong lúc đo. CPU bận sẽ làm');
  console.log('     video giật, và bộ đo ghi nhận đúng như một lần nghẽn — không');
  console.log('     có cách nào phân biệt với nghẽn do mạng trong số liệu cuối.');
  console.log('');

  // Chạy hết các hồ sơ của MỘT video rồi mới sang video kế tiếp. Nhờ vậy ba hồ
  // sơ của mỗi video chịu cùng một thứ tự, nên khi so sánh giữa các video thì
  // ảnh hưởng của thứ tự bị triệt tiêu thay vì trộn vào kết quả.
  for (const v of videos) {
    for (const profile of PROFILES) {
      const out = outPath(v.label, profile);

      // Bỏ qua cặp đã có kết quả. Cả lượt chạy kéo dài hàng giờ; đứt giữa chừng
      // mà phải làm lại từ đầu thì rất dễ dẫn tới việc cắt bớt số lượt đo.
      if (!force && fs.existsSync(out)) {
        console.log(`⏭  ${v.label} / ${profile} — đã có kết quả, bỏ qua`);
        continue;
      }

      console.log(`▶  ${v.label} / ${profile}`);
      const r = spawnSync('node', [
        path.join(HERE, 'collect.js'),
        '--url', v.url,
        '--profile', profile,
        '--runs', String(RUNS),
        '--duration', String(DURATION),
        '--warmups', String(WARMUPS),
        '--out', out,
      ], { stdio: 'inherit' });

      if (r.status !== 0) {
        console.error(`❌ ${v.label} / ${profile} thất bại. Dừng lại.`);
        console.error('   Các cặp đã đo xong vẫn giữ nguyên; chạy lại sẽ bỏ qua chúng.');
        process.exit(1);
      }
    }
  }

  summarise(videos);
}

function summarise(videos) {
  const pct = (v) => (v === null || v === undefined ? 'n/a' : (v * 100).toFixed(2) + '%');
  const data = {};

  for (const v of videos) {
    data[v.label] = {};
    for (const profile of PROFILES) {
      const p = outPath(v.label, profile);
      if (!fs.existsSync(p)) continue;
      data[v.label][profile] = JSON.parse(fs.readFileSync(p, 'utf8'));
    }
  }

  for (const profile of PROFILES) {
    console.log('');
    console.log(`──────── ${profile} ────────`);
    console.log('  video          nghẽn TB   lớn nhất  lượt nghẽn  chờ TV   đổi mức  bitrate');
    for (const v of videos) {
      const d = data[v.label][profile];
      if (!d) { console.log(`  ${v.label.padEnd(14)} (thiếu)`); continue; }
      const a = d.aggregate;
      console.log(
        `  ${v.label.padEnd(14)}` +
        `${pct(a.rebufferingRatioMean).padStart(9)}` +
        `${pct(a.rebufferingRatioMax).padStart(10)}` +
        `${(a.runsWithStalls + '/' + a.runs).padStart(12)}` +
        `${(a.startupDelaySec ?? 0).toFixed(2).padStart(9)}s` +
        `${String(a.bitrateSwitchCount ?? 'n/a').padStart(9)}` +
        `${(a.averageBitrateBps ? (a.averageBitrateBps / 1000).toFixed(0) : 'n/a').padStart(9)}`
      );
    }
  }

  // Bậc thang đo được của từng video. Đây là chỗ độ phức tạp hiện ra rõ nhất:
  // nội dung càng phức tạp thì bitrate thật càng bám sát hoặc vượt mức khai báo.
  console.log('');
  console.log('──────── Bậc thang đo được, kbit/s ────────');
  console.log('  video          bậc     khai   đỉnh đo   đỉnh/khai');
  for (const v of videos) {
    const d = data[v.label][PROFILES[0]];
    if (!d || !d.bitrateLadder) continue;
    for (const rung of d.bitrateLadder) {
      const kb = (x) => (x ? (x / 1000).toFixed(0) : 'n/a');
      console.log(
        `  ${v.label.padEnd(14)}${(rung.height + 'p').padEnd(8)}` +
        `${kb(rung.advertised).padStart(6)}${kb(rung.peak).padStart(10)}` +
        `${(rung.peakRatio ? (rung.peakRatio * 100).toFixed(0) + '%' : '—').padStart(12)}`
      );
    }
  }

  const outFile = path.join(RESULTS, 'qoe-comparison.json');
  fs.writeFileSync(outFile, JSON.stringify({
    comparedAt: new Date().toISOString(),
    profiles: PROFILES,
    runs: RUNS,
    durationSec: DURATION,
    warmups: WARMUPS,
    note:
      'Mỗi video chạy đủ ba hồ sơ theo cùng một thứ tự, nên ảnh hưởng của thứ ' +
      'tự chạy bị triệt tiêu khi so sánh GIỮA các video. Nó vẫn còn khi so ' +
      'sánh giữa các hồ sơ của cùng một video, giống như phép đo một nguồn.',
    videos: videos.map((v) => ({
      label: v.label,
      url: v.url,
      profiles: Object.fromEntries(
        PROFILES.filter((p) => data[v.label][p]).map((p) => [p, data[v.label][p].aggregate])
      ),
    })),
  }, null, 2), 'utf-8');

  console.log('');
  console.log(`💾 Đã ghi bảng so sánh: ${outFile}`);
}

const [mode, ...rest] = process.argv.slice(2);

if (mode === 'probe') {
  runProbe(rest.filter((a) => !a.startsWith('--')));
} else if (mode === 'run') {
  const i = rest.indexOf('--manifest');
  if (i === -1 || !rest[i + 1]) {
    console.error('Cần --manifest <đường dẫn>');
    process.exit(1);
  }
  runMatrix(rest[i + 1], rest.includes('--force'));
} else {
  console.error('Dùng: compare.js probe <tệp...>  |  compare.js run --manifest <tệp> [--force]');
  process.exit(1);
}
