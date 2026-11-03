import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Tests read the shared package from source, so they never depend on a stale build.
export default defineConfig({
  resolve: {
    alias: { '@zelos/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)) },
  },
});
