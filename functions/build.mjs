// Bundles each handler into dist/<name>/index.mjs for its own Lambda function.
import { build } from 'esbuild';

const handlers = ['starter', 'probe', 'status', 'stitch'];

await Promise.all(handlers.map((name) => build({
  entryPoints: [`src/${name}.ts`],
  outfile: `dist/${name}/index.mjs`,
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // The Lambda Node.js runtime ships AWS SDK v3; bundling ours pins the version we tested.
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
})));
