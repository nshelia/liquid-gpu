// Interactions: swipe actions, tab switch, tab minimize, sheet drag + scroll hand-off, glass press.
const BASE = 'http://127.0.0.1:5179/';
const out = (n) => new URL(`../out/${n}`, import.meta.url).pathname;
const extra = process.env.Q ? '&' + process.env.Q : '';
const tag = (process.env.Q ?? '').includes('fallback') ? 'css' : 'gpu';
export default async (cdp) => {
  const ev = (e) => Promise.race([cdp.evaluate(e), cdp.sleep(4000).then(() => 'TIMEOUT')]);
  const m = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  const drag = async (x0, y0, x1, y1, steps = 12, hold = false) => { await m('mousePressed', x0, y0); for (let i = 1; i <= steps; i++) { await m('mouseMoved', x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps); await cdp.sleep(16); } if (!hold) await m('mouseReleased', x1, y1); };
  const shot = async (n) => { await cdp.screenshot(out(`${tag}-int-${n}.png`)); };
  // 1. swipe actions
  await cdp.goto(`${BASE}?push=list${extra}`); await cdp.sleep(1600);
  await drag(380, 230, 200, 232, 10); await cdp.sleep(800); await shot('swipe-open');
  console.log('open offset transform', await ev(`document.querySelectorAll('.lq-row-fg')[0].style.transform`));
  await drag(60, 340, 200, 342, 10); await cdp.sleep(800); await shot('swipe-leading');
  // full swipe delete on row 3
  await drag(410, 400, 20, 402, 14); await cdp.sleep(900);
  console.log('rows after full swipe', await ev(`document.querySelectorAll('.lq-row').length`));
  // 2. tab switch by tap + lens
  await cdp.goto(`${BASE}?${extra}`); await cdp.sleep(1600);
  const tabs = JSON.parse(await ev(`JSON.stringify([...document.querySelectorAll('[role=tab]')].map(b=>{const r=b.getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]}))`));
  console.log('tabs', JSON.stringify(tabs));
  await m('mousePressed', tabs[1][0], tabs[1][1]); await cdp.sleep(120); await shot('tab-press'); await m('mouseReleased', tabs[1][0], tabs[1][1]);
  await cdp.sleep(900); await shot('tab-photos');
  console.log('selected tab', await ev(`document.querySelector('[role=tab][aria-selected=true]').getAttribute('aria-label')`));
  // 3. minimize: drag photos down
  await drag(220, 800, 220, 500, 15, true); await cdp.sleep(300); await shot('minimized-drag'); await m('mouseReleased', 220, 500);
  await cdp.sleep(900); await shot('minimized');
  // 4. sheet: open, drag up via content (hand-off), then scroll, then pull down to dismiss
  await cdp.goto(`${BASE}?sheet=1${extra}`); await cdp.sleep(1600);
  await drag(220, 700, 220, 400, 12); await cdp.sleep(900); await shot('sheet-handoff-large');
  console.log('sheet layer transform', await ev(`[...document.querySelectorAll('.lq-sheet')].map(e=>e.getBoundingClientRect().y).join(',')`));
  await drag(220, 600, 220, 300, 12); await cdp.sleep(700);
  console.log('sheet content scrollTop', await ev(`document.querySelector('.lq-sheet .lq-scroller').scrollTop`));
  await drag(220, 300, 220, 700, 8); await cdp.sleep(1000); await shot('sheet-after-pull');
  console.log('sheet top after pull', await ev(`(document.querySelector('.lq-sheet')?.getBoundingClientRect().y ?? 'gone')`));
  // 5. glass press + drag
  await cdp.goto(`${BASE}?push=glass${extra}`); await cdp.sleep(1600);
  const b = JSON.parse(await ev(`JSON.stringify((()=>{const r=document.querySelector('[aria-label=Search]').getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})())`));
  await drag(b[0], b[1], b[0] + 40, b[1] - 30, 8, true); await cdp.sleep(250); await shot('glass-press-drag'); await m('mouseReleased', b[0] + 40, b[1] - 30);
};
