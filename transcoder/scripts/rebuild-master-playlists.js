#!/usr/bin/env node
/**
 * Dựng lại `master.m3u8` cho những video ĐÃ chuyển mã, với BANDWIDTH đo từ
 * chính các segment có thật trong S3.
 *
 * ============================================================================
 * BỐI CẢNH
 * ============================================================================
 * Trước bản sửa trong `generateMasterPlaylist`, BANDWIDTH được cộng thẳng từ
 * hai hằng số mục tiêu trong `config.js` (`videoBitrate + audioBitrate`) và
 * không hề nhìn tới sản phẩm thật của bộ mã hoá. RFC 8216 §4.3.4.2 dùng chữ
 * MUST cho việc này khi các segment đã được tạo xong:
 *
 *   "It represents the peak segment bit rate of the Variant Stream."
 *
 * Đo trên video 6aa1dd6f822dec77e188e56b cho thấy con số khai nằm DƯỚI đỉnh
 * thật 29–37%. hls.js dùng BANDWIDTH để phán đoán một mức có vừa băng thông
 * hay không, nên nó chọn mức nặng hơn đường truyền chịu được rồi nghẽn.
 *
 * ============================================================================
 * VÌ SAO KHÔNG CHUYỂN MÃ LẠI
 * ============================================================================
 * Các segment đều đúng — chỉ mỗi master playlist sai. Chuyển mã lại toàn bộ
 * thư viện tốn hàng giờ Fargate và, quan trọng hơn, sẽ sinh ra segment MỚI;
 * khi ấy phép đo QoE trước và sau không còn so sánh được với nhau nữa vì nội
 * dung đã đổi. Chỉ ghi đè master.m3u8 thì bảo toàn được đúng một biến.
 *
 * ============================================================================
 * AN TOÀN
 * ============================================================================
 * - Mặc định CHỈ CHẠY THỬ. Phải thêm `--apply` mới ghi.
 * - Kích thước segment lấy từ ListObjectsV2, không tải segment về.
 * - Rendition nào thiếu playlist hoặc thiếu segment thì bỏ qua, giữ nguyên
 *   giá trị cũ, và báo lên — thà để nguyên còn hơn ghi một con số bịa.
 * - KHÔNG tự tạo CloudFront invalidation: đó là thao tác tính tiền và có thể
 *   ảnh hưởng người đang xem. Script chỉ in ra lệnh cần chạy.
 *
 * ============================================================================
 * CÁCH DÙNG
 * ============================================================================
 *   node transcoder/scripts/rebuild-master-playlists.js --video <id>
 *   node transcoder/scripts/rebuild-master-playlists.js --video <id> --apply
 *   node transcoder/scripts/rebuild-master-playlists.js --all --apply --yes
 */

const readline = require('readline');
const {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
} = require('@aws-sdk/client-s3');

const config = require('../src/config');
const { parseMediaPlaylist } = require('../src/transcoder');

const s3 = new S3Client({
  region: config.awsRegion,
  ...(config.awsAccessKeyId && config.awsSecretAccessKey
    ? {
        credentials: {
          accessKeyId: config.awsAccessKeyId,
          secretAccessKey: config.awsSecretAccessKey,
        },
      }
    : {}),
});

const BUCKET = config.s3ProcessedBucket;

/** Liệt kê mọi object dưới một prefix, trả về Map "key → số byte". */
const listAll = async (prefix) => {
  const sizes = new Map();
  let token;

  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token })
    );
    for (const obj of res.Contents || []) sizes.set(obj.Key, obj.Size);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return sizes;
};

const getText = async (key) => {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return res.Body.transformToString();
};

/**
 * Đo đỉnh và trung bình của một rendition từ playlist cộng bảng kích thước.
 *
 * Bản song song với `measureVariantBitrates` trong `transcoder.js`: hàm kia
 * đọc đĩa cục bộ, hàm này đọc S3. Phần dễ sai nhất — bóc `#EXTINF` — dùng
 * chung `parseMediaPlaylist` nên không có hai bản luật khác nhau.
 */
