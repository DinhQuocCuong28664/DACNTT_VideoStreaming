/**
 * ═══════════════════════════════════════════════════
 * Đo trải nghiệm xem video — Quality of Experience (QoE)
 *
 * Chỉ số đo: Time-to-First-Frame (TTFF) — khoảng thời gian từ lúc trình phát
 * bắt đầu tải tệp manifest cho tới khi segment đầu tiên được tải xong, tức là
 * thời điểm sớm nhất mà khung hình đầu tiên có thể hiển thị.
 *
 * Phép đo được lặp lại nhiều lần để tính trung bình, trung vị và phân vị 95.
 * Một lần đo đơn lẻ không có giá trị thống kê vì độ trễ mạng dao động mạnh, và
 * lần tải đầu tiên thường là cache miss tại Edge Location nên chậm bất thường.
 *
 * Kết quả được ghi ra docs/results/qoe-ttff.json để đưa vào báo cáo.
 * Script không dùng thư viện ngoài (Node.js 18+ có sẵn fetch).
 * ═══════════════════════════════════════════════════
 *
 * Cách dùng:
 *   node scripts/benchmark-qoe.js <master.m3u8 URL> [số lần lặp]
 */

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

const DEFAULT_ITERATIONS = 10;
const RESULTS_DIR = path.join(__dirname, '..', 'docs', 'results');

/**
 * Đo một lần TTFF: tải master playlist → sub-playlist → segment đầu tiên.
 * Trả về thời gian của từng chặng để có thể phân tích chặng nào tốn kém nhất.
 */
async function measureOnce(masterPlaylistUrl) {
  const t0 = performance.now();

  const masterRes = await fetch(masterPlaylistUrl);
  if (!masterRes.ok) {
    throw new Error(`Master playlist: HTTP ${masterRes.status} ${masterRes.statusText}`);
  }
  const masterText = await masterRes.text();
  const tMaster = performance.now();

  const playlistLine = masterText
    .split('\n')
    .find((line) => line.trim().endsWith('.m3u8'));

  if (!playlistLine) {
    throw new Error('Không tìm thấy sub-playlist trong master playlist');
  }

  const baseUrl = masterPlaylistUrl.substring(0, masterPlaylistUrl.lastIndexOf('/') + 1);
  const subPlaylistUrl = baseUrl + playlistLine.trim();

  const subRes = await fetch(subPlaylistUrl);
  if (!subRes.ok) {
    throw new Error(`Sub-playlist: HTTP ${subRes.status} ${subRes.statusText}`);
  }
  const subText = await subRes.text();
  const tSub = performance.now();

  const firstSegment = subText.split('\n').find((line) => line.trim().endsWith('.ts'));
  if (!firstSegment) {
    throw new Error('Không tìm thấy segment .ts trong sub-playlist');
  }

  const subBaseUrl = subPlaylistUrl.substring(0, subPlaylistUrl.lastIndexOf('/') + 1);
  const segmentUrl = subBaseUrl + firstSegment.trim();

  const segRes = await fetch(segmentUrl);
  if (!segRes.ok) {
    throw new Error(`Segment: HTTP ${segRes.status} ${segRes.statusText}`);
  }
  const segmentBuffer = await segRes.arrayBuffer();
  const tSegment = performance.now();

  return {
    masterMs: tMaster - t0,
    subPlaylistMs: tSub - tMaster,
    segmentMs: tSegment - tSub,
    totalTtffMs: tSegment - t0,
    segmentBytes: segmentBuffer.byteLength,
    // Cho biết nội dung được phục vụ từ Edge hay phải lấy từ origin —
    // yếu tố ảnh hưởng lớn nhất tới độ trễ đo được.
    cacheStatus: segRes.headers.get('x-cache') || 'unknown',
  };
}

/** Tính các đại lượng thống kê mô tả từ một mảng số */
function summarize(values) {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const percentile = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

  return {
    count: sorted.length,
    minMs: Number(sorted[0].toFixed(2)),
    maxMs: Number(sorted[sorted.length - 1].toFixed(2)),
    meanMs: Number((sum / sorted.length).toFixed(2)),
    medianMs: Number(percentile(50).toFixed(2)),
    p95Ms: Number(percentile(95).toFixed(2)),
  };
}

