/**
 * Package the Lambda backend by hand, the same way CD — Deploy does
 * (.github/workflows/cd-deploy.yml): production dependencies from the lockfile,
 * then src, package.json, package-lock.json and node_modules in one zip.
 *
 *   node scripts/package-backend-lambda.js
 *
 * The zip lands where infrastructure/environments/dev reads it
 * (modules/lambda-backend/dist/backend_api.zip), which matters only when
 * Terraform creates the function: afterwards it ignores the code and CD owns
 * it. Use it to bootstrap an environment or to deploy without CD.
 *
 * Needs npm 11 or later (Node 24, as CI uses): npm 10 rejects this lockfile.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync, execSync } = require('child_process');

const BACKEND_DIR = path.resolve(__dirname, '../backend');
const STAGING_DIR = path.resolve(BACKEND_DIR, 'dist/staging');
const OUTPUT_ZIP = path.resolve(__dirname, '../infrastructure/modules/lambda-backend/dist/backend_api.zip');
const CONTENTS = ['src', 'package.json', 'package-lock.json', 'node_modules'];

function main() {
  const npmMajor = Number(execSync('npm -v', { encoding: 'utf-8' }).trim().split('.')[0]);
  if (npmMajor < 11) {
    throw new Error(`npm ${npmMajor} cannot install this lockfile; use Node 24 (npm 11), as CI does`);
  }

  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  fs.mkdirSync(path.dirname(OUTPUT_ZIP), { recursive: true });
  fs.rmSync(OUTPUT_ZIP, { force: true });

  console.log('📂 Copying src, package.json and package-lock.json...');
  fs.cpSync(path.join(BACKEND_DIR, 'src'), path.join(STAGING_DIR, 'src'), { recursive: true });
  fs.copyFileSync(path.join(BACKEND_DIR, 'package.json'), path.join(STAGING_DIR, 'package.json'));
  fs.copyFileSync(path.join(BACKEND_DIR, 'package-lock.json'), path.join(STAGING_DIR, 'package-lock.json'));

  console.log('📥 npm ci --omit=dev ...');
  execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: STAGING_DIR, stdio: 'inherit' });

  // Entry names must use forward slashes: Lambda runs on Linux. PowerShell 5.1's
  // Compress-Archive writes backslashes, so Windows uses its bundled bsdtar, by
  // full path: Git Bash puts GNU tar first, which reads "C:" as a remote host.
  console.log(`🗜️ Writing ${OUTPUT_ZIP} ...`);
  if (process.platform === 'win32') {
    const bsdtar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
    execFileSync(bsdtar, ['-a', '-c', '-f', OUTPUT_ZIP, ...CONTENTS], { cwd: STAGING_DIR, stdio: 'inherit' });
  } else {
    execFileSync('zip', ['-r', '-q', OUTPUT_ZIP, ...CONTENTS], { cwd: STAGING_DIR, stdio: 'inherit' });
  }

  fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  const sizeMB = (fs.statSync(OUTPUT_ZIP).size / (1024 * 1024)).toFixed(2);
  console.log(`✅ ${OUTPUT_ZIP} (${sizeMB} MB)`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
