#!/usr/bin/env node
/**
 * Đo thời gian chuyển mã của một bộ video trên staging, tuần tự từng lượt, và ghi kết quả thành
 * bản ghi cho docs/results/runs (chặng S1 của đợt đo: README mục 12.2).
 *
 * Mỗi lượt: tạo video thử trong MongoDB staging, tải tệp lên bucket raw (đi đúng đường production:
 * S3 event, SQS, Lambda, Batch), chờ READY, dựng thời gian từng bước từ mốc của các job Batch, rồi xoá
 * video thử. Không cần backend hay giao diện (xem staging-chunked-test.js).
 *
 *   node scripts/staging-measure-set.js --plan "../samples/video-100mb.mp4:100MB:3,../samples/video-500mb.mp4:500MB:2" \
 *        --stage S1 --write [--verify] [--keep] [--budget-vcpu-hours 13]
 *
 * `--plan` là danh sách `tệp:nhãn:số lần`. `--verify` kiểm HLS (đủ segment, liền mạch) ở lượt ĐẦU của mỗi nhãn.
 * `--budget-vcpu-hours` dừng bộ đo khi tổng vCPU-giờ vượt trần (theo kế hoạch: 1,5 lần dự kiến).
 *
 * Tự bật và tự tắt: đầu bộ đo BẬT hàng đợi và môi trường Batch của `--prefix`, cuối bộ đo (kể cả khi lỗi,
 * vượt trần hay bị ngắt bằng Ctrl+C) TẮT chúng lại để không job nào lọt vào sau đó (xem
 * scripts/bench/batch-switch.js). `--no-enable` không bật ở đầu; `--keep-on` không tắt ở cuối.
 *
 * Mốc thời gian: thời lượng "từ tải lên xong đến READY" tính từ lúc `aws s3 cp` trả về đến `updatedAt` của
 * video ở trạng thái READY; các bước con lấy từ startedAt/stoppedAt của job Batch.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const batchSwitch = require('../../scripts/bench/batch-switch');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const PREFIX = flag('prefix', 'dacntt-staging');
const REGION = flag('region', 'ap-southeast-1');
const STAGE = flag('stage', 'S1');
const PLAN = flag('plan', '');
const BUDGET_VCPU_SECONDS = Number(flag('budget-vcpu-hours', 13)) * 3600;
// Công suất đang đặt ở staging, để ghi đúng vào bản ghi (S2 so 8 vCPU với 16 vCPU): quota Fargate Spot
// của môi trường và quota Fargate On-Demand đứng sau nó (0 khi chưa có môi trường On-Demand).
const SPOT_VCPUS = Number(flag('spot-vcpus', 8));
const ONDEMAND_VCPUS = Number(flag('ondemand-vcpus', 0));
const RAW_BUCKET = `${PREFIX}-raw-bucket`;
const PROCESSED_BUCKET = `${PREFIX}-processed-bucket`;
const QUEUES = [`${PREFIX}-transcode-queue`, `${PREFIX}-transcode-bulk-queue`];
const READY_TIMEOUT_MS = 5 * 60 * 60 * 1000;

const aws = (...cliArgs) => {
  const r = spawnSync('aws', [...cliArgs, '--region', REGION], { encoding: 'utf-8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`aws ${cliArgs.slice(0, 2).join(' ')} thất bại: ${(r.stderr || '').trim().slice(0, 300)}`);
  return r.stdout;
};
const awsJson = (...cliArgs) => JSON.parse(aws(...cliArgs, '--output', 'json'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (seconds) => `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const connect = async () => {
  const mongoose = require('mongoose');
  const uri = aws('secretsmanager', 'get-secret-value', '--secret-id', `${PREFIX}/mongodb-uri`, '--query', 'SecretString', '--output', 'text').trim();
  if (!uri.includes('/vidshare-staging')) throw new Error('URI không trỏ vào database vidshare-staging; dừng để không ghi nhầm vào dữ liệu thật');
  await mongoose.connect(uri);
  return mongoose;
};
const videoModel = (mongoose) => mongoose.models.Video || mongoose.model('Video', new mongoose.Schema({}, { strict: false, timestamps: true }), 'videos');

/** Một job Batch đã kết thúc, rút gọn. */
const vcpuOf = (job) => {
  const container = job.container || {};
  const req = (container.resourceRequirements || []).find((r) => r.type === 'VCPU');
  return Number((req && req.value) || container.vcpus || 1);
};
const brief = (job) => ({
  id: job.jobId,
  name: job.jobName,
  status: job.status,
  vcpu: vcpuOf(job),
  createdAt: job.createdAt,
  startedAt: job.startedAt || null,
  stoppedAt: job.stoppedAt || null,
  arraySize: job.arrayProperties && job.arrayProperties.size ? job.arrayProperties.size : null,
});

