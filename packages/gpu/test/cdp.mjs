// Minimal CDP driver for the test page (Node 24 built-in WebSocket, no deps).
// Usage: node test/cdp.mjs <url> <task.mjs exporting default async (cdp) => …> [--headed] [--w=440] [--h=900] [--dpr=2]
// Start the page first: npm run test:serve -w @liquid-gpu/gpu
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const args = process.argv.slice(2);
const url = args[0]; const scriptPath = args[1];
const headed = args.includes('--headed');
const W = +(args.find(a => a.startsWith('--w='))?.slice(4) ?? 440);
const H = +(args.find(a => a.startsWith('--h='))?.slice(4) ?? 900);
const dsf = +(args.find(a => a.startsWith('--dpr='))?.slice(6) ?? 2);
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(process.env.TMPDIR || tmpdir(), 'cdpprof-' + (process.env.CDP_TAG ? process.env.CDP_TAG + '-' : '')));
const chromeArgs = [`--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal',
  '--no-first-run', '--no-default-browser-check', `--window-size=${W},${H}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'];
if (!headed) chromeArgs.unshift('--headless=new');
const ch = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [...chromeArgs, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let wsUrl;
for (let i = 0; i < 100; i++) {
  try { const l = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); const p = l.find(x => x.type === 'page'); if (p) { wsUrl = p.webSocketDebuggerUrl; break; } } catch {}
  await sleep(100);
}
const ws = new WebSocket(wsUrl);
// Node 24's built-in WebSocket doesn't keep the event loop alive while a task awaits a CDP reply.
const keepAlive = setInterval(() => {}, 1000);
await new Promise(r => ws.onopen = r);
let id = 0; const pending = new Map(); const listeners = [];
ws.onmessage = (m) => { const msg = JSON.parse(m.data); if (msg.id && pending.has(msg.id)) { const { res, rej } = pending.get(msg.id); pending.delete(msg.id); msg.error ? rej(new Error(JSON.stringify(msg.error))) : res(msg.result); } else listeners.forEach(f => f(msg)); };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails)); return r.result.value; };
const logs = [];
listeners.push((m) => { if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.args.map(a => a.value ?? a.description).join(' ')); if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + JSON.stringify(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)); });
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: dsf, mobile: false });
const cdp = { send, evaluate, sleep, logs, listeners,
  screenshot: async (path) => { const { data } = await send('Page.captureScreenshot', { format: 'png' }); (await import('node:fs')).writeFileSync(path, Buffer.from(data, 'base64')); },
  goto: async (u) => { await send('Page.navigate', { url: u }); await sleep(1500); } };
try {
  await cdp.goto(url);
  const mod = await import(new URL(scriptPath, 'file://' + process.cwd() + '/').href);
  (await import('node:fs')).mkdirSync(new URL('./out/', import.meta.url), { recursive: true });
  await mod.default(cdp);
} catch (e) { console.error('ERR', e); }
finally { if (logs.length) console.log('--- console ---\n' + logs.slice(0, 80).join('\n')); ws.close(); ch.kill(); }
process.exit(0);
