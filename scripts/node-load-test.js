/**
 * ═══════════════════════════════════════════════════
 * Node.js Native Stress Test Script — Concurrent Video Upload Simulator
 * Zero external binary dependencies (runs on Node.js 18+ native fetch).
 * Simulates 50 to 100 concurrent virtual users initiating uploads,
 * uploading S3 payloads, and confirming uploads.
 *
 * Usage:
 *   node scripts/node-load-test.js [CONCURRENCY_LEVEL] [TOTAL_REQUESTS] [--allow-dummy]
 *   Example: $env:JWT_TOKEN="ey..."; node scripts/node-load-test.js 50 100
 * ═══════════════════════════════════════════════════
 */

const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:5000/api';
const JWT_TOKEN = process.env.JWT_TOKEN || 'dummy-jwt-token';
const ALLOW_DUMMY = process.argv.includes('--allow-dummy');

// Robust CLI argument parsing supporting 0
const parseArg = (val, defaultVal) => {
  const num = parseInt(val, 10);
  return Number.isFinite(num) && num >= 0 ? num : defaultVal;
};

const CONCURRENCY = parseArg(process.argv[2], 50);
const TOTAL_REQUESTS = parseArg(process.argv[3], 100);

async function simulateUserUpload(userIdx) {
  const startTime = performance.now();

  try {
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${JWT_TOKEN}`,
    };

    // 1. Initiate Upload API
    const initRes = await fetch(`${API_URL}/videos/initiate-upload`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        title: `Stress Test Video #${userIdx}-${Date.now()}`,
        description: 'Node.js Native Load Test Simulation',
        category: 'Công nghệ',
        filename: `load_test_${userIdx}.mp4`,
        mimetype: 'video/mp4',
        fileSize: 5242880, // 5 MB
        tags: ['node-load-test', 'benchmark'],
        visibility: 'public',
      }),
    });

    if (!initRes.ok) {
      throw new Error(`initiateUpload failed: HTTP ${initRes.status}`);
    }

    const initData = await initRes.json();
    const { video, uploadUrl } = initData.data;

    // 2. Upload Dummy Video Payload to S3 Pre-signed URL
    const dummyPayload = 'MOCK_VIDEO_BINARY_DATA_' + 'X'.repeat(1024 * 5); // 5KB chunk
    const s3Res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'video/mp4' },
      body: dummyPayload,
    });

    if (!s3Res.ok) {
      throw new Error(`S3 direct upload failed: HTTP ${s3Res.status}`);
    }

    // 3. Confirm Upload API
    const confirmRes = await fetch(`${API_URL}/videos/${video._id}/confirm-upload`, {
      method: 'PATCH',
      headers,
    });

    if (!confirmRes.ok) {
      throw new Error(`confirmUpload failed: HTTP ${confirmRes.status}`);
    }

    const endTime = performance.now();
    return { success: true, duration: endTime - startTime, videoId: video._id };
  } catch (err) {
    const endTime = performance.now();
    return { success: false, duration: endTime - startTime, error: err.message };
  }
}

