/**
 * Hình 5.1 — Kiểm tra tự động trên GitHub Actions và các bước triển khai của v2.
 *
 * Nguồn: .github/workflows/ci.yml (check, transcoder-smoke, terraform),
 * .github/workflows/security-scan.yml (gitleaks, trivy-sca, sast), scripts/ensure-indexes.sh,
 * scripts/deploy-web.sh, e2e/. Không workflow nào giữ quyền vào AWS: triển khai chạy từ máy
 * người vận hành, mỗi bước được duyệt riêng.
 */
import { card, group, edge, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();
Object.assign(TYPE, { cardTitle: 20, cardSub: 18.5, cardSubLH: 22, groupLabel: 18.5, edgeLabel: 18.5 });

const W = 1320;
const H = 850;
const p = [];

// ── CI ─────────────────────────────────────────────────────────────────────
const ci = group({ x: 20, y: 20, w: 1280, h: 470, label: 'Continuous integration: GitHub Actions on every push and pull request' });
p.push(ci.svg);

const trigger = card({ x: 44, y: 190, w: 180, h: 130, title: 'Push or PR', sub: ['to master or', 'a branch'], tone: 'plain' });
p.push(trigger.svg);

const ciYml = group({ x: 270, y: 70, w: 650, h: 200, label: 'ci.yml', stroke: PALETTE.compute.stroke, fill: '#f7f9fd' });
const secYml = group({ x: 270, y: 290, w: 650, h: 180, label: 'security-scan.yml', stroke: PALETTE.secret.stroke, fill: '#fdf8f6' });
p.push(ciYml.svg, secYml.svg);

const CX = [290, 500, 710];
const check = card({ x: CX[0], y: 110, w: 196, h: 140, title: 'Check', sub: ['lint, typecheck,', '294 unit tests,', 'build'], tone: 'compute' });
const smoke = card({ x: CX[1], y: 110, w: 196, h: 140, title: 'Image smoke', sub: ['real FFmpeg in', 'the image,', '13 checks'], tone: 'compute' });
const tf = card({ x: CX[2], y: 110, w: 196, h: 140, title: 'Terraform', sub: ['fmt, validate,', 'Trivy config', 'scan'], tone: 'compute' });
const leaks = card({ x: CX[0], y: 330, w: 196, h: 125, title: 'Gitleaks', sub: ['secrets in the', 'whole history'], tone: 'secret' });
const sca = card({ x: CX[1], y: 330, w: 196, h: 125, title: 'Trivy SCA', sub: ['fails on a', 'fixable CRITICAL'], tone: 'secret' });
const sast = card({ x: CX[2], y: 330, w: 196, h: 125, title: 'SAST', sub: ['eslint-plugin-', 'security rules'], tone: 'secret' });
p.push(check.svg, smoke.svg, tf.svg, leaks.svg, sca.svg, sast.svg);

const merge = card({ x: 990, y: 190, w: 270, h: 130, title: 'Merge to master', sub: ['after review; the', 'security jobs are', 'required checks'], tone: 'plain' });
p.push(merge.svg);

p.push(edge([[trigger.box.r, 240], [247, 240], [247, 170], [ciYml.box.x, 170]]));
p.push(edge([[trigger.box.r, 270], [247, 270], [247, 380], [secYml.box.x, 380]]));
p.push(edge([[ciYml.box.r, 170], [955, 170], [955, 240], [merge.box.x, 240]]));
p.push(edge([[secYml.box.r, 380], [955, 380], [955, 270], [merge.box.x, 270]]));

// ── Deployment ─────────────────────────────────────────────────────────────
const dep = group({ x: 20, y: 520, w: 1280, h: 270, label: 'Deployment: scripts run by the operator, each step approved' });
p.push(dep.svg);

const steps = [
  { title: 'Build', sub: ['esbuild bundles', 'of the API and', 'the functions'] },
  { title: 'Image', sub: ['docker build,', 'push to ECR,', 'tag = commit'] },
  { title: 'Terraform', sub: ['apply in B, A', 'and Cloudflare', 'with that tag'] },
  { title: 'Indexes', sub: ['direct invoke', 'of the API:', 'ensure-indexes'] },
  { title: 'Web files', sub: ['hashed assets,', 'then index.html,', 'invalidate CDN'] },
  { title: 'E2E smoke', sub: ['Playwright,', '27 tests on', 'production'] },
];
const cards = steps.map((s, i) => card({ x: 72 + i * 204, y: 585, w: 184, h: 150, title: s.title, sub: s.sub, tone: i === 5 ? 'network' : 'storage' }));
p.push(...cards.map((c) => c.svg));
for (let i = 0; i < cards.length - 1; i++) {
  p.push(edge([[cards[i].box.r, cards[i].box.cy], [cards[i + 1].box.x, cards[i + 1].box.cy]]));
}
p.push(edge([[merge.box.cx, merge.box.b], [merge.box.cx, 505], [28, 505], [28, cards[0].box.cy], [cards[0].box.x, cards[0].box.cy]], { dashed: true }));

p.push(text('No workflow holds AWS credentials: deployment runs from the operator’s machine.',
  40, H - 26, { size: 18.5, anchor: 'start', fill: PALETTE.muted }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('03-cicd-pipeline', svg, 3);
console.log(`03-cicd-pipeline -> ${(out.bytes / 1024).toFixed(0)} KB`);
