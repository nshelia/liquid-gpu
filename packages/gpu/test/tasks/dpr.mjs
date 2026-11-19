export default async (cdp) => {
  await cdp.goto((process.env.BASE ?? 'http://127.0.0.1:5178/'));
  await cdp.sleep(1500);
  console.log(await cdp.evaluate(`new Promise(res=>{const ro=new ResizeObserver(es=>{const e=es[0];res(JSON.stringify({dpr:devicePixelRatio, dp:e.devicePixelContentBoxSize?.[0] && [e.devicePixelContentBoxSize[0].inlineSize,e.devicePixelContentBoxSize[0].blockSize], cb:[e.contentBoxSize[0].inlineSize,e.contentBoxSize[0].blockSize], cw:stage.clientWidth}));ro.disconnect()});ro.observe(stage,{box:'device-pixel-content-box'})})`));
};
