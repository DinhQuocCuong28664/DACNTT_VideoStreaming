#!/usr/bin/env node
/**
 * Sửa `hlsUrl` và `thumbnailUrl` của những video còn trỏ sai tên miền CDN.
 *
 * ============================================================================
 * BỐI CẢNH
 * ============================================================================
 * Transcoder ghi cứng URL đầy đủ vào MongoDB tại thời điểm chuyển mã, lấy từ
 * biến môi trường `CLOUDFRONT_DOMAIN` (xem `transcoder/src/config.js`,
 * `getPublicUrl`). Trước khi tên miền `cdn.zelostech.site` được chốt, biến này
 * từng mang giá trị khác, nên một số bản ghi cũ còn giữ:
 *
 *   https://d3t2erh3gj5o9o.cloudfront.net/videos/<id>/master.m3u8
 *   https://dacntt-dev-processed-bucket.s3.ap-southeast-1.amazonaws.com/...
 *
 * Cả hai đều KHÔNG phát được nữa. Signed Cookie do backend cấp có phạm vi
 * `https://cdn.zelostech.site/videos/<id>/*`, và trình duyệt chỉ gửi cookie
 * cho đúng tên miền đã đặt — nên request sang tên miền khác không mang cookie
 * và CloudFront trả 403 `MissingKey`. Đường dẫn S3 trực tiếp cũng 403 vì
 * bucket đã đóng hoàn toàn sau Origin Access Control.
 *
 * ============================================================================
 * VÌ SAO CHỈ CẦN CHẠY MỘT LẦN
 * ============================================================================
 * Nguyên nhân gốc đã được xử lý: AWS Batch Job Definition đang hoạt động
 * truyền `CLOUDFRONT_DOMAIN = cdn.zelostech.site`, nên mọi video chuyển mã từ
 * nay đều ghi đúng. Script này chỉ dọn các bản ghi lịch sử. Kiểm tra lại giá
 * trị đang chạy bằng:
 *
 *   aws batch describe-job-definitions --job-definition-name dacntt-dev-transcoder-job \
 *     --status ACTIVE --query 'reverse(sort_by(jobDefinitions,&revision))[0].containerProperties.environment'
 *
 * ============================================================================
 * AN TOÀN
 * ============================================================================
 * - Mặc định CHỈ CHẠY THỬ, không ghi gì. Phải thêm `--apply` mới sửa thật.
 * - Trước khi đổi một URL, script gọi `HeadObject` để xác minh tệp THỰC SỰ tồn
 *   tại trong S3. Không xác minh thì rất dễ biến một URL hỏng thành một URL
 *   trông có vẻ đúng nhưng vẫn 404 — còn khó lần ra hơn lúc đầu.
 * - Bản ghi nào đã đúng thì không đụng tới.
 * - Không thể xác minh qua chính CDN, vì thiếu Signed Cookie thì CloudFront
 *   trả 403 bất kể tệp có tồn tại hay không.
 *
 * ============================================================================
 * CÁCH DÙNG
 * ============================================================================
 *   node backend/scripts/fix-cdn-urls.js            # chạy thử, chỉ xem
 *   node backend/scripts/fix-cdn-urls.js --apply    # sửa thật
 *   node backend/scripts/fix-cdn-urls.js --apply --yes   # bỏ qua xác nhận
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });

const mongoose = require('mongoose');
const readline = require('readline');
const { S3Client, HeadObjectCommand } = require('@aws-sdk/client-s3');
const Video = require('../src/models/Video');

const URL_FIELDS = ['hlsUrl', 'thumbnailUrl'];

const s3 = new S3Client({
  region: process.env.AWS_REGION || 'ap-southeast-1',
  ...(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
      }
    : {}),
});

/**
 * Tách S3 key ra khỏi một URL công khai bất kỳ.
 *
 * Xử lý được cả ba dạng đã gặp trong dữ liệu:
 *   https://cdn.zelostech.site/videos/<id>/master.m3u8          → videos/<id>/master.m3u8
 *   https://xxxx.cloudfront.net/videos/<id>/master.m3u8          → videos/<id>/master.m3u8
 *   https://<bucket>.s3.<region>.amazonaws.com/videos/<id>/...   → videos/<id>/...
 *
 * Dạng path-style (https://s3.<region>.amazonaws.com/<bucket>/<key>) cũng được
 * tính đến: khi ấy đoạn đường dẫn đầu tiên là tên bucket, phải bỏ đi.
 */
const extractS3Key = (rawUrl) => {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  const segments = parsed.pathname.replace(/^\/+/, '').split('/');
  if (segments.length === 0 || segments[0] === '') return null;

  // Path-style S3: bucket nằm trong đường dẫn chứ không nằm trong hostname.
  if (/^s3[.-]/.test(parsed.hostname)) segments.shift();

  const key = segments.join('/');
  return key || null;
};

/**
 * Object có thật trong bucket không.
 *
 * Đây là bước then chốt: nó phân biệt "bản ghi trỏ sai tên miền nhưng tệp vẫn
 * còn" (sửa được) với "tệp đã mất hẳn" (sửa URL cũng vô nghĩa).
 */
