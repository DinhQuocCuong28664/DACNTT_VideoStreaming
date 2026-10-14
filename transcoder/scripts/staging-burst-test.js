#!/usr/bin/env node
/**
 * Nộp N video CÙNG LÚC vào pipeline staging và đo cả đợt (README mục 12.3: nhiều video đồng thời).
 *
 *   node scripts/staging-burst-test.js --stage S5a --source ../../Downloads/upload-test-25min.mp4 \
 *        --label 25min-1080p --count 4 --ondemand-vcpus 8 --write
 *
 * Vì sao dùng sao chép phía S3 thay vì tải N lần: tải N tệp song song chia nhau một đường truyền (lần đo cũ
 * mất 16 phút 55 giây chỉ để tải 4 video), nên các video không "đến cùng lúc" theo nghĩa của pipeline. Ở đây
 * tệp nguồn được tải MỘT lần vào `bench/` (ngoài tiền tố `videos/` nên không kích hoạt sự kiện), rồi N lệnh
 * `aws s3 cp` giữa hai khoá S3 chạy song song: mỗi lệnh khi xong phát một sự kiện ObjectCreated đúng như một
 * lần tải lên thật, và N sự kiện đến trong vài giây.
 *
 * Đo: thời điểm từng video "đến" (lệnh sao chép trả về), thời điểm READY (updatedAt), độ trễ từng video,
 * thời gian cả đợt, thông lượng, vCPU-giây từ mốc của các job Batch. Tự bật Batch khi bắt đầu và tự tắt khi
 * xong (kể cả khi lỗi hoặc bị ngắt), và xoá mọi thứ nó tạo.
 */
const { spawn, spawnSync } = require('child_process');
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
const STAGE = flag('stage', 'S5');
const SOURCE = flag('source', '');
const LABEL = flag('label', 'burst');
const COUNT = Number(flag('count', 4));
const SPOT_VCPUS = Number(flag('spot-vcpus', 8));
const ONDEMAND_VCPUS = Number(flag('ondemand-vcpus', 0));
const COPY_CONCURRENCY = Number(flag('copy-concurrency', 25));
const EST_VCPU_HOURS_EACH = Number(flag('est-vcpu-hours-each', 2.5));
const BUDGET_VCPU_HOURS = Number(flag('budget-vcpu-hours', COUNT * EST_VCPU_HOURS_EACH * 1.5));
const TIMEOUT_MS = Number(flag('timeout-hours', 6)) * 3600 * 1000;
const RAW_BUCKET = `${PREFIX}-raw-bucket`;
const PROCESSED_BUCKET = `${PREFIX}-processed-bucket`;
const QUEUES = [`${PREFIX}-transcode-queue`, `${PREFIX}-transcode-bulk-queue`];

const aws = (...cliArgs) => {
  const r = spawnSync('aws', [...cliArgs, '--region', REGION], { encoding: 'utf-8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`aws ${cliArgs.slice(0, 2).join(' ')} thất bại: ${(r.stderr || '').trim().slice(0, 300)}`);
  return r.stdout;
};
const awsJson = (...cliArgs) => JSON.parse(aws(...cliArgs, '--output', 'json'));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fmt = (seconds) => `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`;
const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

const connect = async () => {
  const mongoose = require('mongoose');
  const uri = aws('secretsmanager', 'get-secret-value', '--secret-id', `${PREFIX}/mongodb-uri`, '--query', 'SecretString', '--output', 'text').trim();
  if (!uri.includes('/vidshare-staging')) throw new Error('URI không trỏ vào database vidshare-staging; dừng để không ghi nhầm vào dữ liệu thật');
  await mongoose.connect(uri);
  return mongoose;
};
const videoModel = (mongoose) => mongoose.models.Video || mongoose.model('Video', new mongoose.Schema({}, { strict: false, timestamps: true }), 'videos');

/** Chạy `aws s3 cp` không đồng bộ; trả về khi xong. */
const copyObject = (from, to) =>
  new Promise((resolve, reject) => {
    const proc = spawn('aws', ['s3', 'cp', from, to, '--region', REGION, '--only-show-errors'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    proc.stderr.on('data', (c) => { stderr += c; });
    proc.on('error', reject);
    proc.on('close', (code) => (code === 0 ? resolve(Date.now()) : reject(new Error(`s3 cp ${to}: ${stderr.trim().slice(0, 200)}`))));
  });

/** Chạy các tác vụ với số lượng đồng thời giới hạn, giữ nguyên thứ tự kết quả. */
const pool = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next;
        next += 1;
        results[i] = await worker(items[i], i);
      }
    })
  );
  return results;
};

