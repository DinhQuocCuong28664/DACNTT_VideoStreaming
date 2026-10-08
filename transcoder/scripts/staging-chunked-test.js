#!/usr/bin/env node
/**
 * Thử pipeline chia đoạn trên AWS thật (staging) mà không cần giao diện hay backend.
 *
 *   node scripts/staging-chunked-test.js create <tep.mp4>      tạo video thử, tải tệp lên bucket raw
 *   node scripts/staging-chunked-test.js watch  <videoId>      theo dõi trạng thái video và các job Batch
 *   node scripts/staging-chunked-test.js verify <videoId>      kiểm tra kết quả đã lên bucket processed
 *   node scripts/staging-chunked-test.js remove <videoId>      xoá video thử và mọi thứ nó để lại
 *
 * Tuỳ chọn: --prefix dacntt-staging  --region ap-southeast-1
 *
 * Đi đúng đường production: tải lên bucket raw (multipart tự động của AWS CLI) → S3 event → SQS →
 * Lambda → Batch. Chỉ có bản ghi Video là tạo trực tiếp trong MongoDB (database `vidshare-staging`), với
 * chủ video giả: không có người nhận nên job ghép không gửi email.
 *
 * Cần: AWS CLI đã đăng nhập vào tài khoản staging, ffprobe (cho `verify`).
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const [command, target] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const PREFIX = flag('prefix', 'dacntt-staging');
const REGION = flag('region', 'ap-southeast-1');
const RAW_BUCKET = `${PREFIX}-raw-bucket`;
const PROCESSED_BUCKET = `${PREFIX}-processed-bucket`;
// Job đoạn nằm ở hàng đợi ưu tiên thấp, các job còn lại ở hàng đợi chính.
const QUEUES = [`${PREFIX}-transcode-queue`, `${PREFIX}-transcode-bulk-queue`];

const aws = (...cliArgs) => {
  const r = spawnSync('aws', [...cliArgs, '--region', REGION], { encoding: 'utf-8', maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`aws ${cliArgs.slice(0, 2).join(' ')} thất bại: ${(r.stderr || '').trim().slice(0, 300)}`);
  return r.stdout;
};
const awsJson = (...cliArgs) => JSON.parse(aws(...cliArgs, '--output', 'json'));

const connect = async () => {
  const mongoose = require('mongoose');
  const uri = aws('secretsmanager', 'get-secret-value', '--secret-id', `${PREFIX}/mongodb-uri`, '--query', 'SecretString', '--output', 'text').trim();
  if (!uri.includes('/vidshare-staging')) throw new Error('URI không trỏ vào database vidshare-staging; dừng để không ghi nhầm vào dữ liệu thật');
  await mongoose.connect(uri);
  return mongoose;
};

const videoModel = (mongoose) => mongoose.models.Video || mongoose.model('Video', new mongoose.Schema({}, { strict: false, timestamps: true }), 'videos');

const fmt = (seconds) => `${Math.floor(seconds / 60)}m${String(Math.round(seconds % 60)).padStart(2, '0')}s`;

const create = async (file) => {
  if (!file || !fs.existsSync(file)) throw new Error('Cần đường dẫn tới tệp video');
  const mongoose = await connect();
  const Video = videoModel(mongoose);
  const userId = new mongoose.Types.ObjectId();
  const video = await Video.create({
    title: `chunked-test ${path.basename(file)} ${new Date().toISOString()}`,
    description: 'Video thử pipeline chia đoạn; xoá bằng scripts/staging-chunked-test.js remove',
    user: userId,
    status: 'UPLOADING',
    visibility: 'private',
    category: 'Khác',
    mimeType: 'video/mp4',
    fileSize: fs.statSync(file).size,
  });
  const key = `videos/${userId}/${video._id}/${path.basename(file)}`;
  await Video.updateOne({ _id: video._id }, { $set: { rawS3Key: key } });
  await mongoose.disconnect();

  console.log(`videoId: ${video._id}\nkhoá raw: s3://${RAW_BUCKET}/${key}\nTải lên ${(fs.statSync(file).size / 1073741824).toFixed(2)} GiB (multipart tự động)...`);
  const started = Date.now();
  const up = spawnSync('aws', ['s3', 'cp', file, `s3://${RAW_BUCKET}/${key}`, '--region', REGION, '--only-show-errors'], { stdio: 'inherit' });
  if (up.status !== 0) throw new Error('Tải lên thất bại');
  console.log(`Đã tải lên sau ${fmt((Date.now() - started) / 1000)}. S3 event sẽ kích hoạt Lambda → Batch.\nTheo dõi: node scripts/staging-chunked-test.js watch ${video._id}`);
};

const JOB_STATUSES = ['SUBMITTED', 'PENDING', 'RUNNABLE', 'STARTING', 'RUNNING', 'SUCCEEDED', 'FAILED'];

/** Gom job Batch của một video theo vai trò và trạng thái. */
const batchSummary = (videoId) => {
  const rows = [];
  for (const queue of QUEUES) {
    for (const status of JOB_STATUSES) {
      const jobs = awsJson('batch', 'list-jobs', '--job-queue', queue, '--job-status', status, '--query', 'jobSummaryList[].{id:jobId,name:jobName,array:arrayProperties}');
      for (const j of jobs) if (j.name.includes(videoId)) rows.push({ ...j, status });
    }
  }
  const role = (name) => name.replace(`-${videoId}`, '').replace(/^transcode$/, 'planner').replace(/^transcode-.*/, 'planner');
  const summary = {};
  for (const j of rows) {
    const r = role(j.name);
    summary[r] = summary[r] || {};
    summary[r][j.status] = (summary[r][j.status] || 0) + 1;
  }
  const arrayJob = rows.find((j) => j.name.startsWith('chunks-'));
  if (arrayJob) {
    const detail = awsJson('batch', 'describe-jobs', '--jobs', arrayJob.id, '--query', 'jobs[0].arrayProperties');
    summary['chunks (con)'] = detail.statusSummary;
  }
  return summary;
};

