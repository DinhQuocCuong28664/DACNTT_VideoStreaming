#!/usr/bin/env node
/**
 * Đo hành vi của hai hàng đợi Batch (chính priority 10, "bulk" priority 1) trên staging bằng job
 * `sleep` thay vì video thật: không tốn bao nhiêu mà trả lời được ba câu hỏi mà tài liệu AWS không nói.
 *
 *   1. Job vào hàng đợi chính có lấy chỗ trống TRƯỚC các phần tử còn chờ của array job ở hàng bulk không?
 *   2. Batch có ngắt job đang chạy không? (không: chờ tối đa một job chạy xong)
 *   3. Job ở hàng chính phụ thuộc array job ở hàng bulk có chờ ĐỦ mọi phần tử không?
 *
 * Cách làm: array job N phần tử vào hàng bulk để chiếm hết hạn mức vCPU; khi đã có đủ phần tử đang chạy
 * thì nộp (a) một job vào hàng chính, (b) một job vào hàng bulk để đối chứng, (c) một job ở hàng chính
 * phụ thuộc array job. So thời điểm bắt đầu của từng job.
 *
 * Dùng:
 *   node scripts/staging-queue-priority-test.js [--prefix dacntt-staging] [--children 24] [--sleep 90]
 */
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const PREFIX = flag('prefix', 'dacntt-staging');
const REGION = flag('region', 'ap-southeast-1');
const CHILDREN = Number(flag('children', 24));
const SLEEP_SECONDS = Number(flag('sleep', 90));
const MAIN_QUEUE = `${PREFIX}-transcode-queue`;
const BULK_QUEUE = `${PREFIX}-transcode-bulk-queue`;
const JOB_DEFINITION = `${PREFIX}-transcoder-job`;

const aws = (...cliArgs) => {
  const r = spawnSync('aws', [...cliArgs, '--region', REGION, '--output', 'json'], { encoding: 'utf-8', maxBuffer: 1 << 26 });
  if (r.status !== 0) throw new Error(`aws ${cliArgs.slice(0, 2).join(' ')}: ${r.stderr.trim()}`);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleepCommand = (seconds) => JSON.stringify({ command: ['node', '-e', `setTimeout(() => process.exit(0), ${seconds * 1000})`] });

const submit = ({ name, queue, seconds, arraySize, dependsOn }) => {
  const cliArgs = ['batch', 'submit-job', '--job-name', name, '--job-queue', queue, '--job-definition', JOB_DEFINITION, '--container-overrides', sleepCommand(seconds)];
  if (arraySize) cliArgs.push('--array-properties', `size=${arraySize}`);
  if (dependsOn) cliArgs.push('--depends-on', `jobId=${dependsOn}`);
  return aws(...cliArgs).jobId;
};

const describe = (...ids) => aws('batch', 'describe-jobs', '--jobs', ...ids).jobs;
const arrayStatus = (arrayId) => describe(arrayId)[0].arrayProperties.statusSummary;
const childTimes = (arrayId) => {
  const rows = [];
  for (const status of ['RUNNING', 'SUCCEEDED', 'FAILED']) {
    rows.push(...aws('batch', 'list-jobs', '--array-job-id', arrayId, '--job-status', status).jobSummaryList);
  }
  return rows.filter((j) => j.startedAt).map((j) => ({ id: j.jobId, startedAt: j.startedAt, stoppedAt: j.stoppedAt }));
};

const seconds = (ms) => (ms / 1000).toFixed(0);

const main = async () => {
  const cleanup = [];
  try {
    console.log(`Nộp array job ${CHILDREN} phần tử x ${SLEEP_SECONDS}s vào ${BULK_QUEUE}`);
    const arrayId = submit({ name: 'prio-test-array', queue: BULK_QUEUE, seconds: SLEEP_SECONDS, arraySize: CHILDREN });
    cleanup.push(arrayId);

    let running = 0;
    const deadline = Date.now() + 15 * 60 * 1000;
    while (running < 8 && Date.now() < deadline) {
      await sleep(10000);
      running = arrayStatus(arrayId).RUNNING || 0;
      process.stdout.write(`  đang chạy ${running}/8\r`);
    }
    if (running < 8) throw new Error(`Chỉ ${running} phần tử đang chạy sau 15 phút: không lấp đầy được hạn mức, phép đo vô nghĩa.`);
    console.log('\nHạn mức đã đầy. Nộp ba job thăm dò.');

    const tSubmit = Date.now();
    const high = submit({ name: 'prio-test-main', queue: MAIN_QUEUE, seconds: 5 });
    const bulk = submit({ name: 'prio-test-bulk-control', queue: BULK_QUEUE, seconds: 5 });
    const finalizer = submit({ name: 'prio-test-finalizer', queue: MAIN_QUEUE, seconds: 5, dependsOn: arrayId });
    cleanup.push(high, bulk, finalizer);

    for (let i = 0; i < 120; i += 1) {
      const probes = describe(high, bulk, finalizer);
      const arrayDone = arrayStatus(arrayId);
      if (probes.every((p) => p.status === 'SUCCEEDED' || p.status === 'FAILED') && (arrayDone.SUCCEEDED || 0) + (arrayDone.FAILED || 0) === CHILDREN) break;
      await sleep(15000);
    }

    const [pHigh, pBulk, pFinal] = [high, bulk, finalizer].map((id) => describe(id)[0]);
    const children = childTimes(arrayId);
    const startedBefore = (job) => children.filter((c) => c.startedAt < job.startedAt).length;
    const lastChildStop = Math.max(...children.map((c) => c.stoppedAt || 0));
    const firstChildStart = Math.min(...children.map((c) => c.startedAt));

    console.log('\n── Kết quả ─────────────────────────────────────');
    console.log(`Array job: ${CHILDREN} phần tử, phần tử đầu bắt đầu lúc +0s, phần tử cuối kết thúc lúc +${seconds(lastChildStop - firstChildStart)}s`);
    for (const [label, job] of [['hàng chính (priority 10)', pHigh], ['hàng bulk (đối chứng)', pBulk]]) {
      console.log(
        `${label.padEnd(26)} chờ ${seconds(job.startedAt - tSubmit).padStart(4)}s sau khi nộp; ` +
          `lúc nó bắt đầu đã có ${startedBefore(job)}/${CHILDREN} phần tử array bắt đầu`
      );
    }
    console.log(`job phụ thuộc (hàng chính) bắt đầu ${seconds(pFinal.startedAt - lastChildStop)}s SAU khi phần tử cuối kết thúc ` + `(phải >= 0)`);
    const result = {
      mainWaitSeconds: Number(seconds(pHigh.startedAt - tSubmit)),
      bulkWaitSeconds: Number(seconds(pBulk.startedAt - tSubmit)),
      childrenStartedBeforeMain: startedBefore(pHigh),
      childrenStartedBeforeBulk: startedBefore(pBulk),
      finalizerAfterLastChildSeconds: Number(seconds(pFinal.startedAt - lastChildStop)),
    };
    console.log(JSON.stringify(result));
  } finally {
    for (const id of cleanup) {
      try {
        aws('batch', 'terminate-job', '--job-id', id, '--reason', 'test finished');
      } catch {
        // job đã kết thúc: không cần dọn
      }
    }
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
