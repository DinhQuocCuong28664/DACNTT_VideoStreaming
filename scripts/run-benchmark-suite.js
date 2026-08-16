/**
 * ═══════════════════════════════════════════════════
 * Điều phối bộ thí nghiệm đo hiệu năng Transcoding Pipeline (Mục 12)
 *
 * Vì sao cần script này thay vì gọi tay measure-transcode.js nhiều lần:
 *
 * 1. THIẾT KẾ XEN KẼ. Lần đo trước chạy dồn toàn bộ cấu hình 1 vCPU thành một
 *    khối rồi mới chạy khối 4 vCPU. Cách đó trộn lẫn biến cần đo (số vCPU) với
 *    biến thời gian: năng lực Fargate Spot thay đổi theo giờ, nên nếu khối này
 *    gặp lúc Spot đông còn khối kia gặp lúc Spot rảnh thì chênh lệch đo được
 *    không còn phản ánh đúng tác động của vCPU. Bằng chứng cho thấy nhiễu này
 *    rất lớn: ba lần đo 100MB ở cùng cấu hình 1 vCPU lệch nhau tới 56%.
 *    Script chạy xen kẽ 1 vCPU → 4 vCPU liền nhau trên cùng một tệp, để hai
 *    cấu hình gặp gần như cùng điều kiện hạ tầng (thiết kế theo cặp, paired
 *    design — xem Jain (1991) về việc cố định biến ngoại lai).
 *
 * 2. CHỜ HÀNG ĐỢI RỖNG. Nếu job trước chưa xong mà đã nộp job sau, chúng tranh
 *    nhau slot vCPU và thời gian đo sẽ gồm cả thời gian xếp hàng — sai lệch.
 *
 * 3. CHẠY DÀI KHÔNG CẦN TRÔNG. Toàn bộ bộ đo mất nhiều giờ; script ghi tiến độ
 *    ra tệp log để có thể theo dõi/khôi phục, và không dừng cả bộ chỉ vì một
 *    phép đo lẻ thất bại.
 *
 * Kết quả từng phép đo do measure-transcode.js tự ghi nối vào
 * docs/results/transcode-timing.json.
 * ═══════════════════════════════════════════════════
 *
 * Cách dùng:
 *   node scripts/run-benchmark-suite.js [--dry-run]
 *
 * Biến môi trường bắt buộc:
 *   API_URL    — ví dụ https://api.zelostech.site/api
 *   JWT_TOKEN  — token của tài khoản dùng để tải lên
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TF_DIR = path.join(ROOT, 'infrastructure', 'environments', 'dev');
const LOG_PATH = path.join(ROOT, 'docs', 'results', 'benchmark-suite.log');
const QUEUE = 'dacntt-dev-transcode-queue';
const DRY_RUN = process.argv.includes('--dry-run');

/**
 * Kế hoạch đo. Xếp từ tệp nhỏ tới lớn có chủ đích: nếu buộc phải dừng giữa
 * chừng, phần dữ liệu thu được vẫn là phần có giá trị thống kê cao nhất
 * (nhiều lần lặp, biến thiên lớn nhất) thay vì bỏ dở rải rác mọi kích thước.
 */
const PLAN = [
  { file: 'samples/video-100mb.mp4', size: '100MB', reps: 5 },
  { file: 'samples/video-500mb.mp4', size: '500MB', reps: 4 },
  { file: 'samples/video-1gb.mp4', size: '1GB', reps: 3 },
];

/** Hai cấu hình được so sánh, chạy liền nhau trong mỗi lần lặp */
const CONFIGS = [
  { vcpu: 1, memory: 2048 },
  { vcpu: 4, memory: 8192 },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n', 'utf8');
}

/** Đổi cấu hình vCPU/bộ nhớ của Batch Job Definition */
function applyConfig({ vcpu, memory }) {
  if (DRY_RUN) {
    log(`  [dry-run] terraform apply job_vcpu=${vcpu} job_memory=${memory}`);
    return;
  }
  execFileSync(
    'terraform',
    [
      'apply',
      '-target=module.batch',
      `-var=job_vcpu=${vcpu}`,
      `-var=job_memory=${memory}`,
      '-auto-approve',
      '-no-color',
    ],
    { cwd: TF_DIR, stdio: 'pipe' }
  );
}

