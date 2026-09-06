/**
 * Hình 5.1 — Bảy workflow CI/CD và cổng chất lượng DevSecOps hai tầng.
 *
 * Bố cục xếp mỗi workflow thành một hàng ngang, vì đó đúng là cách chúng chạy:
 * độc lập với nhau, kích hoạt theo đường dẫn tệp đã thay đổi. Bản Mermaid cũ vẽ
 * thành một đồ thị nối tiếp, khiến người đọc tưởng workflow này chạy xong mới
 * tới workflow kia.
 *
 * Tên workflow đặt phía trên hàng bước chứ không đặt bên trái. Bản dựng đầu đặt
 * bên trái và bị chính đường phân nhánh dọc cắt ngang qua chữ.
 *
 * Cổng bảo mật tô khác màu vì đó là chỗ duy nhất trong sơ đồ có thể CHẶN, và
 * mục 5.4 dành hẳn một đoạn giải thích vì sao nó chỉ chặn ở mức critical đã có
 * bản vá chứ không chặn mọi phát hiện.
 */
import { card, chip, group, edge, text, document_, write, PALETTE, TYPE } from './render.mjs';

// Canvas rộng 1372px, xoay ngang nên in ra 247mm: 1px là 0,18mm. Muốn chữ nhỏ
// nhất đạt 7pt thì phải từ 13,7px trở lên, nên nâng mọi cỡ mặc định dưới mức đó.
Object.assign(TYPE, {
  chipLabel: 14,
  chipLabelLH: 16,
  edgeLabel: 14,
  cardSub: 14.5,
  cardSubLH: 17.5,
  legendLabel: 14.5,
});

const W = 1372;
const H = 888;
const p = [];

const LANE_X = 268;
const STEP_X = 372;
const STEP_W = 176;
const STEP_GAP = 16;
const CHIP_H = 56;
const HEADER = 22;   // chiều cao phần tên workflow phía trên hàng bước

const stepX = (i) => STEP_X + i * (STEP_W + STEP_GAP);

// ── Kích hoạt ───────────────────────────────────────────────────────────────
const trigger = card({
  x: 40, y: 308, w: 196, h: 126, iconName: 'github-octocat', iconSize: 32,
  title: 'Git push', sub: ['or pull request'], tone: 'plain',
});
const filter = card({
  x: 40, y: 472, w: 196, h: 118, iconName: 'github-actions', iconSize: 30,
  title: 'GitHub Actions', sub: ['branch and path filter'], tone: 'network',
});
p.push(trigger.svg, filter.svg);
p.push(edge([[trigger.box.cx, trigger.box.b], [filter.box.cx, filter.box.y]]));

// ── Bảy hàng workflow ───────────────────────────────────────────────────────
const rows = [
  {
    y: 44, name: 'ci-backend.yml', on: 'on backend/**',
    steps: [
      { icon: 'jest', label: 'Jest unit tests', tone: 'compute' },
      { icon: 'eslint', label: 'ESLint', tone: 'compute' },
      { icon: 'docker', label: ['Gitleaks and', 'Trivy SCA'], tone: 'secret' },
    ],
  },
  {
    y: 156, name: 'ci-transcoder.yml', on: 'on transcoder/**',
    steps: [
      { icon: 'eslint', label: ['ESLint and', 'Gitleaks'], tone: 'compute' },
      { icon: 'docker', label: ['Docker', 'multi-stage build'], tone: 'plain' },
      { icon: 'docker', label: 'Trivy image scan', tone: 'secret' },
      { icon: 'aws-ecs', label: 'Push to Amazon ECR', tone: 'storage' },
      { icon: 'aws-batch', label: ['Register Batch', 'job definition'], tone: 'compute' },
    ],
  },
  {
    y: 268, name: 'ci-frontend.yml', on: 'on frontend/**',
    steps: [
      { icon: 'eslint', label: 'oxlint', tone: 'compute' },
      { icon: 'vitejs', label: 'Vite build', tone: 'plain' },
      { icon: 'aws-s3', label: 'Sync to Amazon S3', tone: 'storage' },
      { icon: 'aws-cloudfront', label: ['Invalidate', 'CloudFront cache'], tone: 'network' },
    ],
  },
  {
    y: 380, name: 'ci-infra.yml', on: 'on infrastructure/**',
    steps: [
      { icon: 'terraform', label: 'terraform fmt', tone: 'plain' },
      { icon: 'terraform', label: ['terraform validate', 'dev and prod'], tone: 'plain' },
      { icon: 'docker', label: 'Trivy IaC scan', tone: 'secret' },
    ],
  },
  {
    y: 504, name: 'security-scan.yml', on: 'on every pull request',
    steps: [
      { icon: 'docker', label: 'Gitleaks secrets', tone: 'secret' },
      { icon: 'docker', label: ['Trivy SCA reports', 'CRITICAL + HIGH'], tone: 'secret' },
      { icon: 'eslint', label: ['SAST via', 'eslint-plugin-security'], tone: 'secret' },
    ],
  },
  {
    y: 638, name: 'cd-staging.yml', on: 'on push to develop',
    steps: [{ icon: 'aws-ec2', label: ['Deploy to the', 'dev environment'], tone: 'network' }],
  },
  {
    y: 750, name: 'cd-deploy.yml', on: 'on merge to main',
    steps: [
      { icon: 'aws-systems-manager', label: ['Deploy to EC2', 'via AWS SSM'], tone: 'network' },
      { icon: 'aws-cloudwatch', label: ['Verify the API', 'answers HTTP 200'], tone: 'network' },
    ],
  },
];

