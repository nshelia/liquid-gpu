// Scroll the list for N frames and report frame intervals / renderer CPU / submit→done GPU latency.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/';
export default async (cdp) => {
  for (const q of ['', 'dark=1']) {
    await cdp.goto(BASE + '?' + q);
    await cdp.sleep(2000);
    const r = await cdp.evaluate(`__liquid.bench(${process.env.FRAMES ?? 300}, 6).then(JSON.stringify)`);
    console.log(q || 'light', r);
  }
};