const watch = async (videoId) => {
  const mongoose = await connect();
  const Video = videoModel(mongoose);
  const started = Date.now();
  let last = '';
  for (;;) {
    const video = await Video.findById(videoId).lean();
    if (!video) throw new Error('Video không còn tồn tại');
    const summary = batchSummary(videoId);
    const line = `${video.status}  ${JSON.stringify(summary)}`;
    if (line !== last) {
      console.log(`[${fmt((Date.now() - started) / 1000)}] ${line}`);
      last = line;
    }
    if (video.status === 'READY' || video.status === 'ERROR') {
      console.log(`\nKết thúc: ${video.status} sau ${fmt((Date.now() - started) / 1000)} (tính từ lúc bắt đầu theo dõi)`);
      if (video.status === 'ERROR') console.log('Xem log CloudWatch của các job để biết lý do.');
      if (video.status === 'READY') console.log(`duration=${video.duration}s hlsUrl=${video.hlsUrl}`);
      break;
    }
    await new Promise((r) => setTimeout(r, 30000));
  }
  await mongoose.disconnect();
};

const verify = async (videoId) => {
  const mongoose = await connect();
  const video = await videoModel(mongoose).findById(videoId).lean();
  await mongoose.disconnect();
  if (!video || video.status !== 'READY') throw new Error(`Video chưa READY (${video && video.status})`);

  const prefix = `videos/${videoId}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'staging-verify-'));
  console.log(`Tải master và rendition nhỏ nhất về ${dir} ...`);
  aws('s3', 'cp', `s3://${PROCESSED_BUCKET}/${prefix}/master.m3u8`, path.join(dir, 'master.m3u8'));
  const master = fs.readFileSync(path.join(dir, 'master.m3u8'), 'utf-8');
  const variants = [...master.matchAll(/#EXT-X-STREAM-INF:([^\n]*)\n(\S+)/g)].map((m) => ({ attrs: m[1], uri: m[2], name: m[2].split('/')[0] }));
  console.log(`master: ${variants.length} mức`);
  for (const v of variants) console.log(`  ${v.name.padEnd(6)} ${v.attrs}`);

  const results = [];
  for (const v of variants) {
    const listing = aws('s3api', 'list-objects-v2', '--bucket', PROCESSED_BUCKET, '--prefix', `${prefix}/${v.name}/`, '--query', 'Contents[].Key', '--output', 'json');
    const keys = JSON.parse(listing) || [];
    const segmentCount = keys.filter((k) => k.endsWith('.ts')).length;
    aws('s3', 'cp', `s3://${PROCESSED_BUCKET}/${prefix}/${v.name}/playlist.m3u8`, path.join(dir, `${v.name}.m3u8`));
    const text = fs.readFileSync(path.join(dir, `${v.name}.m3u8`), 'utf-8');
    const entries = [...text.matchAll(/#EXTINF:([\d.]+),\n(\S+)/g)];
    const total = entries.reduce((t, m) => t + Number(m[1]), 0);
    const files = new Set(keys.map((k) => k.split('/').pop()));
    const missing = entries.filter((m) => !files.has(m[2])).length;
    const durations = entries.map((m) => Number(m[1]));
    results.push({ name: v.name, segments: entries.length, onS3: segmentCount, missing, total, max: Math.max(...durations) });
  }
  console.log('\nmức     segment trong playlist / trên S3 / thiếu   tổng thời lượng   segment dài nhất');
  for (const r of results) {
    console.log(`${r.name.padEnd(7)} ${String(r.segments).padStart(6)} / ${String(r.onS3).padStart(6)} / ${r.missing}      ${r.total.toFixed(3)}s      ${r.max.toFixed(3)}s`);
  }
  const ok =
    results.every((r) => r.missing === 0 && r.segments === results[0].segments) &&
    results.every((r) => Math.abs(r.total - video.duration) < 0.5);
  console.log(`\nthời lượng video trong DB: ${video.duration}s`);
  console.log(ok ? '✓ playlist đủ segment, mọi mức cùng số segment, tổng thời lượng khớp video' : '✗ CÓ SAI LỆCH');

  const smallest = variants[0].name;
  console.log(`\nTải rendition ${smallest} để kiểm gói tin (có thể mất vài phút)...`);
  aws('s3', 'sync', `s3://${PROCESSED_BUCKET}/${prefix}/${smallest}/`, path.join(dir, smallest), '--only-show-errors');
  fs.copyFileSync(path.join(dir, `${smallest}.m3u8`), path.join(dir, smallest, 'playlist.m3u8'));
  const { packets, gaps, AAC_FRAME_MS } = require('./lib/analyze');
  const playlist = path.join(dir, smallest, 'playlist.m3u8');
  const vGaps = gaps(packets(playlist, 'v:0'), 0.002);
  const aGaps = gaps(packets(playlist, 'a:0'), 0.002);
  const aHoles = aGaps.filter((g) => g.ms > 0);
  const aBad = aGaps.filter((g) => g.ms < 0 && Math.abs(g.ms + AAC_FRAME_MS) > 1);
  console.log(`  ${smallest}: khe hở/chồng lấn hình >2ms: ${vGaps.length}${vGaps.length ? ' ' + JSON.stringify(vGaps.slice(0, 5)) : ''}`);
  console.log(`  ${smallest}: khe hở tiếng: ${aHoles.length}, chồng lấn bất thường: ${aBad.length}`);
  console.log(vGaps.length === 0 && aHoles.length === 0 && aBad.length === 0 ? '✓ hình và tiếng liền mạch qua mọi ranh giới đoạn' : '✗ CÓ GIÁN ĐOẠN');

  const left = JSON.parse(aws('s3api', 'list-objects-v2', '--bucket', RAW_BUCKET, '--prefix', `work/${videoId}/`, '--query', 'Contents[].Key', '--output', 'json')) || [];
  console.log(left.length === 0 ? '✓ tệp tạm work/ đã được dọn' : `✗ còn ${left.length} tệp tạm ở work/${videoId}/`);
  fs.rmSync(dir, { recursive: true, force: true });
};

const remove = async (videoId) => {
  const mongoose = await connect();
  const Video = videoModel(mongoose);
  const video = await Video.findById(videoId).lean();
  if (video && video.rawS3Key) aws('s3', 'rm', `s3://${RAW_BUCKET}/${video.rawS3Key}`, '--only-show-errors');
  aws('s3', 'rm', `s3://${PROCESSED_BUCKET}/videos/${videoId}/`, '--recursive', '--only-show-errors');
  aws('s3', 'rm', `s3://${RAW_BUCKET}/work/${videoId}/`, '--recursive', '--only-show-errors');
  await Video.deleteOne({ _id: videoId });
  await mongoose.disconnect();
  console.log(`Đã xoá video thử ${videoId} cùng tệp nguồn, kết quả và tệp tạm.`);
};

const commands = { create, watch, verify, remove };
if (!commands[command]) {
  console.error('Cách dùng: node scripts/staging-chunked-test.js <create|watch|verify|remove> <tệp|videoId> [--prefix dacntt-staging]');
  process.exit(2);
}
commands[command](target).catch((err) => {
  console.error('✗', err.message);
  process.exit(1);
});