const vcpuOf = (job) => {
  const c = job.container || {};
  const req = (c.resourceRequirements || []).find((r) => r.type === 'VCPU');
  return Number((req && req.value) || c.vcpus || 1);
};

/** Mọi job Batch của các video trong đợt, kèm các phần tử con của mảng đoạn. */
const collectJobs = (ids) => {
  const wanted = new Set(ids);
  const idOf = (name) => (name.match(/[0-9a-f]{24}/) || [null])[0];
  const jobIds = [];
  for (const queue of QUEUES) {
    for (const status of ['SUCCEEDED', 'FAILED', 'RUNNING', 'RUNNABLE', 'STARTING', 'PENDING', 'SUBMITTED']) {
      const rows = awsJson('batch', 'list-jobs', '--job-queue', queue, '--job-status', status, '--query', 'jobSummaryList[].{id:jobId,name:jobName}');
      for (const r of rows) if (wanted.has(idOf(r.name))) jobIds.push(r.id);
    }
  }
  const describe = (list) => {
    const out = [];
    for (let i = 0; i < list.length; i += 100) out.push(...awsJson('batch', 'describe-jobs', '--jobs', ...list.slice(i, i + 100)).jobs);
    return out;
  };
  const parents = describe(jobIds);
  const children = [];
  for (const p of parents.filter((j) => j.arrayProperties && j.arrayProperties.size)) {
    const childIds = [];
    for (const status of ['SUCCEEDED', 'FAILED']) {
      childIds.push(...awsJson('batch', 'list-jobs', '--array-job-id', p.jobId, '--job-status', status, '--query', 'jobSummaryList[].jobId'));
    }
    for (const c of describe(childIds)) children.push({ ...c, videoId: idOf(p.jobName) });
  }
  return { parents: parents.map((j) => ({ ...j, videoId: idOf(j.jobName) })), children };
};

