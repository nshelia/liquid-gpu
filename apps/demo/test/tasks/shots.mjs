// Showcase screenshots. Usage: Q=fallback test/run.sh test/tasks/shots.mjs
const BASE = 'http://127.0.0.1:5179/';
const out = (n) => new URL(`../out/${n}`, import.meta.url).pathname;
const extra = process.env.Q ? '&' + process.env.Q : '';
const tag = (process.env.Q ?? '').includes('fallback') ? 'css' : 'gpu';
const CASES = (process.env.CASES ?? 'home,home-scrolled,glass,list,toolbar,sheet,sheet-large,photos,settings').split(',');
const Q = { home: '', 'home-scrolled': 'scroll=360', glass: 'push=glass', list: 'push=list', toolbar: 'push=toolbar', sheet: 'sheet=1', 'sheet-large': 'sheet=1', photos: 'tab=photos', settings: 'tab=settings', place: 'push=place', scroll: 'push=scroll' };
export default async (cdp) => {
  const ev = (e) => Promise.race([cdp.evaluate(e), cdp.sleep(4000).then(() => 'TIMEOUT')]);
  for (const app of (process.env.APPEARANCES ?? 'light,dark').split(',')) {
    for (const c of CASES) {
      await cdp.goto(`${BASE}?${app}&${Q[c]}${extra}`);
      await cdp.sleep(1600);
      if (c === 'sheet-large') {
        const m = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
        await m('mousePressed', 220, 470); for (let i = 1; i <= 12; i++) { await m('mouseMoved', 220, 470 - i * 30); await cdp.sleep(16); } await m('mouseReleased', 220, 110);
        await cdp.sleep(1200);
      }
      const r = await ev(`document.documentElement.dataset.renderer`);
      await cdp.screenshot(out(`${tag}-${app}-${c}.png`));
      console.log(c, app, r);
    }
  }
};
