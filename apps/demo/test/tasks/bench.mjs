// Frame-time benchmark: push/pop cycles and scrolling. Run headless and with --headed.
const BASE = 'http://127.0.0.1:5179/';
const extra = process.env.Q ? '&' + process.env.Q : '';
const probe = `(()=>{const r=__lq.renderer;const of=r.frame.bind(r);window.__cpu=[];r.frame=()=>{const t=performance.now();of();__cpu.push(performance.now()-t)};
 window.__rec=(ms)=>new Promise(res=>{const iv=[];let last=0;const t0=performance.now();__cpu.length=0;const f=(t)=>{if(last)iv.push(t-last);last=t;if(performance.now()-t0<ms)requestAnimationFrame(f);else res(iv)};requestAnimationFrame(f)});
 window.__stats=(iv)=>{const s=[...iv].sort((a,b)=>a-b);const q=p=>+(s[Math.min(s.length-1,Math.floor(p*s.length))]??0).toFixed(2);const c=[...__cpu].sort((a,b)=>a-b);const cq=p=>+(c[Math.min(c.length-1,Math.floor(p*c.length))]??0).toFixed(2);
   return {frames:iv.length,mean:+(iv.reduce((a,b)=>a+b,0)/iv.length).toFixed(2),p50:q(.5),p95:q(.95),p99:q(.99),max:q(1),over1_5x:iv.filter(x=>x>1.5*q(.5)).length,drawCalls:__cpu.length,drawCpuP50:cq(.5),drawCpuP95:cq(.95)}};})()`;
export default async (cdp) => {
  const ev = (e) => Promise.race([cdp.evaluate(e), cdp.sleep(15000).then(() => 'TIMEOUT')]);
  for (const app of ['light', 'dark']) {
    await cdp.goto(`${BASE}?${app}${extra}`); await cdp.sleep(1800);
    await ev(probe);
    const idle = await ev(`__rec(500).then(iv=>JSON.stringify({vsync:__stats(iv).p50}))`);
    const push = await ev(`(async()=>{const p=__rec(4200);for(let i=0;i<3;i++){__demo.push('place');await new Promise(r=>setTimeout(r,700));__demo.pop();await new Promise(r=>setTimeout(r,700));}return JSON.stringify(__stats(await p))})()`);
    const scroll = await ev(`(async()=>{const p=__rec(3000);for(let i=0;i<5;i++){__demo.scrollTo(i%2?0:900,true);await new Promise(r=>setTimeout(r,320));}const sv=document.querySelector('.lq-scroller');return JSON.stringify(__stats(await p))})()`);
    console.log(app, 'idle', idle);
    console.log(app, 'push/pop', push);
    console.log(app, 'scroll', scroll);
  }
};
