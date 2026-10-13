#!/usr/bin/env node
/**
 * Chặng S0 của đợt đo: Batch có tràn từ môi trường Fargate Spot sang Fargate On-Demand không?
 *
 * Tài liệu AWS mô tả thứ tự môi trường tính toán trong hàng đợi nhưng đợt đo cần chắc điều đó với
 * Fargate (hai môi trường cùng loại job, cùng hàng đợi). Script nộp một array job `sleep` (1 vCPU mỗi
 * phần tử) lớn hơn quota của môi trường Spot, rồi đếm:
 *
 *   - có đủ `--children` phần tử RUNNING cùng lúc không (Spot đầy thì phần còn lại phải sang On-Demand);
 *   - mỗi phần tử chạy ở môi trường nào (theo cụm ECS trong taskArn).
 *
 * Không tải video, không gọi Rekognition: chi phí ước tính vài cent (xem docs/results/README.md).
 *
 * Dùng:
 *   node scripts/bench/s0-spillover.js [--prefix dacntt-staging] [--children 16] [--sleep 240] [--write]
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
const WAIT_MINUTES = Number(flag('wait', 10));
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

const clusterOf = (taskArn) => (taskArn || '').split('/')[1] || null;

/** Tên cụm ECS của từng môi trường tính toán: một môi trường Batch có một cụm riêng. */
const clusterByEnvironment = () => {
  const { computeEnvironments } = aws('batch', 'describe-compute-environments', '--compute-environments', SPOT_CE, ONDEMAND_CE);
  const map = new Map();
  // clusterArn có dạng arn:...:cluster/<tên>, taskArn dạng arn:...:task/<tên cụm>/<id>: cả hai lấy phần sau dấu "/" đầu tiên.
  for (const ce of computeEnvironments) map.set(clusterOf(ce.ecsClusterArn), ce.computeEnvironmentName);
  if (!computeEnvironments.some((ce) => ce.computeEnvironmentName === ONDEMAND_CE)) {
    throw new Error(`Không thấy ${ONDEMAND_CE}: apply staging với -var ondemand_max_vcpus=8 trước.`);
  }
  return map;
};

const main = async () => {
  if (has('dry-run')) {
    console.log(`[dry-run] nộp array ${CHILDREN} phần tử x ${SLEEP_SECONDS}s vào ${QUEUE} (job definition ${JOB_DEFINITION}), chờ tối đa ${WAIT_MINUTES} phút`);
    console.log(`[dry-run] kỳ vọng: ${Math.min(CHILDREN, 8)} phần tử ở ${SPOT_CE} và ${Math.max(0, CHILDREN - 8)} ở ${ONDEMAND_CE}`);
    return;
  }

  const clusters = clusterByEnvironment();
  const command = JSON.stringify({ command: ['node', '-e', `setTimeout(() => process.exit(0), ${SLEEP_SECONDS * 1000})`] });
  const submitted = aws(
    'batch', 'submit-job', '--job-name', 's0-spillover', '--job-queue', QUEUE, '--job-definition', JOB_DEFINITION,
    '--container-overrides', command, '--array-properties', `size=${CHILDREN}`
  );
  const arrayId = submitted.jobId;
  const t0 = Date.now();
  console.log(`Đã nộp array ${arrayId}: ${CHILDREN} phần tử x ${SLEEP_SECONDS}s`);

  let peak = 0;
  let timeToPeak = 0;
  let reachedAt = null;
  const deadline = t0 + WAIT_MINUTES * 60 * 1000;
  try {
    while (Date.now() < deadline) {
      await sleep(10000);
      const summary = aws('batch', 'describe-jobs', '--jobs', arrayId).jobs[0].arrayProperties.statusSummary;
      const running = summary.RUNNING || 0;
      if (running > peak) {
        peak = running;
        timeToPeak = Math.round((Date.now() - t0) / 1000);
      }
      process.stdout.write(`  RUNNING ${running}/${CHILDREN}, đỉnh ${peak}\r`);
      if (running >= CHILDREN) {
        reachedAt = Math.round((Date.now() - t0) / 1000);
        break;
      }
    }

    // Đếm theo môi trường ngay khi đạt đỉnh (các phần tử còn đang sleep).
    const children = aws('batch', 'list-jobs', '--array-job-id', arrayId, '--job-status', 'RUNNING').jobSummaryList;
    const perEnvironment = {};
    for (let i = 0; i < children.length; i += 100) {
      const ids = children.slice(i, i + 100).map((c) => c.jobId);
      for (const job of aws('batch', 'describe-jobs', '--jobs', ...ids).jobs) {
        const ce = clusters.get(clusterOf(job.container && job.container.taskArn)) || 'unknown';
        perEnvironment[ce] = (perEnvironment[ce] || 0) + 1;
      }
    }

    const spillover = (perEnvironment[ONDEMAND_CE] || 0) > 0 && peak >= CHILDREN;
    console.log('\n── Kết quả S0 ──────────────────────────────────');
    console.log(`đỉnh RUNNING: ${peak}/${CHILDREN} sau ${timeToPeak}s; đủ ${CHILDREN} phần tử: ${reachedAt !== null ? `có, sau ${reachedAt}s` : 'không'}`);
    console.log(`theo môi trường: ${JSON.stringify(perEnvironment)}`);
    console.log(spillover ? 'KẾT LUẬN: Batch tràn từ Spot sang On-Demand.' : 'KẾT LUẬN: KHÔNG thấy tràn; đo ở 8 vCPU và bỏ On-Demand khỏi kế hoạch.');

    if (has('write')) {
      const date = new Date().toISOString().slice(0, 10);
      const file = path.join(__dirname, '..', '..', 'docs', 'results', 'runs', `${date}-s0-spillover.json`);
      const record = {
        schema: 1,
        title: 'S0: kiểm tra Batch tràn từ Fargate Spot sang Fargate On-Demand',
        runs: [{
          id: `${date}-${PREFIX.replace('dacntt-', '')}-s0-spillover`,
          date,
          account: 'B',
          region: REGION,
          environment: PREFIX.replace('dacntt-', ''),
          path: 'probe',
          capacity: { spot_max_vcpus: 8, ondemand_max_vcpus: 8 },
          chunk: null,
          video: { label: `sleep-${SLEEP_SECONDS}s-array-${CHILDREN}`, duration_s: null, size_gib: null, resolution: null, fps: null },
          concurrency: 1,
          measured_from: 'probe_submitted',
          timings_s: { time_to_peak_running: timeToPeak, time_to_all_running: reachedAt },
          result: { final_status: null, hls_verified: false, peak_running: peak, children: CHILDREN, per_environment: perEnvironment, spillover },
          provenance: 'measured',
          source: 'scripts/bench/s0-spillover.js',
          notes: 'Job sleep 1 vCPU mỗi phần tử; quota Spot 8 nên phần vượt 8 chỉ chạy được nếu Batch tràn sang môi trường On-Demand.',
        }],
      };
      fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`, 'utf-8');
      console.log(`Đã ghi ${path.relative(process.cwd(), file)}`);
    }
  } finally {
    try {
      aws('batch', 'terminate-job', '--job-id', arrayId, '--reason', 'S0 finished');
      console.log('Đã huỷ array job.');
    } catch (error) {
      console.warn(`Không huỷ được ${arrayId}: ${error.message}`);
    }
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
