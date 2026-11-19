import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The gpu package's manifest points at dist/; the demo consumes sources directly.
      '@liquid-gpu/gpu': r('../../packages/gpu/src/index.ts'),
      '@liquid-gpu/core': r('../../packages/core/src/index.ts'),
      '@liquid-gpu/react': r('../../packages/react/src/index.ts'),
      '@liquid-gpu/json-render': r('../../packages/json-render/src/index.ts'),
    },
  },
  // Multi-page build: every *.html in this folder is an entry.
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        readdirSync(r('.')).filter((f) => f.endsWith('.html')).map((f) => [f.replace(/\.html$/, ''), r(`./${f}`)]),
      ),
    },
  },
  server: { port: 5179, strictPort: true, allowedHosts: ['.trycloudflare.com'] },
});