async function runLoadTest() {
  if (TOTAL_REQUESTS === 0) {
    console.log(`ℹ️ TOTAL_REQUESTS set to 0. No requests executed.`);
    return;
  }

  // Fail fast if JWT_TOKEN is missing or dummy
  if ((!JWT_TOKEN || JWT_TOKEN === 'dummy-jwt-token') && !ALLOW_DUMMY) {
    console.error(`
❌ ERR_MISSING_JWT_TOKEN: Real load test requires a valid JWT Authorization token!
-----------------------------------------------------------------------------------
To run a real load test against backend:
  1. Obtain a valid JWT Token (via POST /api/auth/login or Web UI).
  2. Set environment variable:
     Windows PowerShell : $env:JWT_TOKEN="your_token_here"
     Linux / macOS      : export JWT_TOKEN="your_token_here"
  3. Re-run: node scripts/node-load-test.js ${CONCURRENCY} ${TOTAL_REQUESTS}

(To run dry-run testing with dummy token, append --allow-dummy flag)
-----------------------------------------------------------------------------------
`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n🚀 Starting Node.js Stress Test Benchmark`);
  console.log(`  └─ Target API: ${API_URL}`);
  console.log(`  └─ Concurrency Level: ${CONCURRENCY} parallel workers`);
  console.log(`  └─ Total Simulated Uploads: ${TOTAL_REQUESTS}`);
  console.log(`---------------------------------------------------\n`);

  const globalStartTime = performance.now();
  const results = [];

  for (let i = 0; i < TOTAL_REQUESTS; i += CONCURRENCY) {
    const batch = [];
    const batchSize = Math.min(CONCURRENCY, TOTAL_REQUESTS - i);

    for (let j = 0; j < batchSize; j++) {
      batch.push(simulateUserUpload(i + j + 1));
    }

    const batchResults = await Promise.all(batch);
    results.push(...batchResults);

    const bSuccess = batchResults.filter((r) => r.success).length;
    const bFailed = batchResults.filter((r) => !r.success).length;
    console.log(`  └─ Batch ${i + 1}..${i + batchSize} finished (${bSuccess} success, ${bFailed} failed)`);
  }

  const globalEndTime = performance.now();
  const totalDurationSec = (globalEndTime - globalStartTime) / 1000;

  const successful = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);
  const durations = successful.map((r) => r.duration);

  const avgDuration = durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : 0;
  // Sao chép trước khi sắp xếp: `sort` biến đổi mảng gốc, nếu tính trung bình
  // sau bước này thì thứ tự đã bị thay đổi và dễ gây nhầm lẫn khi mở rộng script.
  const sortedDurations = [...durations].sort((a, b) => a - b);
  const p95Duration = sortedDurations.length
    ? sortedDurations[Math.min(sortedDurations.length - 1, Math.floor(sortedDurations.length * 0.95))]
    : 0;
  const medianDuration = sortedDurations.length
    ? sortedDurations[Math.floor(sortedDurations.length * 0.5)]
    : 0;
  const rps = totalDurationSec > 0 ? (TOTAL_REQUESTS / totalDurationSec).toFixed(2) : 0;

  const successRate = ((successful.length / TOTAL_REQUESTS) * 100).toFixed(1);

  console.log(`
===================================================================================
                       STRESS TEST RESULTS BENCHMARK REPORT
===================================================================================
 Total Upload Requests : ${TOTAL_REQUESTS}
 Successful Uploads    : ${successful.length} (${successRate}%)
 Failed Uploads        : ${failed.length} (${((failed.length / TOTAL_REQUESTS) * 100).toFixed(1)}%)
 Total Test Duration   : ${totalDurationSec.toFixed(2)} seconds
 Throughput (RPS)      : ${rps} requests/sec
 Average Response Time : ${avgDuration.toFixed(2)} ms
 95th Percentile (p95) : ${p95Duration.toFixed(2)} ms
===================================================================================
`);

  // Ghi kết quả ra tệp để đưa vào báo cáo thay vì chỉ hiển thị trên màn hình
  const report = {
    measuredAt: new Date().toISOString(),
    target: API_URL,
    concurrency: CONCURRENCY,
    totalRequests: TOTAL_REQUESTS,
    successfulRequests: successful.length,
    failedRequests: failed.length,
    successRatePercent: Number(successRate),
    totalDurationSec: Number(totalDurationSec.toFixed(2)),
    throughputRps: Number(rps),
    latencyMs: {
      meanMs: Number(avgDuration.toFixed(2)),
      medianMs: Number(medianDuration.toFixed(2)),
      p95Ms: Number(p95Duration.toFixed(2)),
      minMs: sortedDurations.length ? Number(sortedDurations[0].toFixed(2)) : 0,
      maxMs: sortedDurations.length
        ? Number(sortedDurations[sortedDurations.length - 1].toFixed(2))
        : 0,
    },
    // Gom nhóm lỗi theo nội dung để thấy ngay nguyên nhân thất bại phổ biến nhất
    errorSummary: failed.reduce((acc, r) => {
      const key = r.error || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {}),
  };

  const resultsDir = path.join(__dirname, '..', 'docs', 'results');
  fs.mkdirSync(resultsDir, { recursive: true });
  const outputPath = path.join(resultsDir, 'node-load-test.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`✅ Đã ghi kết quả vào ${path.relative(process.cwd(), outputPath)}\n`);

  // Set exit code 1 if any requests failed
  if (failed.length > 0) {
    console.warn(`⚠️ Stress test completed with failures. Setting process.exitCode = 1`);
    process.exitCode = 1;
  } else {
    console.log(`✅ Stress test completed with 100% success rate!`);
  }
}

if (require.main === module) {
  runLoadTest();
}