async function runBenchmark(masterPlaylistUrl, iterations) {
  console.log('═══════════════════════════════════════════════════');
  console.log('  ĐO TIME-TO-FIRST-FRAME (TTFF)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`  Nguồn   : ${masterPlaylistUrl}`);
  console.log(`  Số lần  : ${iterations}`);
  console.log('');

  const samples = [];
  const errors = [];

  for (let i = 1; i <= iterations; i += 1) {
    try {
      const sample = await measureOnce(masterPlaylistUrl);
      samples.push(sample);
      console.log(
        `  Lần ${String(i).padStart(2)}: TTFF = ${sample.totalTtffMs.toFixed(2)} ms  ` +
          `(manifest ${sample.masterMs.toFixed(0)} + playlist ${sample.subPlaylistMs.toFixed(0)} ` +
          `+ segment ${sample.segmentMs.toFixed(0)}) [${sample.cacheStatus}]`
      );
    } catch (err) {
      errors.push({ iteration: i, message: err.message });
      console.error(`  Lần ${String(i).padStart(2)}: THẤT BẠI — ${err.message}`);
    }
  }

  if (samples.length === 0) {
    console.error('\n❌ Không thu được mẫu hợp lệ nào. Kiểm tra lại URL và quyền truy cập.');
    process.exitCode = 1;
    return null;
  }

  const result = {
    measuredAt: new Date().toISOString(),
    source: masterPlaylistUrl,
    iterations,
    successfulSamples: samples.length,
    failedSamples: errors.length,
    ttff: summarize(samples.map((s) => s.totalTtffMs)),
    breakdown: {
      masterPlaylist: summarize(samples.map((s) => s.masterMs)),
      subPlaylist: summarize(samples.map((s) => s.subPlaylistMs)),
      firstSegment: summarize(samples.map((s) => s.segmentMs)),
    },
    firstSegmentBytes: samples[0].segmentBytes,
    cacheStatuses: samples.reduce((acc, s) => {
      acc[s.cacheStatus] = (acc[s.cacheStatus] || 0) + 1;
      return acc;
    }, {}),
    errors,
    samples: samples.map((s) => ({
      totalTtffMs: Number(s.totalTtffMs.toFixed(2)),
      cacheStatus: s.cacheStatus,
    })),
  };

  console.log('\n───────────────────────────────────────────────────');
  console.log('  KẾT QUẢ TỔNG HỢP');
  console.log('───────────────────────────────────────────────────');
  console.log(`  Trung bình : ${result.ttff.meanMs} ms`);
  console.log(`  Trung vị   : ${result.ttff.medianMs} ms`);
  console.log(`  Phân vị 95 : ${result.ttff.p95Ms} ms`);
  console.log(`  Nhỏ nhất   : ${result.ttff.minMs} ms`);
  console.log(`  Lớn nhất   : ${result.ttff.maxMs} ms`);
  console.log(`  Cache      : ${JSON.stringify(result.cacheStatuses)}`);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const outputPath = path.join(RESULTS_DIR, 'qoe-ttff.json');
  fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`\n✅ Đã ghi kết quả vào ${path.relative(process.cwd(), outputPath)}`);

  return result;
}

if (require.main === module) {
  const masterUrl = process.argv[2];
  const iterations = Number(process.argv[3]) || DEFAULT_ITERATIONS;

  if (!masterUrl) {
    console.error('Thiếu tham số bắt buộc.\n');
    console.error('Cách dùng: node scripts/benchmark-qoe.js <master.m3u8 URL> [số lần lặp]');
    console.error('Ví dụ   : node scripts/benchmark-qoe.js https://cdn.zelostech.site/videos/u1/v1/master.m3u8 20');
    process.exit(1);
  }

  runBenchmark(masterUrl, iterations);
}

module.exports = { measureOnce, summarize, runBenchmark };
