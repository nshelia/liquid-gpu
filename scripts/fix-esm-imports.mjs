#!/usr/bin/env node
/**
 * Post-build: make relative import specifiers in emitted ESM fully specified (`./x` → `./x.js` or `./x/index.js`),
 * so `dist/` loads in Node ESM and in bundlers that require it (webpack for `"type": "module"` packages).
 * The sources use extensionless imports (moduleResolution "bundler"). Usage: node scripts/fix-esm-imports.mjs <dist>…
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const RE = /((?:import|export)\s[^'"]*?from\s*|import\s*\(\s*|import\s+)(['"])(\.{1,2}\/[^'"]*)\2/g;

let changed = 0;
for (const root of process.argv.slice(2)) {
  for (const file of walk(resolve(root))) {
    if (!/\.(js|d\.ts)$/.test(file)) continue;
    const dir = dirname(file);
    const src = readFileSync(file, 'utf8');
    const out = src.replace(RE, (m, pre, q, spec) => {
      if (/\.(m?js|json|css)$/.test(spec)) return m;
      if (existsSync(join(dir, spec + '.js'))) return `${pre}${q}${spec}.js${q}`;
      if (existsSync(join(dir, spec, 'index.js'))) return `${pre}${q}${spec}/index.js${q}`;
      return m;
    });
    if (out !== src) {
      writeFileSync(file, out);
      changed++;
    }
  }
}
console.log(`[fix-esm-imports] rewrote ${changed} file(s)`);
