// Switch press/drag (lens lift), slider drag + past-end stretch, stepper auto-repeat, segmented lens travel.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5179/controls.html';
const tag = `${process.env.MODE ?? 'gpu'}-${process.env.AP ?? 'light'}`;
const out = (n) => new URL(`../out/controls/${tag}-${n}.png`, import.meta.url).pathname;
export default async (cdp) => {
  // keep-alive: Node 24's built-in WebSocket does not hold the event loop, so a pending CDP reply alone can let the
  // process exit mid-task ("unsettled top-level await").
  const keepAlive = setInterval(() => {}, 1000);
  try {
  const ev = (e) => cdp.evaluate(e);
  const qs = ['only=switch,segmented,slider,stepper', process.env.AP ?? 'light', process.env.MODE === 'css' ? 'fallback' : ''].filter(Boolean).join('&');
  await cdp.goto(BASE + '?' + qs); await cdp.sleep(1200);
  const rect = async (sel, i = 0) => JSON.parse(await ev(`JSON.stringify(document.querySelectorAll(${JSON.stringify(sel)})[${i}].getBoundingClientRect())`));
  const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
  // Switch 2 (off): press and hold → lens lifted; tap → toggles.
  const sw = await rect('[role=switch]', 1);
  const kx = sw.x + 20.5, ky = sw.y + 14;
  await mouse('mousePressed', kx, ky); await cdp.sleep(250); await cdp.screenshot(out('switch-pressed'));
  await mouse('mouseReleased', kx, ky); await cdp.sleep(120); await cdp.screenshot(out('switch-travel'));
  await cdp.sleep(800);
  console.log('switch2 after tap', await ev(`document.querySelectorAll('[role=switch]')[1].getAttribute('aria-checked')`));
  // Drag switch 2 knob back to the left (on → off) with overshoot
  await mouse('mousePressed', sw.x + 42.5, ky);
  for (let i = 1; i <= 10; i++) { await mouse('mouseMoved', sw.x + 42.5 - i * 5, ky); await cdp.sleep(16); }
  await cdp.screenshot(out('switch-drag'));
  await mouse('mouseReleased', sw.x - 7.5, ky); await cdp.sleep(800);
  console.log('switch2 after drag left', await ev(`document.querySelectorAll('[role=switch]')[1].getAttribute('aria-checked')`));
  // Segmented: tap Month; screenshot mid-travel
  const m = await rect('[role=radio]', 2);
  await mouse('mousePressed', m.x + m.width / 2, m.y + 16); await cdp.sleep(40); await mouse('mouseReleased', m.x + m.width / 2, m.y + 16);
  await cdp.sleep(130); await cdp.screenshot(out('segmented-travel'));
  await cdp.sleep(900);
  console.log('segmented', await ev(`[...document.querySelectorAll('[role=radio]')].map(r=>r.getAttribute('aria-checked')).join(',')`));
  // Slider 1: drag thumb +90 pt, then past the end
  const sl = await rect('[role=slider]', 0);
  const v0 = Number(await ev(`document.querySelectorAll('[role=slider]')[0].getAttribute('aria-valuenow')`));
  const tx = sl.x + v0 * (sl.width - 37) + 18.5, ty = sl.y + 17;
  await mouse('mousePressed', tx, ty);
  for (let i = 1; i <= 15; i++) { await mouse('mouseMoved', tx + i * 6, ty); await cdp.sleep(16); }
  await cdp.screenshot(out('slider-drag'));
  const v1 = Number(await ev(`document.querySelectorAll('[role=slider]')[0].getAttribute('aria-valuenow')`));
  for (let i = 1; i <= 20; i++) { await mouse('mouseMoved', Math.min(436, tx + 90 + i * 20), ty); await cdp.sleep(16); }
  await cdp.sleep(100); await cdp.screenshot(out('slider-pastend'));
  await mouse('mouseReleased', 436, ty); await cdp.sleep(800);
  console.log('slider', v0, '→', v1, '(expect +', ((90 - 10) / sl.width).toFixed(3), ') end', await ev(`document.querySelectorAll('[role=slider]')[0].getAttribute('aria-valuenow')`));
  // Stepper: hold + for 2.3 s
  const plus = await rect('[aria-label=Increment]');
  if (process.env.DEBUG) await ev(`(()=>{const b=document.querySelector('[aria-label=Increment]'); ['pointerdown','pointerup','pointerleave','pointercancel','click'].forEach(t=>b.addEventListener(t,e=>console.log('stepper', t, e.clientX, e.clientY)))})()`);
  if (process.env.DEBUG) console.log('plus rect', JSON.stringify(plus), 'hit', await ev(`document.elementFromPoint(${plus.x + 20}, ${plus.y + 16})?.getAttribute('aria-label')`));
  const c0 = Number(await ev(`document.querySelector('[data-testid=stepper-value]').textContent`));
  // (A screenshot taken during a press makes headless Chrome send pointerleave, which ends the hold: hold without one.)
  await mouse('mousePressed', plus.x + 20, plus.y + 16);
  await cdp.sleep(2300); await mouse('mouseReleased', plus.x + 20, plus.y + 16); await cdp.sleep(100);
  const c1 = Number(await ev(`document.querySelector('[data-testid=stepper-value]').textContent`));
  console.log('stepper hold 2.3 s:', c0, '→', c1, '(expect +4 at 0.5,1.0,1.5,2.0; +5 if the 2.5 s repeat lands)');
  await mouse('mousePressed', plus.x + 20, plus.y + 16); await cdp.sleep(60); await mouse('mouseReleased', plus.x + 20, plus.y + 16); await cdp.sleep(100);
  console.log('stepper tap', await ev(`document.querySelector('[data-testid=stepper-value]').textContent`));
  } finally {
    clearInterval(keepAlive);
  }
};
