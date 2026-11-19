// Photos page captures at 440 × 956 @3x for comparison with uikit-internals/deep/photos-transition/raw/photos-p2.mp4.
// Usage (from apps/demo): test/run.sh test/tasks/photos-shots.mjs --dpr=3 --h=956
//   STEPS=lib,menu,menuportrait,commit,tap,swipe,page (default: all but page, menuportrait)   AP=dark   W=<width tag>
const BASE = process.env.BASE ?? 'http://127.0.0.1:5179/photos.html';
const out = (n) => new URL(`../out/photos/${process.env.AP ?? 'light'}-${n}.png`, import.meta.url).pathname;
const steps = new Set((process.env.STEPS ?? 'lib,menu,commit,tap,swipe').split(','));
export default async (cdp) => {
  const keepAlive = setInterval(() => {}, 1000);
  try {
    (await import('node:fs')).mkdirSync(new URL('../out/photos/', import.meta.url), { recursive: true });
    const ev = (e) => cdp.evaluate(e);
    const rect = async (sel) => JSON.parse(await ev(`JSON.stringify(document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect())`));
    const mouse = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mouseReleased' ? 0 : 1 });
    const tap = async (x, y) => { await mouse('mousePressed', x, y); await cdp.sleep(50); await mouse('mouseReleased', x, y); };
    const load = async () => { await cdp.goto(BASE + (process.env.AP === 'dark' ? '?dark' : '')); await cdp.sleep(2500); };
    await load();
    console.log('renderer', await ev(`document.querySelector('.lq-root')?.dataset.renderer`));
    const c0 = await rect('[data-testid=cell-0]');
    console.log('cell0', JSON.stringify(c0));
    if (steps.has('lib')) await cdp.screenshot(out('library'));

    if (steps.has('menu') || steps.has('commit')) {
      const c = await rect('[data-testid=cell-7]');
      const x = c.x + c.width / 2, y = c.y + c.height / 2;
      await mouse('mousePressed', x, y);
      await cdp.sleep(450); await cdp.screenshot(out('prelift'));
      await cdp.sleep(1300);
      await mouse('mouseReleased', x, y);
      await cdp.sleep(500); await cdp.screenshot(out('menu'));
      if (steps.has('commit')) {
        // Tap the preview (centred, near the cell's vertical centre).
        await tap(220, 300);
        await cdp.sleep(120); await cdp.screenshot(out('commit-mid'));
        await cdp.sleep(900); await cdp.screenshot(out('committed'));
        await ev(`window.__photos.close()`);
        await cdp.sleep(900);
      } else {
        await tap(220, 60);
        await cdp.sleep(900);
      }
    }
    if (steps.has('menuportrait')) {
      // Portrait photo (id 35, cell 14, right column near the bottom): the menu must sit one spacing below the
      // preview, trailing-aligned (uikit-internals/deep/ctxmenu-fit). Logs both rects.
      await load();
      // First visible cell showing a portrait photo (ids 35, 57, 88, 260).
      const c = JSON.parse(await ev(`JSON.stringify((() => {
        const vh = innerHeight;
        for (const el of document.querySelectorAll('[data-testid^=cell-]')) {
          const img = el.querySelector('img'); const r = el.getBoundingClientRect();
          if (img && ['35', '57', '88', '260'].some((id) => img.src.endsWith('/' + id + '_t.jpg')) && r.top > 140 && r.top + r.height / 2 < vh - 120) return { x: r.x, y: r.y, width: r.width, height: r.height, id: el.dataset.testid, src: img.src };
        }
        return null;
      })())`));
      console.log('portrait cell', JSON.stringify(c));
      const x = c.x + c.width / 2, y = c.y + c.height / 2;
      await mouse('mousePressed', x, y);
      await cdp.sleep(1600);
      await mouse('mouseReleased', x, y);
      await cdp.sleep(700); await cdp.screenshot(out(`menu-portrait-${process.env.W ?? 440}`));
      console.log('menu rect', await ev(`JSON.stringify([...document.querySelectorAll('[role=menu]')].map(m=>{const r=m.getBoundingClientRect();return [r.x,r.y,r.width,r.height]}))`));
      await tap(20, 20);
      await cdp.sleep(800);
    }
    if (steps.has('tap') || steps.has('swipe')) {
      const c = await rect('[data-testid=cell-7]');
      await tap(c.x + c.width / 2, c.y + c.height / 2);
      await cdp.sleep(100); await cdp.screenshot(out('open-mid'));
      await cdp.sleep(900); await cdp.screenshot(out('oneup'));
      if (steps.has('swipe')) {
        const x = 220, y0 = 478;
        await mouse('mousePressed', x, y0);
        for (let k = 1; k <= 30; k++) { await mouse('mouseMoved', x, y0 + (300 * k) / 30); await cdp.sleep(16); }
        await cdp.sleep(200); await cdp.screenshot(out('swipe300'));
        await mouse('mouseReleased', x, y0 + 300);
        await cdp.sleep(90); await cdp.screenshot(out('swipe-release'));
        await cdp.sleep(900); await cdp.screenshot(out('after-swipe'));
      }
    }
    if (steps.has('page')) {
      await load();
      const c = await rect('[data-testid=cell-7]');
      await tap(c.x + c.width / 2, c.y + c.height / 2);
      await cdp.sleep(1000);
      const date0 = await ev(`document.querySelector('[aria-label=Filmstrip]')?.parentElement?.innerText.replace(/\\s+/g,' ')`);
      const y = 478, x0 = 330;
      await mouse('mousePressed', x0, y);
      // A flick: screenshot mid-move, then release while still moving (a held release would not page under 240 pt).
      for (let k = 1; k <= 10; k++) { await mouse('mouseMoved', x0 - (200 * k) / 10, y); if (k === 6) await cdp.screenshot(out('page-drag')); else await cdp.sleep(4); }
      await mouse('mouseReleased', x0 - 200, y);
      await cdp.sleep(120); await cdp.screenshot(out('page-release'));
      await cdp.sleep(1200); await cdp.screenshot(out('page-settled'));
      const date1 = await ev(`document.querySelector('[aria-label=Filmstrip]')?.parentElement?.innerText.replace(/\\s+/g,' ')`);
      console.log('date before/after page', date0, '/', date1);
      // swipe down → should land in cell 8
      await mouse('mousePressed', 220, y);
      for (let k = 1; k <= 30; k++) { await mouse('mouseMoved', 220, y + (300 * k) / 30); await cdp.sleep(16); }
      await mouse('mouseReleased', 220, y + 300);
      await cdp.sleep(90); await cdp.screenshot(out('page-dismiss-mid'));
      await cdp.sleep(1000); await cdp.screenshot(out('page-dismissed'));
      const c8 = await rect('[data-testid=cell-8]');
      console.log('cell8', JSON.stringify(c8), 'hidden cells', await ev(`[...document.querySelectorAll('[data-testid^=cell-]')].filter(e=>e.style.visibility==='hidden').map(e=>e.dataset.testid).join(',')`));
    }
  } finally {
    clearInterval(keepAlive);
  }
};
