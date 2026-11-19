// Alerts, action sheet, toast, popover, ZoomTransition (both modes: open, swipe-down cancel + dismiss), glass card.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5179/controls.html';
const tag = `${process.env.MODE ?? 'gpu'}-${process.env.AP ?? 'light'}`;
const out = (n) => new URL(`../out/controls/${tag}-${n}.png`, import.meta.url).pathname;
export default async (cdp) => {
  // keep-alive: Node 24's built-in WebSocket does not hold the event loop, so a pending CDP reply alone can let the
  // process exit mid-task ("unsettled top-level await").
  const keepAlive = setInterval(() => {}, 1000);
  try {
  const ev = (e) => cdp.evaluate(e);
  const load = async (only) => {
    const qs = [`only=${only}`, process.env.AP ?? 'light', process.env.MODE === 'css' ? 'fallback' : ''].filter(Boolean).join('&');
    await cdp.goto(BASE + '?' + qs); await cdp.sleep(1200);
  };
  const rect = async (sel) => JSON.parse(await ev(`JSON.stringify(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`));
  const boxes = async (sec) => JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[data-section=${sec}] .lq-placeholder')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}}))`));
  const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
  const tap = async (p) => { await mouse('mousePressed', p.x, p.y); await cdp.sleep(40); await mouse('mouseReleased', p.x, p.y); };
  const drag = async (x, y, dx, dy, ms, steps = 20) => {
    await mouse('mousePressed', x, y);
    for (let i = 1; i <= steps; i++) { await mouse('mouseMoved', x + dx * i / steps, y + dy * i / steps); await cdp.sleep(ms / steps); }
  };
  const events = () => ev(`JSON.stringify(window.__lqEvents ?? [])`);

  // ---- overlays
  await load('overlays,events');
  let b = await boxes('overlays');
  await tap(b[0]); await cdp.sleep(90); await cdp.screenshot(out('alert-presenting'));
  await cdp.sleep(500); await cdp.screenshot(out('alert'));
  // Allow = right pill: alert centred at y ≈ (safe 62 + (H − 34))/2; actions row 88 + 24 inside a 152 pt alert.
  const H = await ev('innerHeight');
  const cy = (62 + H - 34) / 2;
  await tap({ x: 220 + 74, y: cy - 76 + 112 }); await cdp.sleep(500);
  await tap(b[1]); await cdp.sleep(600); await cdp.screenshot(out('alert-3'));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.sleep(500);
  await tap(b[2]); await cdp.sleep(600); await cdp.screenshot(out('action-sheet'));
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await cdp.sleep(500);
  await tap(b[3]); await cdp.sleep(500); await cdp.screenshot(out('toast'));
  await cdp.sleep(2600);
  await tap(b[4]); await cdp.sleep(600); await cdp.screenshot(out('popover'));
  await tap({ x: 220, y: H - 60 }); await cdp.sleep(500);
  console.log('overlay events', await events());

  // ---- zoom, both modes
  for (const mode of ['zoom', 'tile']) {
    await load('zoom,events');
    if (mode === 'tile') { const s = await rect('[data-section=zoom] [role=radio]:nth-of-type(2)'); await tap({ x: s.x + s.width / 2, y: s.y + s.height / 2 }); await cdp.sleep(600); }
    const t = await rect('[data-testid=thumb-4]');
    await tap({ x: t.x + t.width / 2, y: t.y + t.height / 2 });
    await cdp.sleep(100); await cdp.screenshot(out(`${mode}-opening`));
    await cdp.sleep(600); await cdp.screenshot(out(`${mode}-open`));
    // short slow drag → cancel (zoom: 60 pt @ ~300 pt/s; Photos: drag then hold still → cancel at v≈0)
    await drag(220, 420, 0, 70, 260);
    await cdp.sleep(mode === 'tile' ? 300 : 0);
    await cdp.screenshot(out(`${mode}-drag70`));
    await mouse('mouseReleased', 220, 490); await cdp.sleep(600);
    // long drag → dismiss
    await drag(220, 400, 0, 260, 400);
    await cdp.screenshot(out(`${mode}-drag260`));
    await mouse('mouseReleased', 220, 660); await cdp.sleep(120); await cdp.screenshot(out(`${mode}-flyback`));
    await cdp.sleep(800); await cdp.screenshot(out(`${mode}-closed`));
    console.log(mode, 'events', await events(), 'thumb visible', await ev(`document.querySelector('[data-testid=thumb-4]').style.visibility || 'visible'`));
  }

  // ---- glass card
  await load('glass-card,events');
  b = await boxes('glass-card');
  await tap(b[0]);
  for (const ms of [60, 120, 200]) { await cdp.sleep(ms === 60 ? 60 : ms === 120 ? 60 : 80); await cdp.screenshot(out(`card-${ms}`)); }
  await cdp.sleep(700); await cdp.screenshot(out('card-open'));
  await drag(220, 500, 0, 200, 300);
  await cdp.screenshot(out('card-drag'));
  await mouse('mouseReleased', 220, 700); await cdp.sleep(100); await cdp.screenshot(out('card-closing'));
  await cdp.sleep(900); await cdp.screenshot(out('card-closed'));
  } finally {
    clearInterval(keepAlive);
  }
};