const main = async () => {
  if (!SOURCE || !fs.existsSync(path.resolve(SOURCE))) throw new Error('Cần --source <tệp video>');
  if (!Number.isInteger(COUNT) || COUNT < 2) throw new Error('--count phải là số nguyên từ 2');
  const source = path.resolve(SOURCE);
  const base = path.basename(source);

  console.log(`${STAGE}: ${COUNT} video "${LABEL}" cùng lúc; dự kiến ${(COUNT * EST_VCPU_HOURS_EACH).toFixed(1)} vCPU-giờ, trần ${BUDGET_VCPU_HOURS.toFixed(1)}`);
  if (COUNT * EST_VCPU_HOURS_EACH > BUDGET_VCPU_HOURS) throw new Error('Dự kiến vượt trần chi phí; tăng --budget-vcpu-hours hoặc giảm --count.');

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
  process.on('SIGINT', () => switchOff().finally(() => process.exit(130)));
  process.on('SIGTERM', () => switchOff().finally(() => process.exit(143)));

  let mongoose;
  try {
    mongoose = await connect();
  } catch (error) {
    await switchOff();
    throw error;
  }
  const Video = videoModel(mongoose);
  const userId = new mongoose.Types.ObjectId();
  const stagingKey = `bench/${STAGE.toLowerCase()}-${Date.now()}/${base}`;
  const docs = [];

  try {
    console.log(`Tải nguồn ${(fs.statSync(source).size / 1048576).toFixed(0)} MiB lên s3://${RAW_BUCKET}/${stagingKey} (một lần)...`);
    const tUpload = Date.now();
    const up = spawnSync('aws', ['s3', 'cp', source, `s3://${RAW_BUCKET}/${stagingKey}`, '--region', REGION, '--only-show-errors'], { stdio: 'inherit' });
    if (up.status !== 0) throw new Error('Tải nguồn thất bại');
    const uploadSeconds = Math.round((Date.now() - tUpload) / 1000);
    console.log(`  xong sau ${fmt(uploadSeconds)}`);

    for (let i = 0; i < COUNT; i += 1) {
      const doc = await Video.create({
        title: `burst ${STAGE} ${LABEL} ${i + 1}/${COUNT}`,
        description: 'Video thử đồng thời; xoá tự động khi đo xong',
        user: userId,
        status: 'UPLOADING',
        visibility: 'private',
        category: 'Khác',
        mimeType: 'video/mp4',
        fileSize: fs.statSync(source).size,
      });
      const key = `videos/${userId}/${doc._id}/${base}`;
      await Video.updateOne({ _id: doc._id }, { $set: { rawS3Key: key } });
      docs.push({ id: String(doc._id), key });
    }

    console.log(`Sao chép ${COUNT} bản (tối đa ${COPY_CONCURRENCY} song song) để kích hoạt ${COUNT} sự kiện...`);
    const tStart = Date.now();
    const arrived = await pool(docs, COPY_CONCURRENCY, (d) => copyObject(`s3://${RAW_BUCKET}/${stagingKey}`, `s3://${RAW_BUCKET}/${d.key}`));
    const firstArrival = Math.min(...arrived);
    const lastArrival = Math.max(...arrived);
    console.log(`  ${COUNT} sự kiện đến trong ${fmt((lastArrival - firstArrival) / 1000)} (sao chép mất ${fmt((lastArrival - tStart) / 1000)})`);

    // Chờ mọi video READY hoặc ERROR.
    const readyAt = new Map();
    const finalStatus = new Map();
    const deadline = Date.now() + TIMEOUT_MS;
    let lastLine = '';
    while (Date.now() < deadline && finalStatus.size < COUNT) {
      await sleep(15000);
      const rows = await Video.find({ _id: { $in: docs.map((d) => d.id) } }).select('status updatedAt').lean();
      const counts = {};
      for (const r of rows) {
        counts[r.status] = (counts[r.status] || 0) + 1;
        if ((r.status === 'READY' || r.status === 'ERROR') && !finalStatus.has(String(r._id))) {
          finalStatus.set(String(r._id), r.status);
          readyAt.set(String(r._id), new Date(r.updatedAt).getTime());
        }
      }
      const line = `[${fmt((Date.now() - firstArrival) / 1000)}] ${JSON.stringify(counts)}`;
      if (line !== lastLine) {
        console.log(line);
        lastLine = line;
      }
    }
    if (finalStatus.size < COUNT) console.log(`CẢNH BÁO: hết hạn chờ, ${COUNT - finalStatus.size} video chưa xong.`);

    // Chờ job cuối kết thúc để đếm vCPU-giây đủ.
    await sleep(45000);
    const { parents, children } = collectJobs(docs.map((d) => d.id));
    let vcpuSeconds = 0;
    for (const j of [...parents.filter((p) => !(p.arrayProperties && p.arrayProperties.size)), ...children]) {
      if (j.startedAt && j.stoppedAt) vcpuSeconds += ((j.stoppedAt - j.startedAt) / 1000) * vcpuOf(j);
    }

    const byVideo = docs.map((d, i) => {
      const kids = children.filter((c) => c.videoId === d.id && c.startedAt && c.stoppedAt);
      return {
        id: d.id,
        index: i + 1,
        arrivedAt: arrived[i],
        readyAt: readyAt.get(d.id) || null,
        status: finalStatus.get(d.id) || 'TIMEOUT',
        chunkCount: kids.length,
        chunkStart: kids.length ? Math.min(...kids.map((c) => c.startedAt)) : null,
        chunkEnd: kids.length ? Math.max(...kids.map((c) => c.stoppedAt)) : null,
      };
    });
    const ready = byVideo.filter((v) => v.status === 'READY' && v.readyAt);
    ready.sort((a, b) => a.readyAt - b.readyAt);
    ready.forEach((v, rank) => { v.position = rank + 1; });

    const latencies = ready.map((v) => (v.readyAt - v.arrivedAt) / 1000).sort((a, b) => a - b);
    const makespan = ready.length ? (Math.max(...ready.map((v) => v.readyAt)) - firstArrival) / 1000 : null;
    const summary = {
      ready: ready.length,
      failed: byVideo.filter((v) => v.status !== 'READY').length,
      makespanSeconds: makespan ? Math.round(makespan) : null,
      latencyP50: latencies.length ? Math.round(quantile(latencies, 0.5)) : null,
      latencyP95: latencies.length ? Math.round(quantile(latencies, 0.95)) : null,
      latencyMax: latencies.length ? Math.round(latencies[latencies.length - 1]) : null,
      throughputPerMinute: makespan ? Number(((ready.length / makespan) * 60).toFixed(2)) : null,
      vcpuHours: Number((vcpuSeconds / 3600).toFixed(2)),
    };
    console.log('\n── Kết quả ─────────────────────────────────────');
    console.log(JSON.stringify(summary));

    if (has('write')) {
      const date = new Date().toISOString().slice(0, 10);
      const durationS = Number(flag('duration-s', 0)) || null;
      const file = path.join(__dirname, '..', '..', 'docs', 'results', 'runs', `${date}-${STAGE.toLowerCase()}-burst.json`);
      const common = {
        date,
        account: 'B',
        region: REGION,
        environment: PREFIX.replace('dacntt-', ''),
        capacity: { spot_max_vcpus: SPOT_VCPUS, ondemand_max_vcpus: ONDEMAND_VCPUS },
        video: { label: LABEL, duration_s: durationS, size_gib: Number((fs.statSync(source).size / 1073741824).toFixed(3)), resolution: flag('resolution', '1920x1080'), fps: 30 },
        concurrency: COUNT,
        measured_from: 'first_event_arrival',
        provenance: 'measured',
        source: `transcoder/scripts/staging-burst-test.js (${STAGE})`,
      };
      const perVideo = ready.map((v) => ({
        ...common,
        id: `${date}-staging-${STAGE.toLowerCase()}-${LABEL}-v${v.index}`,
        path: v.chunkCount ? 'chunked' : 'single',
        chunk: v.chunkCount ? { vcpu: 4, memory_mib: null, count: v.chunkCount, slots: null, gops_per_chunk: null } : null,
        queue_position: v.position,
        timings_s: {
          arrival_offset: Math.round((v.arrivedAt - firstArrival) / 1000),
          ...(v.chunkStart ? { chunks_start: Math.round((v.chunkStart - firstArrival) / 1000), chunks_end: Math.round((v.chunkEnd - firstArrival) / 1000) } : {}),
          latency_from_arrival: Math.round((v.readyAt - v.arrivedAt) / 1000),
          end_to_end: Math.round((v.readyAt - firstArrival) / 1000),
        },
        result: { final_status: 'READY', hls_verified: false },
        notes: `Video ${v.index}/${COUNT} của đợt ${STAGE}; end_to_end tính từ lúc sự kiện đầu tiên đến.`,
      }));
      const aggregate = {
        ...common,
        id: `${date}-staging-${STAGE.toLowerCase()}-${LABEL}-summary`,
        path: 'burst',
        chunk: null,
        timings_s: { upload_source: uploadSeconds, end_to_end: summary.makespanSeconds, latency_p50: summary.latencyP50, latency_p95: summary.latencyP95, latency_max: summary.latencyMax },
        vcpu_seconds: Math.round(vcpuSeconds),
        vcpu_seconds_scope: 'all_jobs',
        result: { final_status: summary.failed === 0 ? 'READY' : 'PARTIAL', hls_verified: false, ready: summary.ready, failed: summary.failed, throughput_per_minute: summary.throughputPerMinute },
        notes: `Tổng hợp cả đợt ${COUNT} video; end_to_end là thời gian cả đợt (từ sự kiện đầu tiên đến video READY cuối cùng).`,
      };
      const records = [...perVideo, aggregate];
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify({ schema: 1, title: `${STAGE}: ${COUNT} video ${LABEL} cùng lúc (staging)`, runs: records }, null, 2)}\n`, 'utf-8');
      console.log(`Đã ghi ${path.relative(process.cwd(), file)}`);
    }

    if (ready.length && has('verify')) {
      console.log('Kiểm HLS video đầu tiên...');
      const r = spawnSync('node', [path.join(__dirname, 'staging-chunked-test.js'), 'verify', ready[0].id, '--prefix', PREFIX, '--region', REGION], { encoding: 'utf-8', maxBuffer: 1 << 26 });
      console.log((r.stdout || '').split('\n').filter((l) => /[✓✗]/.test(l)).join('\n'));
    }

    if (summary.failed > 0) process.exitCode = 3;
  } finally {
    if (!has('keep')) {
      console.log('Dọn video thử và tệp trên S3...');
      try {
        aws('s3', 'rm', `s3://${RAW_BUCKET}/bench/`, '--recursive', '--only-show-errors');
        aws('s3', 'rm', `s3://${RAW_BUCKET}/videos/${userId}/`, '--recursive', '--only-show-errors');
        await pool(docs, 8, async (d) => {
          try {
            aws('s3', 'rm', `s3://${PROCESSED_BUCKET}/videos/${d.id}/`, '--recursive', '--only-show-errors');
            aws('s3', 'rm', `s3://${RAW_BUCKET}/work/${d.id}/`, '--recursive', '--only-show-errors');
          } catch (error) {
            console.warn(`  dọn ${d.id} chưa trọn vẹn: ${error.message}`);
          }
        });
        await Video.deleteMany({ _id: { $in: docs.map((d) => d.id) } });
      } catch (error) {
        console.warn(`Dọn dẹp chưa trọn vẹn: ${error.message}`);
      }
    }
    await mongoose.disconnect();
    await switchOff();
  }
};

main().catch((error) => {
  console.error('✗', error.message);
  process.exit(1);
});