const measureFromS3 = (playlistText, sizes, renditionPrefix) => {
  const segments = parseMediaPlaylist(playlistText);

  let totalBytes = 0;
  let totalSeconds = 0;
  let peak = 0;
  let counted = 0;
  let missing = 0;

  for (const { file, duration } of segments) {
    const bytes = sizes.get(renditionPrefix + file);
    if (!duration || duration <= 0 || !bytes || bytes <= 0) {
      missing += 1;
      continue;
    }

    totalBytes += bytes;
    totalSeconds += duration;
    peak = Math.max(peak, (bytes * 8) / duration);
    counted += 1;
  }

  if (counted === 0 || totalSeconds <= 0) return null;

  return {
    peak: Math.ceil(peak), // cận trên: làm tròn lên
    average: Math.round((totalBytes * 8) / totalSeconds),
    segments: counted,
    missing,
  };
};

/** Đọc BANDWIDTH đang khai trong master playlist hiện tại, để đối chiếu. */
const parseExistingBandwidths = (text) => {
  const map = new Map();
  const pattern = /#EXT-X-STREAM-INF:[^\n]*BANDWIDTH=(\d+)[^\n]*NAME="([^"]+)"/g;
  let m = pattern.exec(text);

  while (m !== null) {
    map.set(m[2], Number(m[1]));
    m = pattern.exec(text);
  }

  return map;
};

/** Dựng nội dung master.m3u8 — giữ đúng định dạng của `generateMasterPlaylist`. */
const buildMaster = (entries) => {
  let content = '#EXTM3U\n#EXT-X-VERSION:3\n\n';

  for (const e of entries) {
    content += `#EXT-X-STREAM-INF:BANDWIDTH=${e.bandwidth},RESOLUTION=${e.width}x${e.height},NAME="${e.name}"\n`;
    content += `${e.name}/playlist.m3u8\n\n`;
  }

  return content;
};

const processVideo = async (videoId) => {
  const prefix = `videos/${videoId}/`;
  const sizes = await listAll(prefix);

  if (sizes.size === 0) return { videoId, skipped: 'không có object nào trong S3' };
  if (!sizes.has(`${prefix}master.m3u8`)) return { videoId, skipped: 'không có master.m3u8' };

  const existing = parseExistingBandwidths(await getText(`${prefix}master.m3u8`));
  const entries = [];
  const problems = [];

  for (const r of config.ffmpeg.renditions) {
    const renditionPrefix = `${prefix}${r.name}/`;
    const playlistKey = `${renditionPrefix}playlist.m3u8`;

    if (!sizes.has(playlistKey)) continue; // rendition không tồn tại cho video này

    const stats = measureFromS3(await getText(playlistKey), sizes, renditionPrefix);
    const declared = parseInt(r.videoBitrate) * 1000 + parseInt(r.audioBitrate) * 1000;
    const before = existing.get(r.name) ?? declared;

    if (!stats) {
      problems.push(`${r.name}: không đo được, giữ nguyên ${before}`);
      entries.push({ name: r.name, width: r.width, height: r.height, bandwidth: before, stats: null, before });
      continue;
    }

    if (stats.missing > 0) {
      problems.push(`${r.name}: ${stats.missing} segment khai trong playlist nhưng không có trong S3`);
    }

    entries.push({
      name: r.name,
      width: r.width,
      height: r.height,
      bandwidth: stats.peak,
      stats,
      before,
    });
  }

  if (entries.length === 0) return { videoId, skipped: 'không tìm thấy rendition nào' };

  return { videoId, prefix, entries, problems, content: buildMaster(entries) };
};

const confirm = (question) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(/^(y|yes|c|co|có)$/i.test(answer.trim()));
    });
  });

