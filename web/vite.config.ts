/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Resolve the workspace package to source, so the dev server and the test
      // loop both run without building `shared` first.
      '@quiz/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist' },
  test: {
    environment: 'jsdom',
    globals: true,
    // jsdom only enables localStorage for a real origin; without a url the document
    // is opaque, `window.localStorage` is undefined, and the bare global falls
    // through to Node's own web-storage stub, which has no getItem.
    environmentOptions: { jsdom: { url: 'http://localhost:5173' } },
    setupFiles: ['./test/setup.ts'],
  },
});
