#!/usr/bin/env node
/**
 * README screenshots of the live demo through the context.dev Scrape API (formats.screenshot).
 *
 *   CONTEXT_DEV_KEY_FILE=~/.context-dev-key node scripts/screenshots.mjs [only-name ...]
 *
 * The key is read from the file (default ~/.context-dev-key) and only sent in the Authorization header.
 * Output: docs/screenshots/<name>.png at a 402 × 874 phone viewport.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = 'https://liquid.shelia.me';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/screenshots');
const keyFile = (process.env.CONTEXT_DEV_KEY_FILE ?? '~/.context-dev-key').replace(/^~/, homedir());
const KEY = readFileSync(keyFile, 'utf8').trim();

export const SHOTS = [
  ['home', '/'],
  ['home-dark', '/?dark'],
  ['glass', '/?push=glass'],
  ['lists', '/?push=list'],
  ['scroll', '/?push=scroll'],
  ['toolbar', '/?push=toolbar'],
  ['sheet', '/?sheet=1'],
  ['tab-photos', '/?tab=photos'],
  ['tab-settings', '/?tab=settings'],
  ['photos', '/photos'],
  ['chat', '/chat'],
  ['chat-dark', '/chat?dark'],
  ['controls', '/controls'],
  ['search', '/search'],
  ['tabbar-extras', '/tabbar-extras'],
  ['list-edit', '/list-edit'],
  ['status', '/status'],
  ['basics', '/basics'],
  ['genui', '/genui'],
  ['inline', '/inline'],
  ['charts', '/charts'],
  ['form', '/form'],
  ['picker', '/picker'],
  ['inputs', '/inputs'],
  ['media', '/media'],
  ['icons', '/icons'],
  ['layout-text', '/layout-text'],
];

async function shot(name, path) {
  const res = await fetch('https://api.context.dev/v1/web/scrape', {
    method: 'POST',
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: SITE + path,
      formats: { screenshot: true },
      sharedParams: { viewport: { width: 402, height: 874 }, waitFor: Number(process.env.WAIT ?? 2500), dismissCookies: false },
      screenshotParams: { area: 'viewport', format: 'png' },
      // Always render the live site (no cached capture).
      maxAgeMs: 0,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name}: HTTP ${res.status} ${text.slice(0, 300)}`);
  const json = JSON.parse(text);
  const s = findScreenshot(json);
  if (!s) throw new Error(`${name}: no screenshot in response (keys: ${Object.keys(json).join(', ')})`);
  const buf = s.startsWith('http') ? Buffer.from(await (await fetch(s)).arrayBuffer()) : Buffer.from(s.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  writeFileSync(join(OUT, `${name}.png`), buf);
  console.log(`✓ ${name} (${(buf.length / 1024).toFixed(0)} KB)`);
}

/** The screenshot output's `data`: a URL or base64, wherever the response nests it. */
function findScreenshot(o) {
  if (!o || typeof o !== 'object') return null;
  if (o.screenshot) {
    const v = o.screenshot;
    if (typeof v === 'string') return v;
    if (typeof v.data === 'string') return v.data;
    if (typeof v.url === 'string') return v.url;
  }
  for (const v of Object.values(o)) {
    const r = findScreenshot(v);
    if (r) return r;
  }
  return null;
}

mkdirSync(OUT, { recursive: true });
const only = process.argv.slice(2);
const list = only.length ? SHOTS.filter(([n]) => only.includes(n)) : SHOTS;
let failed = 0;
// Free plan: 2 concurrent requests.
for (let i = 0; i < list.length; i += 2) {
  const r = await Promise.allSettled(list.slice(i, i + 2).map(([n, p]) => shot(n, p)));
  for (const x of r) if (x.status === 'rejected') (failed++, console.error('✗', x.reason.message));
}
process.exit(failed ? 1 : 0);
