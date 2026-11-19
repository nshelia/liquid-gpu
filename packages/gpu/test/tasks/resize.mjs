// Resize + DPR change: canvas backing store and layer textures must follow.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/';
export default async (cdp) => {
  await cdp.goto(BASE);
  await cdp.sleep(1500);
  const info = `JSON.stringify({canvas:[stage.width,stage.height], size: __liquid.renderer.size, list: (()=>{const l=__liquid.renderer.layers?.[0]; return l?[l.texW,l.texH,l.cssW,l.cssH]:null})(), def: stage.getElementImageDefaultSize(list), paints: __liquid.renderer.paintEvents})`;
  console.log('440x900@2', await cdp.evaluate(info));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 3, mobile: false });
  await cdp.sleep(1200);
  console.log('390x844@3', await cdp.evaluate(info));
  await cdp.screenshot(new URL('../out/resized-390@3.png', import.meta.url).pathname);
};
