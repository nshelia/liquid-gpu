// prefers-reduced-motion: springs become critically damped ≤ 0.2 s (root ctx.spring), the lens lift is disabled.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5179/controls.html';
const out = (n) => new URL(`../out/controls/reduced-${n}.png`, import.meta.url).pathname;
export default async (cdp) => {
  // keep-alive: Node 24's built-in WebSocket does not hold the event loop, so a pending CDP reply alone can let the
  // process exit mid-task ("unsettled top-level await").
  const keepAlive = setInterval(() => {}, 1000);
  try {
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  const ev = (e) => cdp.evaluate(e);
  await cdp.goto(BASE + '?only=switch,menu,zoom&light' + (process.env.MODE === 'css' ? '&fallback' : '')); await cdp.sleep(1200);
  console.log('reducedMotion', await ev('__lqc.reducedMotion'));
  const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
  const rect = async (sel, i = 0) => JSON.parse(await ev(`JSON.stringify(document.querySelectorAll(${JSON.stringify(sel)})[${i}].getBoundingClientRect())`));
  const sw = await rect('[role=switch]', 1);
  await mouse('mousePressed', sw.x + 20, sw.y + 14); await cdp.sleep(200); await cdp.screenshot(out('switch-pressed'));
  await mouse('mouseReleased', sw.x + 20, sw.y + 14); await cdp.sleep(600);
  const b = await rect('[data-section=menu] .lq-placeholder');
  await mouse('mousePressed', b.x + 30, b.y + 17); await cdp.sleep(30); await mouse('mouseReleased', b.x + 30, b.y + 17);
  await cdp.sleep(250); await cdp.screenshot(out('menu-250ms'));
  await mouse('mousePressed', 420, 880); await mouse('mouseReleased', 420, 880); await cdp.sleep(500);
  const t = await rect('[data-testid=thumb-4]');
  await mouse('mousePressed', t.x + 30, t.y + 30); await cdp.sleep(30); await mouse('mouseReleased', t.x + 30, t.y + 30);
  await cdp.sleep(300); await cdp.screenshot(out('zoom-300ms'));
  } finally {
    clearInterval(keepAlive);
  }
};
