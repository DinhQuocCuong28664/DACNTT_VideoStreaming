#!/usr/bin/env node
/**
 * Bật, tắt hoặc xem trạng thái hàng đợi và môi trường tính toán AWS Batch của một môi trường.
 *
 * Vì sao có công tắc này: các script đo chạy nhiều giờ ở nền. Khi script kết thúc (hay bị ngắt) mà hàng
 * đợi còn ENABLED thì bất kỳ job nào lọt vào (một video thử còn sót, một lần nộp tay, S3 event cũ) vẫn
 * được chạy và tính tiền. Tắt hàng đợi và môi trường ngay khi đo xong là chốt chặn cuối cùng; các script
 * đo gọi `setState(...,'DISABLED')` trong khối `finally`, nên tắt cả khi script lỗi.
 *
 * Thứ tự: BẬT môi trường tính toán trước rồi mới bật hàng đợi; TẮT hàng đợi trước rồi mới tắt môi trường
 * (hàng đợi không còn nhận job, rồi môi trường mới ngừng mở rộng). Job đang chạy KHÔNG bị dừng.
 *
 * Mặc định từ chối môi trường production (`dacntt-dev`): tắt nó là tắt xử lý video của người dùng thật.
 *
 *   node scripts/bench/batch-switch.js status [--prefix dacntt-staging]
 *   node scripts/bench/batch-switch.js on     [--prefix dacntt-staging]
 *   node scripts/bench/batch-switch.js off    [--prefix dacntt-staging]
 *   node scripts/bench/batch-switch.js off --prefix dacntt-dev --allow-production
 *
 * Terraform khai báo cả hai ở trạng thái ENABLED, nên `terraform apply` kế tiếp đưa về ENABLED.
 */
const { spawnSync } = require('child_process');

const PRODUCTION_PREFIX = 'dacntt-dev';

const aws = (region, ...cliArgs) => {
  const r = spawnSync('aws', [...cliArgs, '--region', region, '--output', 'json'], { encoding: 'utf-8', maxBuffer: 1 << 24 });
  if (r.status !== 0) throw new Error(`aws ${cliArgs.slice(0, 2).join(' ')}: ${(r.stderr || '').trim().slice(0, 300)}`);
  return r.stdout.trim() ? JSON.parse(r.stdout) : null;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Hàng đợi và môi trường có thật của một tiền tố (môi trường On-Demand chỉ có khi đã bật). */
const resources = (prefix, region) => {
  const queueNames = [`${prefix}-transcode-queue`, `${prefix}-transcode-bulk-queue`];
  const ceNames = [`${prefix}-fargate-ce`, `${prefix}-fargate-od-ce`];
  const queues = aws(region, 'batch', 'describe-job-queues', '--job-queues', ...queueNames).jobQueues.map((q) => ({
    name: q.jobQueueName,
    state: q.state,
    status: q.status,
  }));
  const ces = aws(region, 'batch', 'describe-compute-environments', '--compute-environments', ...ceNames).computeEnvironments.map((c) => ({
    name: c.computeEnvironmentName,
    state: c.state,
    status: c.status,
  }));
  return { queues, ces };
};

const status = (prefix, region) => resources(prefix, region);

/** Chờ các tài nguyên về trạng thái VALID sau khi cập nhật (cập nhật hàng đợi mất vài giây). */
const settle = async (prefix, region, attempts = 20) => {
  for (let i = 0; i < attempts; i += 1) {
    const { queues, ces } = resources(prefix, region);
    if ([...queues, ...ces].every((r) => r.status === 'VALID')) return;
    await sleep(3000);
  }
};

/**
 * @param {string} prefix  ví dụ dacntt-staging
 * @param {string} region
 * @param {'ENABLED'|'DISABLED'} state
 * @param {{ allowProduction?: boolean, log?: (line: string) => void }} [options]
 */
const setState = async (prefix, region, state, { allowProduction = false, log = () => {} } = {}) => {
  if (!['ENABLED', 'DISABLED'].includes(state)) throw new Error(`Trạng thái không hợp lệ: ${state}`);
  if (prefix === PRODUCTION_PREFIX && !allowProduction) {
    throw new Error(`Từ chối đổi ${PRODUCTION_PREFIX} (production) khi thiếu --allow-production.`);
  }

  const { queues, ces } = resources(prefix, region);
  const setQueues = () => {
    for (const q of queues.filter((x) => x.state !== state)) {
      aws(region, 'batch', 'update-job-queue', '--job-queue', q.name, '--state', state);
      log(`  hàng đợi ${q.name}: ${q.state} -> ${state}`);
    }
  };
  const setEnvironments = () => {
    for (const c of ces.filter((x) => x.state !== state)) {
      aws(region, 'batch', 'update-compute-environment', '--compute-environment', c.name, '--state', state);
      log(`  môi trường ${c.name}: ${c.state} -> ${state}`);
    }
  };

  if (state === 'ENABLED') {
    setEnvironments();
    await settle(prefix, region);
    setQueues();
  } else {
    setQueues();
    await settle(prefix, region);
    setEnvironments();
  }
  await settle(prefix, region);
};

module.exports = { setState, status, PRODUCTION_PREFIX };

if (require.main === module) {
  const args = process.argv.slice(2);
  const flag = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
  };
  const command = args[0];
  const prefix = flag('prefix', 'dacntt-staging');
  const region = flag('region', 'ap-southeast-1');
  const allowProduction = args.includes('--allow-production');

  const run = async () => {
    if (command === 'status') {
      const s = status(prefix, region);
      for (const q of s.queues) console.log(`hàng đợi    ${q.name.padEnd(42)} ${q.state} (${q.status})`);
      for (const c of s.ces) console.log(`môi trường  ${c.name.padEnd(42)} ${c.state} (${c.status})`);
      return;
    }
    if (command === 'on' || command === 'off') {
      await setState(prefix, region, command === 'on' ? 'ENABLED' : 'DISABLED', { allowProduction, log: console.log });
      const s = status(prefix, region);
      console.log([...s.queues, ...s.ces].map((r) => `${r.name}=${r.state}`).join('\n'));
      return;
    }
    throw new Error('Cách dùng: batch-switch.js <status|on|off> [--prefix dacntt-staging] [--allow-production]');
  };

  run().catch((error) => {
    console.error('✗', error.message);
    process.exit(1);
  });
}
