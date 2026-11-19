// Screenshots of the controls showcase in both renderer modes and appearances.
// node packages/gpu/test/cdp.mjs http://127.0.0.1:5179/controls.html apps/demo/test/tasks/controls-shots.mjs
const BASE = process.env.BASE ?? 'http://127.0.0.1:5179/controls.html';
const out = (n) => new URL(`../out/controls/${n}`, import.meta.url).pathname;
const only = process.env.ONLY;
export default async (cdp) => {
  // keep-alive: Node 24's built-in WebSocket does not hold the event loop, so a pending CDP reply alone can let the
  // process exit mid-task ("unsettled top-level await").
  const keepAlive = setInterval(() => {}, 1000);
  try {
  for (const mode of ['gpu', 'css']) for (const ap of ['light', 'dark']) {
    if (only && !`${mode}-${ap}`.includes(only)) continue;
    const qs = [ap, mode === 'css' ? 'fallback' : ''].filter(Boolean).join('&');
    await cdp.goto(BASE + '?' + qs);
    await cdp.sleep(1500);
    console.log(mode, ap, await cdp.evaluate(`document.querySelector('.lq-root')?.dataset.renderer + ' ready=' + document.documentElement.dataset.ready`));
    const sections = await cdp.evaluate(`JSON.stringify([...document.querySelectorAll('[data-section]')].map(s=>s.dataset.section))`);
    let page = 0;
    await cdp.screenshot(out(`${mode}-${ap}-0.png`));
    // scroll by wheel through the page
    for (let i = 1; i <= Number(process.env.PAGES ?? 2); i++) {
      for (let k = 0; k < 8; k++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 220, y: 500, deltaX: 0, deltaY: 100 }); await cdp.sleep(20); }
      await cdp.sleep(900);
      await cdp.screenshot(out(`${mode}-${ap}-${i}.png`));
    }
    console.log('sections', sections);
  }
  } finally {
    clearInterval(keepAlive);
  }
};