const describeJobs = (ids) => {
  const rows = [];
  for (let i = 0; i < ids.length; i += 100) rows.push(...awsJson('batch', 'describe-jobs', '--jobs', ...ids.slice(i, i + 100)).jobs);
  return rows;
};

/** Mọi job của một video (cả hai hàng đợi) và các phần tử con của mảng đoạn. */
const collectJobs = (videoId) => {
  const ids = [];
  for (const queue of QUEUES) {
    for (const status of ['SUCCEEDED', 'FAILED', 'RUNNING', 'RUNNABLE', 'STARTING', 'PENDING', 'SUBMITTED']) {
      const rows = awsJson('batch', 'list-jobs', '--job-queue', queue, '--job-status', status, '--query', 'jobSummaryList[].{id:jobId,name:jobName}');
      ids.push(...rows.filter((r) => r.name.includes(videoId)).map((r) => r.id));
    }
  }
  const all = describeJobs(ids).map(brief);
  const children = [];
  for (const parent of all.filter((j) => j.arraySize)) {
    const ids = [];
    for (const status of ['SUCCEEDED', 'FAILED']) {
      ids.push(...awsJson('batch', 'list-jobs', '--array-job-id', parent.id, '--job-status', status, '--query', 'jobSummaryList[].jobId'));
    }
    children.push(...describeJobs(ids).map(brief));
  }
  return { jobs: all, children };
};

/**
 * Như collectJobs nhưng chờ mọi job của video đã kết thúc (có stoppedAt).
 *
 * Video đặt READY khi job ghép vừa ghi xong, còn job vẫn RUNNING thêm vài giây tới vài chục giây (thoát
 * tiến trình, dọn tệp tạm). Thu thập ngay lúc READY sẽ thiếu mốc kết thúc của chính job cuối và đếm
 * vCPU-giây bằng 0.
 */
const collectSettled = async (videoId, { attempts = 24, waitMs = 10000 } = {}) => {
  let snapshot = collectJobs(videoId);
  for (let i = 0; i < attempts; i += 1) {
    const unsettled = [...snapshot.jobs.filter((j) => !j.arraySize), ...snapshot.children].filter((j) => !j.stoppedAt);
    if (snapshot.jobs.length > 0 && unsettled.length === 0) break;
    await sleep(waitMs);
    snapshot = collectJobs(videoId);
  }
  return snapshot;
};

const seconds = (ms) => Math.round(ms / 1000);

const buildRecord = ({ label, rep, file, video, uploadSeconds, uploadedAt, readyAt, jobs, children, verify }) => {
  const arrayParent = jobs.find((j) => j.name.startsWith('chunks-'));
  const audio = jobs.filter((j) => j.name.startsWith('audio-'));
  const finalize = jobs.find((j) => j.name.startsWith('finalize-'));
  const planner = jobs.find((j) => !j.name.startsWith('chunks-') && !j.name.startsWith('audio-') && !j.name.startsWith('finalize-'));
  const chunked = Boolean(arrayParent);
  const run = (j) => (j && j.startedAt && j.stoppedAt ? seconds(j.stoppedAt - j.startedAt) : null);

  const timings = { upload: uploadSeconds, end_to_end: seconds(readyAt - uploadedAt) };
  if (planner && planner.startedAt) timings.queue_to_first_job = seconds(planner.startedAt - uploadedAt);
  let chunkStats = null;
  let chunkInfo = null;
  let vcpuSeconds = 0;

  for (const j of [...jobs.filter((x) => !x.arraySize), ...children]) {
    if (j.startedAt && j.stoppedAt) vcpuSeconds += ((j.stoppedAt - j.startedAt) / 1000) * j.vcpu;
  }

  if (chunked) {
    timings.planner = run(planner);
    if (audio.length) timings.audio = Math.max(...audio.map((a) => run(a) || 0));
    timings.finalize = run(finalize);
    const starts = children.filter((c) => c.startedAt).map((c) => c.startedAt);
    const stops = children.filter((c) => c.stoppedAt).map((c) => c.stoppedAt);
    if (starts.length && stops.length) timings.chunks = seconds(Math.max(...stops) - Math.min(...starts));
    const durations = children.filter((c) => c.startedAt && c.stoppedAt).map((c) => (c.stoppedAt - c.startedAt) / 1000);
    if (durations.length) chunkStats = { min: Math.round(Math.min(...durations)), median: Math.round(median(durations)), max: Math.round(Math.max(...durations)) };
    chunkInfo = { vcpu: children[0] ? children[0].vcpu : null, memory_mib: null, count: arrayParent.arraySize, slots: null, gops_per_chunk: null };
  } else if (planner) {
    timings.job_run = run(planner);
  }

  const date = new Date().toISOString().slice(0, 10);
  return {
    id: `${date}-staging-${STAGE.toLowerCase()}-${label.toLowerCase()}-r${rep}`,
    date,
    account: 'B',
    region: REGION,
    environment: PREFIX.replace('dacntt-', ''),
    path: chunked ? 'chunked' : 'single',
    capacity: { spot_max_vcpus: SPOT_VCPUS, ondemand_max_vcpus: ONDEMAND_VCPUS },
    chunk: chunkInfo,
    video: {
      label,
      duration_s: video.duration || null,
      size_gib: Number((fs.statSync(file).size / 1073741824).toFixed(3)),
      resolution: '1920x1080',
      fps: 30,
    },
    concurrency: 1,
    measured_from: 'upload_complete',
    timings_s: timings,
    ...(chunkStats ? { chunk_stats_s: chunkStats } : {}),
    vcpu_seconds: Math.round(vcpuSeconds),
    vcpu_seconds_scope: 'all_jobs',
    // `hls_verified` chỉ true khi đã chạy kiểm HLS và đạt; không kiểm thì false (không phải "kiểm hỏng").
    result: { final_status: video.status, hls_verified: verify === true },
    provenance: 'measured',
    source: `transcoder/scripts/staging-measure-set.js (${STAGE})`,
    notes: `Lượt ${rep} của ${label}; tệp ${path.basename(file)}. Mốc tải lên xong là lúc aws s3 cp trả về, READY lấy từ updatedAt của video.`,
  };
};

