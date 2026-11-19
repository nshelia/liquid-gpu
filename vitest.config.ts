import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    // Tests run against the sources (package manifests point at dist/ for consumers).
    alias: {
      '@liquid-gpu/core': r('./packages/core/src/index.ts'),
      '@liquid-gpu/gpu': r('./packages/gpu/src/index.ts'),
      '@liquid-gpu/react': r('./packages/react/src/index.ts'),
      '@liquid-gpu/json-render': r('./packages/json-render/src/index.ts'),
    },
  },
  test: {
    include: ['packages/*/test/**/*.test.{ts,tsx}', 'packages/*/src/**/*.test.{ts,tsx}', 'apps/*/test/**/*.test.ts'],
    environment: 'node',
  },
});