/** Đếm số job chưa kết thúc trong hàng đợi Batch */
function pendingJobs() {
  if (DRY_RUN) return 0;
  let total = 0;
  for (const status of ['SUBMITTED', 'PENDING', 'RUNNABLE', 'STARTING', 'RUNNING']) {
    const out = execFileSync(
      'aws',
      [
        'batch', 'list-jobs',
        '--job-queue', QUEUE,
        '--job-status', status,
        '--query', 'length(jobSummaryList)',
        '--output', 'text',
      ],
      { encoding: 'utf8' }
    ).trim();
    total += Number(out) || 0;
  }
  return total;
}

/**
 * Chờ tới khi không còn job nào đang chạy.
 *
 * Bắt buộc trước mỗi phép đo: nếu còn job cũ chiếm slot vCPU, job mới sẽ phải
 * xếp hàng và thời gian đo được sẽ gồm cả thời gian chờ — không còn phản ánh
 * đúng thời gian xử lý thực tế của pipeline.
 */
async function waitForIdleQueue() {
  for (;;) {
    const n = pendingJobs();
    if (n === 0) return;
    log(`  ...chờ hàng đợi rỗng, còn ${n} job`);
    await sleep(30000);
  }
}

/** Chạy một phép đo đơn lẻ, trả về true nếu thành công */
function runMeasurement(file, label) {
  if (DRY_RUN) {
    log(`  [dry-run] measure-transcode.js ${file} ${label}`);
    return true;
  }
  const res = spawnSync(
    process.execPath,
    [path.join('scripts', 'measure-transcode.js'), file, label],
    { cwd: ROOT, stdio: 'inherit', env: process.env }
  );
  return res.status === 0;
}

async function main() {
  if (!process.env.JWT_TOKEN || !process.env.API_URL) {
    console.error('Thiếu biến môi trường API_URL hoặc JWT_TOKEN.');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });

  const totalRuns = PLAN.reduce((s, p) => s + p.reps, 0) * CONFIGS.length;
  log(`=== Bắt đầu bộ đo: ${totalRuns} phép đo (${PLAN.map((p) => `${p.size}x${p.reps}`).join(', ')}, mỗi lần lặp chạy cả ${CONFIGS.map((c) => c.vcpu + 'vCPU').join(' và ')}) ===`);

  let done = 0;
  let failed = 0;

  for (const item of PLAN) {
    const filePath = path.join(ROOT, item.file);
    if (!fs.existsSync(filePath)) {
      log(`BỎ QUA ${item.size}: không tìm thấy ${item.file}`);
      continue;
    }

    for (let rep = 1; rep <= item.reps; rep++) {
      // Xen kẽ hai cấu hình trong cùng một lần lặp để chúng gặp cùng điều kiện
      // hạ tầng, thay vì gom mỗi cấu hình thành một khối tách biệt về thời gian.
      for (const cfg of CONFIGS) {
        done++;
        const label = `${item.size}-${cfg.vcpu}vcpu`;
        log(`[${done}/${totalRuns}] ${item.size} lần ${rep}/${item.reps} @ ${cfg.vcpu} vCPU`);

        try {
          await waitForIdleQueue();
          applyConfig(cfg);
          // Job Definition vừa tạo revision mới; chờ một nhịp cho AWS Batch
          // nhận diện trước khi Lambda nộp job tiếp theo.
          await sleep(5000);

          const ok = runMeasurement(item.file, label);
          if (!ok) {
            failed++;
            log(`  ✗ THẤT BẠI: ${label} lần ${rep}`);
          } else {
            log(`  ✓ xong: ${label} lần ${rep}`);
          }
        } catch (err) {
          failed++;
          log(`  ✗ LỖI: ${label} lần ${rep} — ${err.message}`);
        }
      }
    }
  }

  log(`=== Kết thúc: ${done - failed}/${done} phép đo thành công, ${failed} thất bại ===`);
  log('Trả cấu hình về mặc định 1 vCPU / 2 GB');
  try {
    applyConfig(CONFIGS[0]);
  } catch (err) {
    log(`Không trả được cấu hình về mặc định: ${err.message}`);
  }

  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((err) => {
    log(`LỖI NGHIÊM TRỌNG: ${err.stack || err.message}`);
    process.exitCode = 1;
  });
}
