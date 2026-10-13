#!/usr/bin/env node
/**
 * Chặng S0 của đợt đo: Batch có tràn từ môi trường Fargate Spot sang Fargate On-Demand không?
 *
 * Tài liệu AWS mô tả thứ tự môi trường tính toán trong hàng đợi nhưng đợt đo cần chắc điều đó với
 * Fargate (hai môi trường cùng loại job, cùng hàng đợi). Script nộp một array job `sleep` (1 vCPU mỗi
 * phần tử) lớn hơn quota của môi trường Spot, chờ chúng chạy xong rồi dựng lại từ mốc thời gian của
 * từng job:
 *
 *   - số phần tử chạy cùng lúc tại đỉnh (so với quota Spot `--spot-vcpus`);
 *   - mỗi phần tử chạy ở môi trường nào (theo cụm ECS trong taskArn).
 *
 * Dựng từ mốc thời gian thay vì đếm RUNNING khi thăm dò: trạng thái RUNNING của Batch có độ trễ nên
 * việc thăm dò mỗi 10 giây có thể không bao giờ thấy đủ số phần tử cùng lúc dù chúng đã chạy chồng nhau.
 *
 * Không tải video, không gọi Rekognition: dưới 2 vCPU-giờ, vài cent.
 *
 * Dùng:
 *   node scripts/bench/s0-spillover.js [--prefix dacntt-staging] [--children 16] [--sleep 240] [--spot-vcpus 8] [--write]
 *   node scripts/bench/s0-spillover.js --dry-run
 *
 * Điều kiện: staging đã apply `ondemand_max_vcpus=8` (môi trường `<prefix>-fargate-od-ce` tồn tại)
 * và production đang nghỉ (dùng chung quota Fargate).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const PREFIX = flag('prefix', 'dacntt-staging');
const REGION = flag('region', 'ap-southeast-1');
const CHILDREN = Number(flag('children', 16));
const SLEEP_SECONDS = Number(flag('sleep', 240));
const SPOT_VCPUS = Number(flag('spot-vcpus', 8));
const WAIT_MINUTES = Number(flag('wait', 12));
const QUEUE = `${PREFIX}-transcode-queue`;
const JOB_DEFINITION = `${PREFIX}-transcoder-job`;
const SPOT_CE = `${PREFIX}-fargate-ce`;
const ONDEMAND_CE = `${PREFIX}-fargate-od-ce`;

const aws = (...cliArgs) => {
  const r = spawnSync('aws', [...cliArgs, '--region', REGION, '--output', 'json'], { encoding: 'utf-8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`aws ${cliArgs.slice(0, 2).join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** arn:...:cluster/<tên> và arn:...:task/<tên cụm>/<id>: cả hai lấy phần sau dấu "/" đầu tiên. */
const clusterOf = (arn) => (arn || '').split('/')[1] || null;

/** Tên cụm ECS của từng môi trường tính toán: mỗi môi trường Batch có một cụm riêng. */
const clusterByEnvironment = () => {
  const { computeEnvironments } = aws('batch', 'describe-compute-environments', '--compute-environments', SPOT_CE, ONDEMAND_CE);
  if (!computeEnvironments.some((ce) => ce.computeEnvironmentName === ONDEMAND_CE)) {
    throw new Error(`Không thấy ${ONDEMAND_CE}: apply staging với -var ondemand_max_vcpus=8 trước.`);
  }
  return new Map(computeEnvironments.map((ce) => [clusterOf(ce.ecsClusterArn), ce.computeEnvironmentName]));
};

/**
 * Dựng lại độ chạy chồng nhau của các phần tử từ startedAt/stoppedAt.
 * @returns {{peak: number, peakAt: number, perEnvironment: object, perEnvironmentAtPeak: object, firstStart: number, lastStart: number, started: number}}
 */