for (const row of rows) {
  // Tên workflow và điều kiện kích hoạt nằm trên một dòng, phía trên hàng bước
  p.push(text(row.name, STEP_X, row.y + 14, { size: 14, weight: 'bold', anchor: 'start' }));
  p.push(text(row.on, STEP_X + row.name.length * 8.4 + 14, row.y + 14,
    { size: 14, anchor: 'start', fill: PALETTE.muted }));

  const chipY = row.y + HEADER;
  let prev = null;
  row.steps.forEach((s, i) => {
    const c = chip({ x: stepX(i), y: chipY, w: STEP_W, h: CHIP_H, iconName: s.icon, label: s.label, tone: s.tone });
    p.push(c.svg);
    if (prev) p.push(edge([[prev.box.r, prev.box.cy], [c.box.x, c.box.cy]]));
    prev = c;
  });
  row.firstY = chipY + CHIP_H / 2;
  row.lastBox = prev.box;

  p.push(edge([[LANE_X, row.firstY], [stepX(0), row.firstY]]));
}

// Làn dọc phân nhánh tới mọi workflow
p.push(edge([[filter.box.r, filter.box.cy], [LANE_X, filter.box.cy]], { arrow: false }));
p.push(edge([[LANE_X, rows[0].firstY], [LANE_X, rows[rows.length - 1].firstY]], { arrow: false }));

// ── Cổng chất lượng hai tầng ────────────────────────────────────────────────
const secRow = rows[4];
const gate = group({
  x: 1108, y: secRow.y + 4, w: 218, h: 160,
  label: 'Two-tier quality gate', stroke: PALETTE.secret.stroke, fill: '#fef7f6', dash: '6 4',
});
p.push(gate.svg);

const block = chip({
  x: 1124, y: secRow.y + 38, w: 186, h: 54,
  label: ['Fixable CRITICAL', 'blocks the merge'], tone: 'secret',
});
const report = chip({
  x: 1124, y: secRow.y + 102, w: 186, h: 54,
  label: ['Everything else', 'is reported only'], tone: 'plain',
});
p.push(block.svg, report.svg);
p.push(edge([[secRow.lastBox.r, secRow.lastBox.cy], [gate.box.x, secRow.lastBox.cy]]));

p.push(text(
  ['Failing on every high-severity finding means failing on',
   'transitive dependencies that have no patch, and a gate',
   'like that gets ignored. Blocking only where a fix exists',
   'keeps each failure actionable. Section 5.4 gives the reasoning.'],
  // Hạ xuống ngang thân thẻ thay vì ngang dòng tên workflow: ở cỡ chữ 14px thì
  // dòng "on push to develop" và dòng đầu của khối này gần như chạm nhau.
  626, rows[5].y + 40,
  { size: 14, anchor: 'start', fill: PALETTE.muted, lineHeight: 18 }));

// Ghi chú cho hai hàng triển khai
p.push(text('Deployment runs only after every check on the branch has passed.',
  STEP_X, rows[5].y - 6, { size: 14, anchor: 'start', fill: PALETTE.muted }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('03-cicd-pipeline', svg, 3);
console.log(`03-cicd-pipeline -> ${(out.bytes / 1024).toFixed(0)} KB`);
