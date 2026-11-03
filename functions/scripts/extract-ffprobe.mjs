// Copies the static ffprobe out of the pinned ffmpeg image (the same build the transcoder uses)
// into dist/layers/ffprobe/bin/ffprobe, the layout of the probe Lambda layer (/opt/bin/ffprobe).
// Needs Docker. Run from the functions workspace: npm run layer:ffprobe
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync } from 'node:fs';

const IMAGE = 'mwader/static-ffmpeg:8.1.2@sha256:33f770f812cbfc3de96c547157fc9faf8bd95a36481753439ffa761045167585';
const OUT_DIR = 'dist/layers/ffprobe/bin';

mkdirSync(OUT_DIR, { recursive: true });
const id = execFileSync('docker', ['create', '--platform', 'linux/amd64', IMAGE, '/ffprobe']).toString().trim();
try {
  execFileSync('docker', ['cp', `${id}:/ffprobe`, `${OUT_DIR}/ffprobe`], { stdio: 'inherit' });
} finally {
  execFileSync('docker', ['rm', id]);
}
chmodSync(`${OUT_DIR}/ffprobe`, 0o755);
console.log(`ffprobe copied to ${OUT_DIR}/ffprobe`);
