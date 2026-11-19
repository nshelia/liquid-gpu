// Frame pacing during each animation (run with --headed for the display's real refresh rate, 120 Hz on ProMotion).
// Records rAF intervals and renderer.frame() CPU time per frame while an interaction runs.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5179/controls.html';
export default async (cdp) => {
  // keep-alive: Node 24's built-in WebSocket does not hold the event loop, so a pending CDP reply alone can let the
  // process exit mid-task ("unsettled top-level await").
  const keepAlive = setInterval(() => {}, 1000);
  try {
  const ev = (e) => cdp.evaluate(e);
  const qs = ['only=switch,segmented,slider,menu,context-menu,zoom,glass-card', 'light', process.env.MODE === 'css' ? 'fallback' : ''].filter(Boolean).join('&');
  await cdp.goto(BASE + '?' + qs); await cdp.sleep(1500);
  await ev(`(()=>{const r=__lqc.renderer; const f=r.frame.bind(r); window.__ft=[]; r.frame=()=>{const t=performance.now(); f(); window.__ft.push(performance.now()-t)}; window.__rec=null;
    window.__start=()=>{window.__rec=[]; window.__ft=[]; const l=(t)=>{if(!window.__rec) return; window.__rec.push(t); requestAnimationFrame(l)}; requestAnimationFrame(l)};
    window.__stop=()=>{const r=window.__rec; window.__rec=null; const d=r.slice(1).map((t,i)=>t-r[i]).sort((a,b)=>a-b); const ft=window.__ft.slice().sort((a,b)=>a-b); const q=(a,p)=>a.length?a[Math.min(a.length-1,Math.floor(a.length*p))]:0;
      return JSON.stringify({frames:d.length, meanMs:+(d.reduce((a,b)=>a+b,0)/Math.max(1,d.length)).toFixed(2), p50:+q(d,.5).toFixed(2), p95:+q(d,.95).toFixed(2), max:+q(d,1).toFixed(2), long:d.filter(x=>x>12).length, draws:ft.length, drawP50:+q(ft,.5).toFixed(2), drawP95:+q(ft,.95).toFixed(2)})}; return 1})()`);
  const rect = async (sel, i = 0) => JSON.parse(await ev(`JSON.stringify(document.querySelectorAll(${JSON.stringify(sel)})[${i}].getBoundingClientRect())`));
  const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
  const tap = async (x, y) => { await mouse('mousePressed', x, y); await cdp.sleep(30); await mouse('mouseReleased', x, y); };
  const run = async (name, fn) => { await ev('__start()'); await fn(); console.log(name.padEnd(22), await ev('__stop()')); await cdp.sleep(300); };
  console.log('mode', await ev(`__lqc.mode`), 'dpr', await ev('devicePixelRatio'));
  await run('idle 1s', async () => cdp.sleep(1000));
  const sw = await rect('[role=switch]', 1);
  await run('switch tap', async () => { await tap(sw.x + 20, sw.y + 14); await cdp.sleep(900); });
  const m = await rect('[role=radio]', 2);
  await run('segmented tap', async () => { await tap(m.x + 30, m.y + 16); await cdp.sleep(1200); });
  const sl = await rect('[role=slider]', 0);
  const v0 = Number(await ev(`document.querySelectorAll('[role=slider]')[0].getAttribute('aria-valuenow')`));
  await run('slider drag', async () => { const x = sl.x + v0 * (sl.width - 37) + 18.5; await mouse('mousePressed', x, sl.y + 17); for (let i = 1; i <= 40; i++) { await mouse('mouseMoved', x + i * 3, sl.y + 17); await cdp.sleep(8); } await mouse('mouseReleased', x + 120, sl.y + 17); await cdp.sleep(700); });
  const b = await rect('[data-section=menu] .lq-placeholder');
  await run('menu open', async () => { await tap(b.x + 30, b.y + 17); await cdp.sleep(800); });
  await run('menu close', async () => { await tap(400, 850); await cdp.sleep(900); });
  const p0 = await rect('[data-testid=ctx-0]');
  await run('ctx long-press+lift', async () => { await mouse('mousePressed', p0.x + 50, p0.y + 50); await cdp.sleep(1400); await mouse('mouseReleased', p0.x + 50, p0.y + 50); });
  await run('ctx dismiss', async () => { await tap(400, 880); await cdp.sleep(900); });
  const p2 = await rect('[data-testid=ctx-2]');
  await mouse('mousePressed', p2.x + 50, p2.y + 50); await cdp.sleep(1300); await mouse('mouseReleased', p2.x + 50, p2.y + 50); await cdp.sleep(700);
  await run('ctx .pop commit', async () => { await tap(220, p2.y + 55); await cdp.sleep(900); });
  await cdp.sleep(500);
  const t = await rect('[data-testid=thumb-4]');
  await run('zoom open', async () => { await tap(t.x + 30, t.y + 30); await cdp.sleep(900); });
  await run('zoom swipe-down', async () => { await mouse('mousePressed', 220, 400); for (let i = 1; i <= 30; i++) { await mouse('mouseMoved', 220, 400 + i * 9); await cdp.sleep(8); } await mouse('mouseReleased', 220, 670); await cdp.sleep(900); });
  const c = await rect('[data-section=glass-card] .lq-placeholder');
  await run('glass card open', async () => { await tap(c.x + 30, c.y + 17); await cdp.sleep(1000); });
  await run('glass card drag+close', async () => { await mouse('mousePressed', 220, 500); for (let i = 1; i <= 25; i++) { await mouse('mouseMoved', 220, 500 + i * 8); await cdp.sleep(8); } await mouse('mouseReleased', 220, 700); await cdp.sleep(1000); });
  } finally {
    clearInterval(keepAlive);
  }
};
