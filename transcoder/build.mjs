// Bundles the container entry points into single ESM files with their dependencies, so the
// runtime image needs no node_modules: dist/main.js (jobs) and dist/smoke.js (CI smoke test).
import { build } from 'esbuild';

const common = {
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  // Some AWS SDK dependencies still call require(); give the ESM bundle one.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
};

await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.js', sourcemap: true });
await build({ ...common, entryPoints: ['src/smoke.ts'], outfile: 'dist/smoke.js' });