const objectExists = async (bucket, key) => {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) return false;
    // 403 thường nghĩa là thiếu quyền ListBucket chứ không phải tệp không có.
    // Báo lên để người chạy tự quyết, thay vì lặng lẽ coi như không tồn tại.
    throw new Error(`HeadObject ${key} lỗi: ${err.name} — ${err.message}`);
  }
};

const confirm = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^(y|yes|c|co|có)$/i.test(answer.trim()));
    });
  });

const main = async () => {
  const apply = process.argv.includes('--apply');
  const skipPrompt = process.argv.includes('--yes');

  const domain = process.env.CLOUDFRONT_DOMAIN;
  const bucket = process.env.S3_PROCESSED_BUCKET_NAME;

  if (!domain) throw new Error('Thiếu CLOUDFRONT_DOMAIN trong backend/.env');
  if (!bucket) throw new Error('Thiếu S3_PROCESSED_BUCKET_NAME trong backend/.env');
  if (!process.env.MONGODB_URI) throw new Error('Thiếu MONGODB_URI trong backend/.env');

  const prefix = `https://${domain}/`;

  console.log('════════════════════════════════════════════════');
  console.log('  SỬA URL CDN CỦA VIDEO');
  console.log('════════════════════════════════════════════════');
  console.log(`  Tên miền đích : ${domain}`);
  console.log(`  Bucket        : ${bucket}`);
  console.log(`  Chế độ        : ${apply ? '⚠️  GHI THẬT' : 'chạy thử (không ghi gì)'}`);
  console.log('');

  await mongoose.connect(process.env.MONGODB_URI);

  const videos = await Video.find({}).select(`_id title status ${URL_FIELDS.join(' ')}`).lean();
  console.log(`Đã đọc ${videos.length} video.\n`);

  const planned = [];
  const missing = [];
  const failed = [];
  let alreadyOk = 0;

  for (const video of videos) {
    const changes = {};

    for (const field of URL_FIELDS) {
      const current = video[field];
      if (!current || current.startsWith(prefix)) continue;

      const key = extractS3Key(current);
      if (!key) {
        failed.push({ video, field, reason: `không tách được S3 key từ "${current}"` });
        continue;
      }

      let exists;
      try {
        exists = await objectExists(bucket, key);
      } catch (err) {
        failed.push({ video, field, reason: err.message });
        continue;
      }

      if (!exists) {
        missing.push({ video, field, key });
        continue;
      }

      changes[field] = { from: current, to: prefix + key };
    }

    if (Object.keys(changes).length > 0) planned.push({ video, changes });
    else if (URL_FIELDS.every((f) => !video[f] || video[f].startsWith(prefix))) alreadyOk += 1;
  }

  console.log(`✅ Đã đúng sẵn        : ${alreadyOk}`);
  console.log(`🔧 Sẽ sửa             : ${planned.length}`);
  console.log(`🕳️  Tệp không còn      : ${missing.length}`);
  console.log(`❌ Không xử lý được   : ${failed.length}`);
  console.log('');

  for (const { video, changes } of planned) {
    console.log(`  ${video._id}  ${(video.title || '').slice(0, 32)}`);
    for (const [field, { from, to }] of Object.entries(changes)) {
      console.log(`     ${field}`);
      console.log(`        cũ : ${from}`);
      console.log(`        mới: ${to}`);
    }
  }

  if (missing.length) {
    console.log('\n🕳️  Những video sau trỏ sai tên miền NHƯNG tệp cũng không còn trong S3.');
    console.log('   Đổi URL cũng vô ích — cần chuyển mã lại hoặc xoá hẳn bản ghi:');
    for (const { video, field, key } of missing) {
      console.log(`     ${video._id}  ${field}  →  ${key}  (không tìm thấy)`);
    }
  }

  if (failed.length) {
    console.log('\n❌ Không xử lý được:');
    for (const { video, field, reason } of failed) {
      console.log(`     ${video._id}  ${field}  ${reason}`);
    }
  }

  if (!apply) {
    console.log('\nĐây là lần chạy thử, KHÔNG có gì được ghi.');
    console.log('Muốn sửa thật thì chạy lại kèm --apply');
    await mongoose.disconnect();
    return;
  }

  if (planned.length === 0) {
    console.log('\nKhông có gì để sửa.');
    await mongoose.disconnect();
    return;
  }

  if (!skipPrompt) {
    const ok = await confirm(`\n⚠️  Ghi thay đổi cho ${planned.length} video vào MongoDB? (y/N) `);
    if (!ok) {
      console.log('Đã huỷ, không ghi gì.');
      await mongoose.disconnect();
      return;
    }
  }

  let updated = 0;
  for (const { video, changes } of planned) {
    const set = {};
    for (const [field, { to }] of Object.entries(changes)) set[field] = to;

    await Video.updateOne({ _id: video._id }, { $set: set });
    updated += 1;
    console.log(`  ✔ ${video._id}`);
  }

  console.log(`\nĐã cập nhật ${updated} video.`);
  console.log('Kiểm chứng lại bằng cách mở trang xem một trong số đó,');
  console.log('hoặc chạy lại script này — lần sau phải báo "Sẽ sửa: 0".');

  await mongoose.disconnect();
};

main().catch(async (err) => {
  console.error('\n❌ Lỗi:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