const runVerify = (videoId) => {
  const r = spawnSync('node', [path.join(__dirname, 'staging-chunked-test.js'), 'verify', videoId, '--prefix', PREFIX, '--region', REGION], { encoding: 'utf-8', maxBuffer: 1 << 26 });
  const out = `${r.stdout || ''}`;
  process.stdout.write(out.split('\n').filter((l) => /[✓✗]/.test(l)).join('\n') + '\n');
  return r.status === 0 && !out.includes('✗');
};

const removeVideo = (videoId, rawKey) => {
  try {
    if (rawKey) aws('s3', 'rm', `s3://${RAW_BUCKET}/${rawKey}`, '--only-show-errors');
    aws('s3', 'rm', `s3://${PROCESSED_BUCKET}/videos/${videoId}/`, '--recursive', '--only-show-errors');
    aws('s3', 'rm', `s3://${RAW_BUCKET}/work/${videoId}/`, '--recursive', '--only-show-errors');
  } catch (error) {
    console.warn(`  dọn S3 chưa trọn vẹn: ${error.message}`);
  }
};

const oneRun = async (mongoose, { file, label, rep, verify }) => {
  const Video = videoModel(mongoose);
  const userId = new mongoose.Types.ObjectId();
  const created = await Video.create({
    title: `measure ${STAGE} ${label} r${rep} ${new Date().toISOString()}`,
    description: 'Video đo thời gian chuyển mã; xoá tự động sau mỗi lượt',
    user: userId,
    status: 'UPLOADING',
    visibility: 'private',
    category: 'Khác',
    mimeType: 'video/mp4',
    fileSize: fs.statSync(file).size,
  });
  const videoId = String(created._id);
  const key = `videos/${userId}/${videoId}/${path.basename(file)}`;
  await Video.updateOne({ _id: videoId }, { $set: { rawS3Key: key } });

  console.log(`\n[${label} r${rep}] videoId ${videoId}, tải ${(fs.statSync(file).size / 1048576).toFixed(0)} MiB lên ${RAW_BUCKET}`);
  const t0 = Date.now();
  const up = spawnSync('aws', ['s3', 'cp', file, `s3://${RAW_BUCKET}/${key}`, '--region', REGION, '--only-show-errors'], { stdio: 'inherit' });
  if (up.status !== 0) throw new Error('Tải lên thất bại');
  const uploadSeconds = Math.round((Date.now() - t0) / 1000);
  // Mốc "tải lên xong" là lúc `aws s3 cp` trả về. KHÔNG dùng LastModified của đối tượng S3: với tệp tải
  // bằng multipart, LastModified là lúc BẮT ĐẦU lượt tải, nên thời gian tải lên (gần 5 phút với 2,8 GiB)
  // bị cộng vào thời gian xử lý. S1 và S2a đã bị lỗi này (xem notes của các bản ghi đó).
  const uploadedAt = t0 + uploadSeconds * 1000;
  console.log(`  đã tải lên sau ${fmt(uploadSeconds)}; chờ READY...`);

  let video = null;
  let last = '';
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(15000);
    video = await Video.findById(videoId).lean();
    if (!video) throw new Error('Video biến mất khỏi MongoDB');
    if (video.status !== last) {
      console.log(`  [${fmt((Date.now() - uploadedAt) / 1000)}] ${video.status}`);
      last = video.status;
    }
    if (video.status === 'READY' || video.status === 'ERROR') break;
  }
  if (!video || (video.status !== 'READY' && video.status !== 'ERROR')) throw new Error('Quá thời hạn chờ READY');
  const readyAt = new Date(video.updatedAt).getTime();

  const { jobs, children } = await collectSettled(videoId);
  let verified = null;
  if (verify && video.status === 'READY') verified = runVerify(videoId);

  const record = buildRecord({ label, rep, file, video, uploadSeconds, uploadedAt, readyAt, jobs, children, verify: verified });
  if (!has('keep')) removeVideo(videoId, key);
  await Video.deleteOne({ _id: videoId });

  console.log(
    `  ${video.status} sau ${fmt(record.timings_s.end_to_end)} (${record.path}${record.chunk ? `, ${record.chunk.count} đoạn x ${record.chunk.vcpu} vCPU` : ''}); ` +
      `${(record.vcpu_seconds / 3600).toFixed(2)} vCPU-giờ`
  );
  return record;
};

