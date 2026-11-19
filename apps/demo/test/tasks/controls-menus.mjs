// Drives Menu and ContextMenu: tap-open, slide-select, long-press pre-lift + lift, dismiss, .pop commit.
// MODE=css for the fallback, AP=dark for dark.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5179/controls.html';
const tag = `${process.env.MODE ?? 'gpu'}-${process.env.AP ?? 'light'}`;
const out = (n) => new URL(`../out/controls/${tag}-${n}.png`, import.meta.url).pathname;
export default async (cdp) => {
  // keep-alive: Node 24's built-in WebSocket does not hold the event loop, so a pending CDP reply alone can let the
  // process exit mid-task ("unsettled top-level await").
  const keepAlive = setInterval(() => {}, 1000);
  try {
  const qs = ['only=menu,context-menu,events', process.env.AP ?? 'light', process.env.MODE === 'css' ? 'fallback' : ''].filter(Boolean).join('&');
  await cdp.goto(BASE + '?' + qs);
  await cdp.sleep(1200);
  const ev = (e) => cdp.evaluate(e);
  const rect = async (sel) => JSON.parse(await ev(`JSON.stringify(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`));
  const mouse = (type, x, y, extra = {}) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1, ...extra });
  const tap = async (x, y) => { await mouse('mousePressed', x, y); await cdp.sleep(40); await mouse('mouseReleased', x, y); };
  const events = () => ev(`JSON.stringify(window.__lqEvents ?? [])`);
  console.log('mode', await ev(`document.querySelector('.lq-root').dataset.renderer`));

  // ---- Button menu
  const b = await rect('[data-section=menu] .lq-placeholder'); // the in-flow box (portaled layer rects sit at the canvas origin in GPU mode)
  const bx = b.x + b.width / 2, by = b.y + b.height / 2;
  await tap(bx, by);
  await cdp.sleep(60 + 90); await cdp.screenshot(out('menu-opening'));
  await cdp.sleep(600); await cdp.screenshot(out('menu-open'));
  // Menu: 250 wide, top at the button's top; centred when it fits, else leading-aligned; rows at 10 + 42 i.
  const mx = bx - 125 >= 8 && bx - 125 <= 182 ? bx - 125 : Math.min(182, Math.max(8, b.x));
  const rowY = (i) => b.y + 10 + 42 * i + 21;
  // press on row 0, slide to row 2, release → "fav"
  await mouse('mousePressed', mx + 120, rowY(0));
  for (let k = 1; k <= 10; k++) { await mouse('mouseMoved', mx + 120, rowY(0) + (rowY(2) - rowY(0)) * k / 10); await cdp.sleep(16); }
  await cdp.screenshot(out('menu-slide'));
  await mouse('mouseReleased', mx + 120, rowY(2));
  await cdp.sleep(120); await cdp.screenshot(out('menu-closing'));
  await cdp.sleep(700);
  console.log('after slide-select', await events());

  // ---- Context menu: long press on photo 0, then slide to "Share" and release
  const p0 = await rect('[data-testid=ctx-0]');
  const px = p0.x + p0.width / 2, py = p0.y + p0.height / 2;
  await mouse('mousePressed', px, py);
  await cdp.sleep(500); await cdp.screenshot(out('ctx-prelift'));
  await cdp.sleep(400); await cdp.screenshot(out('ctx-lifting'));
  await cdp.sleep(500); await cdp.screenshot(out('ctx-lifted'));
  const menuTop = await ev(`(() => { const m = document.querySelector('[role=menu]'); return m ? m.getBoundingClientRect().top : -1 })()`);
  console.log('menu element top (css mode only meaningful)', menuTop);
  // lifted platter: (w+26) wide, centred on the source; menu 20 below.
  const lh = p0.height * Math.min(1.15, (p0.width + 26) / p0.width);
  const mTop = py + lh / 2 + 20;
  for (let k = 1; k <= 12; k++) { await mouse('mouseMoved', px, py + (mTop + 10 + 42 + 21 - py) * k / 12); await cdp.sleep(16); }
  await cdp.screenshot(out('ctx-slide'));
  await mouse('mouseReleased', px, mTop + 10 + 42 + 21);
  await cdp.sleep(150); await cdp.screenshot(out('ctx-dismissing'));
  await cdp.sleep(800);
  console.log('after ctx slide', await events());

  // ---- Context menu with preview: long-press, release, tap the preview → .pop commit
  const p2 = await rect('[data-testid=ctx-2]');
  const qx = p2.x + p2.width / 2, qy = p2.y + p2.height / 2;
  await mouse('mousePressed', qx, qy);
  await cdp.sleep(1300);
  await mouse('mouseReleased', qx, qy);
  await cdp.sleep(500);
  await cdp.screenshot(out('ctx-preview'));
  // Preview: 400 × 300 (4:3) centred at the source's y (clamped by placement)
  await tap(220, qy);
  for (const t of [60, 120, 200]) { await cdp.sleep(t === 60 ? 60 : t - (t === 120 ? 60 : 120)); await cdp.screenshot(out(`commit-${t}`)); }
  await cdp.sleep(700); await cdp.screenshot(out('commit-done'));
  console.log('after commit', await events());
  } finally {
    clearInterval(keepAlive);
  }
};
