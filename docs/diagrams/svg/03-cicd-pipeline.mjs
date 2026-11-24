/**
 * Hình 5.1 — Kiểm tra tự động trên GitHub Actions và triển khai liên tục của v2.
 *
 * Nguồn: .github/workflows/ci.yml (check, transcoder-smoke, terraform),
 * .github/workflows/security-scan.yml (gitleaks, trivy-sca, sast), .github/workflows/deploy.yml
 * (OIDC, staging tự động, prod sau khi duyệt), scripts/ensure-indexes.sh, scripts/deploy-web.sh, e2e/.
 */
import { card, group, edge, text, document_, write, enableLayoutCheck, PALETTE, TYPE } from './render.mjs';

enableLayoutCheck();
Object.assign(TYPE, { cardTitle: 20, cardSub: 18.5, cardSubLH: 22, groupLabel: 18.5, edgeLabel: 18.5 });

const W = 1320;
const H = 860;
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
const check = card({ x: CX[0], y: 110, w: 196, h: 140, title: 'Check', sub: ['lint, typecheck,', '380 unit tests,', 'build'], tone: 'compute' });
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
const dep = group({ x: 20, y: 520, w: 1280, h: 280, label: 'Continuous deployment: deploy.yml after CI passes on master' });
const stagingLane = group({ x: 36, y: 565, w: 860, h: 220, label: 'staging, automatic', stroke: PALETTE.storage.stroke, fill: '#f7fbf8' });
const prodLane = group({ x: 912, y: 565, w: 372, h: 220, label: 'prod, after approval', stroke: PALETTE.network.stroke, fill: '#f6f9fc' });
p.push(dep.svg, stagingLane.svg, prodLane.svg);

const steps = [
  { title: 'OIDC role', sub: ['token traded', 'for the role of', 'the environment'], tone: 'secret' },
  { title: 'Build', sub: ['Lambda code;', 'image only if', 'its tag is new'], tone: 'storage' },
  { title: 'Terraform', sub: ['plan, then', 'apply with', 'the image tag'], tone: 'storage' },
  { title: 'Index, web', sub: ['indexes,', 'S3 upload,', 'invalidate'], tone: 'storage' },
  { title: 'Checks', sub: ['health,', 'Playwright,', '27 E2E tests'], tone: 'network' },
];
const STEP = 168;
const cards = steps.map((s, i) => card({ x: 52 + i * STEP, y: 615, w: 150, h: 150, title: s.title, sub: s.sub, tone: s.tone }));
const approve = card({ x: 928, y: 615, w: 150, h: 150, title: 'Approval', sub: ['required', 'reviewer in', 'environment'], tone: 'secret' });
const prod = card({ x: 1112, y: 615, w: 156, h: 150, title: 'Release', sub: ['same commit', 'and image,', 'same steps'], tone: 'network' });
p.push(...cards.map((c) => c.svg), approve.svg, prod.svg);
const chain = [...cards, approve, prod];
for (let i = 0; i < chain.length - 1; i++) {
  p.push(edge([[chain[i].box.r, chain[i].box.cy], [chain[i + 1].box.x, chain[i + 1].box.cy]]));
}
p.push(edge([[merge.box.cx, merge.box.b], [merge.box.cx, 505], [28, 505], [28, cards[0].box.cy], [cards[0].box.x, cards[0].box.cy]], { dashed: true }));

p.push(text('No stored AWS keys: each job trades its GitHub OIDC token for the role of its environment.',
  40, H - 18, { size: 18.5, anchor: 'start', fill: PALETTE.muted }));

const svg = document_({ width: W, height: H, body: p.join('\n') });
const out = write('03-cicd-pipeline', svg, 3);
console.log(`03-cicd-pipeline -> ${(out.bytes / 1024).toFixed(0)} KB`);
