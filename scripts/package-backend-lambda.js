/**
 * Build and package the Serverless Express Backend into a clean deployment ZIP for AWS Lambda.
 * Excludes test files, devDependencies, and unnecessary cache to minimize bundle size.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const BACKEND_DIR = path.resolve(__dirname, '../backend');
const DIST_DIR = path.resolve(BACKEND_DIR, 'dist');
const STAGING_DIR = path.resolve(DIST_DIR, 'staging');
const OUTPUT_ZIP = path.resolve(DIST_DIR, 'backend-lambda.zip');

function main() {
  console.log('📦 Starting Backend Lambda Packaging...');

  // 1. Clean previous builds
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });

  // 2. Copy source code and config
  console.log('📂 Copying source files...');
  fs.cpSync(path.join(BACKEND_DIR, 'src'), path.join(STAGING_DIR, 'src'), { recursive: true });
  fs.copyFileSync(path.join(BACKEND_DIR, 'package.json'), path.join(STAGING_DIR, 'package.json'));
  if (fs.existsSync(path.join(BACKEND_DIR, 'package-lock.json'))) {
    fs.copyFileSync(path.join(BACKEND_DIR, 'package-lock.json'), path.join(STAGING_DIR, 'package-lock.json'));
  }

  // 3. Install production dependencies only
  console.log('📥 Installing production dependencies (omitting dev)...');
  execSync('npm install --omit=dev --no-audit --no-fund', {
    cwd: STAGING_DIR,
    stdio: 'inherit',
  });

  // 4. Create ZIP archive
  console.log(`🗜️ Creating ZIP archive at: ${OUTPUT_ZIP}...`);
  if (process.platform === 'win32') {
    // PowerShell Compress-Archive
    execSync(
      `powershell -Command "Compress-Archive -Path '${STAGING_DIR}/*' -DestinationPath '${OUTPUT_ZIP}' -Force"`,
      { stdio: 'inherit' }
    );
  } else {
    // Linux/macOS zip command
    execSync(`cd "${STAGING_DIR}" && zip -r -q "${OUTPUT_ZIP}" .`, { stdio: 'inherit' });
  }

  const stats = fs.statSync(OUTPUT_ZIP);
  const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
  console.log(`✅ Backend Lambda Package successfully created: ${sizeMB} MB`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
