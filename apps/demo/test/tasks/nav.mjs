// Navigation + scroll smoke: screenshot root, scroll by drag, push, mid-push, pop.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5179/';
const out = (n) => new URL(`../out/${n}`, import.meta.url).pathname;
const Q = process.env.Q ?? '';
export default async (cdp) => {
  await cdp.goto(BASE + '?' + Q);
  await cdp.sleep(1500);
  const tag = Q.includes('fallback') ? 'css' : 'gpu';
  console.log('renderer', await cdp.evaluate(`document.querySelector('.lq-root')?.dataset.renderer`));
  await cdp.screenshot(out(`nav-${tag}-root.png`)); console.log("shot root");
  // drag up 300px
  const m = (type, x, y) => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
  await m('mousePressed', 220, 700);
  for (let i = 1; i <= 15; i++) { await m('mouseMoved', 220, 700 - i * 20); await cdp.sleep(16); }
  await m('mouseReleased', 220, 400);
  await cdp.sleep(1500);
  await cdp.screenshot(out(`nav-${tag}-scrolled.png`)); console.log("shot scrolled");
  const r = JSON.parse(await cdp.evaluate(`JSON.stringify(document.querySelector('[data-row="12"]').getBoundingClientRect())`));
  console.log('row12', r.y);
  await m('mousePressed', 220, r.y + 20); await m('mouseReleased', 220, r.y + 20);
  await cdp.sleep(120);
  await cdp.screenshot(out(`nav-${tag}-pushing.png`)); console.log("shot pushing");
  await cdp.sleep(900);
  await cdp.screenshot(out(`nav-${tag}-pushed.png`)); console.log("shot pushed");
  // interactive back swipe from the edge
  await m('mousePressed', 10, 500);
  for (let i = 1; i <= 10; i++) { await m('mouseMoved', 10 + i * 18, 500); await cdp.sleep(16); }
  await cdp.screenshot(out(`nav-${tag}-swipe.png`)); console.log("shot swipe");
  for (let i = 11; i <= 14; i++) { await m('mouseMoved', 10 + i * 18, 500); await cdp.sleep(16); }
  await m('mouseReleased', 262, 500);
  await cdp.sleep(1000);
  await cdp.screenshot(out(`nav-${tag}-popped.png`)); console.log("shot popped");
  console.log('depth', await cdp.evaluate(`document.querySelectorAll('.lq-screen').length`));
};