/** Liệt kê id của mọi video có trong bucket. */
const listVideoIds = async () => {
  const ids = new Set();
  let token;

  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: 'videos/',
        Delimiter: '/',
        ContinuationToken: token,
      })
    );
    for (const p of res.CommonPrefixes || []) {
      const id = p.Prefix.replace(/^videos\//, '').replace(/\/$/, '');
      if (id) ids.add(id);
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  return [...ids];
};

const main = async () => {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const skipPrompt = argv.includes('--yes');
  const all = argv.includes('--all');
  const videoArg = argv.includes('--video') ? argv[argv.indexOf('--video') + 1] : null;

  if (!all && !videoArg) {
    console.error('Cần --video <id> hoặc --all');
    process.exit(1);
  }

  console.log('════════════════════════════════════════════════');
  console.log('  DỰNG LẠI MASTER PLAYLIST (BANDWIDTH đo thật)');
  console.log('════════════════════════════════════════════════');
  console.log(`  Bucket : ${BUCKET}`);
  console.log(`  Chế độ : ${apply ? '⚠️  GHI THẬT' : 'chạy thử (không ghi gì)'}`);
  console.log('');

  const ids = all ? await listVideoIds() : [videoArg];
  const changed = [];

  for (const id of ids) {
    const result = await processVideo(id);

    if (result.skipped) {
      console.log(`  ${id}  — bỏ qua: ${result.skipped}`);
      continue;
    }

    const diffs = result.entries.filter((e) => e.stats && e.bandwidth !== e.before);
    if (diffs.length === 0) {
      console.log(`  ${id}  — đã đúng sẵn`);
      continue;
    }

    console.log(`  ${id}`);
    for (const e of result.entries) {
      if (!e.stats) {
        console.log(`     ${e.name.padEnd(6)} ${String(e.before).padStart(8)} → (giữ nguyên, không đo được)`);
        continue;
      }
      const delta = ((e.bandwidth / e.before - 1) * 100).toFixed(0);
      console.log(
        `     ${e.name.padEnd(6)} ${String(e.before).padStart(8)} → ${String(e.bandwidth).padStart(8)} bit/s ` +
          `(${delta > 0 ? '+' : ''}${delta}%, TB ${e.stats.average}, ${e.stats.segments} segment)`
      );
    }
    for (const p of result.problems) console.log(`     ⚠️  ${p}`);

    changed.push(result);
  }

  console.log('');
  console.log(`Cần cập nhật: ${changed.length}/${ids.length} video`);

  if (!apply) {
    console.log('\nĐây là lần chạy thử, KHÔNG có gì được ghi.');
    console.log('Muốn ghi thật thì chạy lại kèm --apply');
    return;
  }

  if (changed.length === 0) return;

  if (!skipPrompt) {
    const ok = await confirm(`\n⚠️  Ghi đè master.m3u8 của ${changed.length} video? (y/N) `);
    if (!ok) {
      console.log('Đã huỷ, không ghi gì.');
      return;
    }
  }

  for (const result of changed) {
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: `${result.prefix}master.m3u8`,
        Body: result.content,
        ContentType: 'application/vnd.apple.mpegurl',
      })
    );
    console.log(`  ✔ ${result.videoId}`);
  }

  console.log(`\nĐã ghi ${changed.length} master.m3u8.`);
  console.log('\nCòn phải xoá bộ nhớ đệm biên của CloudFront, nếu không người xem');
  console.log('vẫn nhận bản cũ cho tới khi TTL hết hạn. Script không tự làm việc');
  console.log('này vì invalidation có tính phí. Lệnh cần chạy:');
  console.log('');
  console.log('  aws cloudfront create-invalidation --distribution-id <ID> \\');
  console.log(`    --paths ${changed.map((r) => `"/${r.prefix}master.m3u8"`).join(' ')}`);
};

main().catch((err) => {
  console.error('\n❌ Lỗi:', err.message);
  process.exit(1);
});
