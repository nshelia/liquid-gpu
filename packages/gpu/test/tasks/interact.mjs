// Hit testing, wheel scrolling (changedElements), press/drag flex, and the appearance toggle.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/';
export default async (cdp) => {
  await cdp.goto(BASE);
  await cdp.sleep(2000);
  const ev = (e) => cdp.evaluate(e);
  console.log('hit', await ev(`JSON.stringify([[38,76],[300,420],[357,843],[391,843],[60,843],[355,76]].map(([x,y])=>{const e=document.elementFromPoint(x,y);return [x,y,e?.id||e?.className||e?.tagName]}))`));
  const before = await ev(`document.getElementById('list').scrollTop`);
  const p0 = await ev(`__liquid.renderer.paintEvents`);
  for (let i = 0; i < 10; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 220, y: 500, deltaX: 0, deltaY: 60 }); await cdp.sleep(30); }
  await cdp.sleep(600);
  console.log('wheel scrollTop', before, '->', await ev(`document.getElementById('list').scrollTop`), 'paint events', (await ev(`__liquid.renderer.paintEvents`)) - p0, 'last changedElements.length', await ev(`__liquid.renderer.lastChangedElements`));
  console.log('captures per frame during scroll', await ev(`JSON.stringify(__liquid.stats.slice(-8).map(s=>s.captures))`));
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 391, y: 843, button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i++) { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 391 - i * 5, y: 843 - i * 4, button: 'left', buttons: 1 }); await cdp.sleep(16); }
  await cdp.sleep(400);
  console.log('fabB flex during drag', await ev(`JSON.stringify(__liquid.buttons.find(b=>b.id==='fabB').glass.flex)`));
  console.log('fabB hit-test rect (follows flex)', await ev(`JSON.stringify(document.getElementById('fabB').getBoundingClientRect())`));
  await cdp.screenshot(new URL('../out/interact-drag.png', import.meta.url).pathname);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 351, y: 811, button: 'left', clickCount: 1 });
  await cdp.sleep(1500);
  console.log('fabB flex after release', await ev(`JSON.stringify(__liquid.buttons.find(b=>b.id==='fabB').glass.flex)`));
  const tb = await ev(`JSON.stringify(document.getElementById('toggle').getBoundingClientRect())`);
  const t = JSON.parse(tb);
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: t.x + t.width / 2, y: t.y + t.height / 2, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: t.x + t.width / 2, y: t.y + t.height / 2, button: 'left', clickCount: 1 });
  await cdp.sleep(800);
  console.log('toggle rect', tb, '→ appearance', await ev(`document.documentElement.className + '/' + __liquid.renderer.appearance`));
};
