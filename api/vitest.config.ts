import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      // Resolve the workspace package to source so the test loop needs no build step.
      '@quiz/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  test: {
    // Every suite shares one database and truncates between cases, so files must
    // not run concurrently or they clear each other's fixtures mid-run.
    fileParallelism: false,
    env: { TZ: 'UTC' },
    setupFiles: ['./test/setup.ts'],
  },
});
