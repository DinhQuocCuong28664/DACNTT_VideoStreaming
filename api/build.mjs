// Bundles the API into dist/api/index.mjs for the Lambda function.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/lambda.ts'],
  outfile: 'dist/api/index.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  // mongodb lists optional native add-ons it loads only when configured; none are used here.
  external: ['kerberos', '@mongodb-js/zstd', '@aws-sdk/credential-providers', 'snappy', 'socks', 'aws4', 'mongodb-client-encryption'],
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