const main = async () => {
  const items = PLAN.split(',').filter(Boolean).map((entry) => {
    const [file, label, reps] = entry.split(':');
    return { file: path.resolve(file), label, reps: Number(reps || 1) };
  });
  if (!items.length) throw new Error('Thiếu --plan "tệp:nhãn:số lần,..."');
  for (const item of items) if (!fs.existsSync(item.file)) throw new Error(`Không thấy tệp ${item.file}`);

  const date = new Date().toISOString().slice(0, 10);
  const out = path.join(__dirname, '..', '..', 'docs', 'results', 'runs', `${date}-${STAGE.toLowerCase()}-transcode.json`);
  const records = [];
  const flush = () => {
    if (!has('write')) return;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, `${JSON.stringify({ schema: 1, title: `${STAGE}: thời gian chuyển mã (staging, Fargate Spot ${SPOT_VCPUS} vCPU${ONDEMAND_VCPUS ? ` + On-Demand ${ONDEMAND_VCPUS} vCPU` : ''})`, runs: records }, null, 2)}\n`, 'utf-8');
  };

  if (!has('no-enable')) {
    console.log('Bật hàng đợi và môi trường Batch...');
    await batchSwitch.setState(PREFIX, REGION, 'ENABLED', { log: console.log });
  }
  let switchedOff = false;
  const switchOff = async () => {
    if (switchedOff || has('keep-on')) return;
    switchedOff = true;
    try {
      console.log('Tắt hàng đợi và môi trường Batch...');
      await batchSwitch.setState(PREFIX, REGION, 'DISABLED', { log: console.log });
    } catch (error) {
      console.error(`CẢNH BÁO: không tắt được Batch (${error.message}). Tắt tay: node scripts/bench/batch-switch.js off --prefix ${PREFIX}`);
    }
  };
  // Ctrl+C hoặc kill: tắt rồi mới thoát, vì khối finally không chạy khi tiến trình bị ngắt.
  process.on('SIGINT', () => switchOff().finally(() => process.exit(130)));
  process.on('SIGTERM', () => switchOff().finally(() => process.exit(143)));

  // Kết nối lỗi thì cũng tắt Batch vừa bật, rồi mới báo lỗi.
  let mongoose;
  try {
    mongoose = await connect();
  } catch (error) {
    await switchOff();
    throw error;
  }
  let spent = 0;
  try {
    for (const item of items) {
      for (let rep = 1; rep <= item.reps; rep += 1) {
        const record = await oneRun(mongoose, { ...item, rep, verify: has('verify') && rep === 1 });
        records.push(record);
        spent += record.vcpu_seconds;
        flush();
        if (spent > BUDGET_VCPU_SECONDS) {
          console.log(`\nDỪNG: đã dùng ${(spent / 3600).toFixed(1)} vCPU-giờ, vượt trần ${(BUDGET_VCPU_SECONDS / 3600).toFixed(1)}.`);
          return;
        }
      }
    }
  } finally {
    await mongoose.disconnect();
    flush();
    await switchOff();
  }

  console.log('\n── Tóm tắt ─────────────────────────────────────');
  for (const item of items) {
    const rows = records.filter((r) => r.video.label === item.label);
    console.log(`${item.label.padEnd(8)} ${rows.map((r) => fmt(r.timings_s.end_to_end)).join(', ')}  (${rows[0] ? rows[0].path : '-'})`);
  }
  console.log(`Tổng ${(spent / 3600).toFixed(2)} vCPU-giờ${has('write') ? `; đã ghi ${path.relative(process.cwd(), out)}` : ''}`);
};

main().catch((error) => {
  console.error('✗', error.message);
  process.exit(1);
});
