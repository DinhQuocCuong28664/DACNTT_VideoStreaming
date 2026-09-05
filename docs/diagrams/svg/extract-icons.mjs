/**
 * Trích các icon cần dùng từ bộ @iconify-json/logos ra một tệp nhỏ nằm trong
 * repo.
 *
 * Bộ icon đầy đủ nặng khoảng 7,5 MB và phải tải từ npm, nên không đưa cả vào
 * kho mã. Sơ đồ chỉ dùng chưa tới ba mươi icon, và khi đã trích ra thì việc
 * dựng lại hình không cần mạng nữa: chỉ cần Node và tệp subset này. Chạy lại
 * script này khi cần thêm icon mới:
 *
 *   npm i --no-save @iconify-json/logos
 *   node docs/diagrams/svg/extract-icons.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

const WANTED = [
  // AWS
  'aws', 'aws-s3', 'aws-sqs', 'aws-lambda', 'aws-batch', 'aws-fargate',
  'aws-cloudfront', 'aws-ec2', 'aws-secrets-manager', 'aws-cloudwatch',
  'aws-eventbridge', 'aws-sns', 'aws-iam', 'aws-vpc', 'aws-glacier',
  'aws-ecs', 'aws-systems-manager',
  // Ngoài AWS
  'mongodb', 'react', 'nodejs', 'docker', 'terraform', 'github-actions',
  'github-octocat', 'ffmpeg', 'cloudflare', 'jest', 'eslint', 'nginx',
  'javascript', 'vitejs', 'chrome',
];

const SOURCES = [
  path.join(HERE, 'node_modules/@iconify-json/logos/icons.json'),
  path.join(HERE, '../../../node_modules/@iconify-json/logos/icons.json'),
];

const source = SOURCES.find((p) => fs.existsSync(p));
if (!source) {
  console.error('Khong tim thay @iconify-json/logos. Chay: npm i --no-save @iconify-json/logos');
  process.exit(1);
}

const pack = JSON.parse(fs.readFileSync(source, 'utf8'));
const out = { prefix: pack.prefix, width: pack.width ?? 24, height: pack.height ?? 24, icons: {} };

const missing = [];
for (const name of WANTED) {
  const icon = pack.icons[name];
  if (!icon) {
    missing.push(name);
    continue;
  }
  out.icons[name] = {
    body: icon.body,
    width: icon.width ?? pack.width ?? 24,
    height: icon.height ?? pack.height ?? 24,
  };
}

const target = path.join(HERE, 'icons.json');
fs.writeFileSync(target, JSON.stringify(out, null, 0) + '\n');

console.log(`Da trich ${Object.keys(out.icons).length}/${WANTED.length} icon -> ${path.relative(process.cwd(), target)}`);
console.log(`Kich thuoc: ${(fs.statSync(target).size / 1024).toFixed(1)} KB`);
if (missing.length) console.log('Khong co trong pack:', missing.join(', '));