const analyse = (arrayId, clusters) => {
  const t0 = aws('batch', 'describe-jobs', '--jobs', arrayId).jobs[0].createdAt;
  const ids = [];
  for (const status of ['SUCCEEDED', 'FAILED', 'RUNNING']) {
    ids.push(...aws('batch', 'list-jobs', '--array-job-id', arrayId, '--job-status', status).jobSummaryList.map((j) => j.jobId));
  }
  const rows = [];
  for (let i = 0; i < ids.length; i += 100) {
    for (const job of aws('batch', 'describe-jobs', '--jobs', ...ids.slice(i, i + 100)).jobs) {
      if (!job.startedAt) continue;
      rows.push({
        env: clusters.get(clusterOf(job.container && job.container.taskArn)) || 'unknown',
        start: (job.startedAt - t0) / 1000,
        stop: ((job.stoppedAt || Date.now()) - t0) / 1000,
      });
    }
  }
  if (rows.length === 0) throw new Error('Không phần tử nào đã bắt đầu.');

  const edges = rows.flatMap((r) => [[r.start, 1], [r.stop, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let current = 0;
  let peak = 0;
  let peakAt = 0;
  for (const [t, delta] of edges) {
    current += delta;
    if (current > peak) {
      peak = current;
      peakAt = t;
    }
  }

  const count = (list) => list.reduce((acc, r) => ({ ...acc, [r.env]: (acc[r.env] || 0) + 1 }), {});
  return {
    peak,
    peakAt: Math.round(peakAt),
    perEnvironment: count(rows),
    perEnvironmentAtPeak: count(rows.filter((r) => r.start <= peakAt && peakAt < r.stop)),
    firstStart: Math.round(Math.min(...rows.map((r) => r.start))),
    lastStart: Math.round(Math.max(...rows.map((r) => r.start))),
    started: rows.length,
  };
};

const main = async () => {
  if (has('dry-run')) {
    console.log(`[dry-run] nộp array ${CHILDREN} phần tử x ${SLEEP_SECONDS}s vào ${QUEUE} (job definition ${JOB_DEFINITION}), chờ tối đa ${WAIT_MINUTES} phút`);
    console.log(`[dry-run] kỳ vọng: ${Math.min(CHILDREN, SPOT_VCPUS)} phần tử ở ${SPOT_CE} và ${Math.max(0, CHILDREN - SPOT_VCPUS)} ở ${ONDEMAND_CE}`);
    return;
  }

  const clusters = clusterByEnvironment();
  // --analyse <arrayJobId>: dựng lại kết quả của một array job đã chạy xong, không nộp job mới.
  const reuseId = flag('analyse', null);
  const command = JSON.stringify({ command: ['node', '-e', `setTimeout(() => process.exit(0), ${SLEEP_SECONDS * 1000})`] });
  const arrayId = reuseId || aws(
    'batch', 'submit-job', '--job-name', 's0-spillover', '--job-queue', QUEUE, '--job-definition', JOB_DEFINITION,
    '--container-overrides', command, '--array-properties', `size=${CHILDREN}`
  ).jobId;
  console.log(reuseId ? `Phân tích lại array ${arrayId}` : `Đã nộp array ${arrayId}: ${CHILDREN} phần tử x ${SLEEP_SECONDS}s`);

  const deadline = Date.now() + WAIT_MINUTES * 60 * 1000;
  let finished = Boolean(reuseId);
  try {
    while (!reuseId && Date.now() < deadline) {
      await sleep(10000);
      const summary = aws('batch', 'describe-jobs', '--jobs', arrayId).jobs[0].arrayProperties.statusSummary;
      const done = (summary.SUCCEEDED || 0) + (summary.FAILED || 0);
      process.stdout.write(`  RUNNING ${summary.RUNNING || 0}, xong ${done}/${CHILDREN}\r`);
      if (done >= CHILDREN) {
        finished = true;
        break;
      }
    }

    const result = analyse(arrayId, clusters);
    const spillover = result.peak > SPOT_VCPUS && (result.perEnvironment[ONDEMAND_CE] || 0) > 0;
    console.log('\n── Kết quả S0 ──────────────────────────────────');
    console.log(`phần tử đã chạy: ${result.started}/${CHILDREN}${finished ? '' : ' (chưa xong hết khi hết hạn chờ)'}`);
    console.log(`chạy cùng lúc tại đỉnh: ${result.peak} (quota Spot ${SPOT_VCPUS}), vào giây ${result.peakAt}; phần tử đầu +${result.firstStart}s, cuối +${result.lastStart}s`);
    console.log(`theo môi trường: ${JSON.stringify(result.perEnvironment)}; tại đỉnh: ${JSON.stringify(result.perEnvironmentAtPeak)}`);
    console.log(spillover ? 'KẾT LUẬN: Batch tràn từ Spot sang On-Demand.' : 'KẾT LUẬN: KHÔNG thấy tràn; đo ở 8 vCPU và bỏ On-Demand khỏi kế hoạch.');

    if (has('write')) {
      const date = new Date().toISOString().slice(0, 10);
      const file = path.join(__dirname, '..', '..', 'docs', 'results', 'runs', `${date}-s0-spillover.json`);
      const envName = PREFIX.replace('dacntt-', '');
      const record = {
        schema: 1,
        title: 'S0: kiểm tra Batch tràn từ Fargate Spot sang Fargate On-Demand',
        runs: [{
          id: `${date}-${envName}-s0-spillover`,
          date,
          account: 'B',
          region: REGION,
          environment: envName,
          path: 'probe',
          capacity: { spot_max_vcpus: SPOT_VCPUS, ondemand_max_vcpus: 8 },
          chunk: null,
          video: { label: `sleep-${SLEEP_SECONDS}s-array-${CHILDREN}`, duration_s: null, size_gib: null, resolution: null, fps: null },
          concurrency: 1,
          measured_from: 'array_job_created',
          timings_s: { first_child_start: result.firstStart, last_child_start: result.lastStart, peak_at: result.peakAt },
          result: {
            final_status: null,
            hls_verified: false,
            children: CHILDREN,
            peak_concurrent: result.peak,
            per_environment: result.perEnvironment,
            per_environment_at_peak: result.perEnvironmentAtPeak,
            spillover,
          },
          provenance: 'measured',
          source: 'scripts/bench/s0-spillover.js',
          notes: 'Job sleep 1 vCPU mỗi phần tử; quota Spot 8 nên phần vượt 8 chỉ chạy được nếu Batch tràn sang môi trường On-Demand. Mốc thời gian lấy từ startedAt/stoppedAt của từng job.',
        }],
      };
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
      console.log(`Đã ghi ${path.relative(process.cwd(), file)}`);
    }
  } finally {
    if (!reuseId) {
      try {
        aws('batch', 'terminate-job', '--job-id', arrayId, '--reason', 'S0 finished');
      } catch (error) {
        console.warn(`Không huỷ được ${arrayId}: ${error.message}`);
      }
    }
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
