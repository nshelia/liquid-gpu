// Smoke test: both renderer modes, screenshot, console.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5179/';
const out = (n) => new URL(`../out/${n}`, import.meta.url).pathname;
export default async (cdp) => {
  for (const [name, q] of [['smoke-gpu.png', ''], ['smoke-css.png', 'fallback']]) {
    await cdp.goto(BASE + '?' + q);
    await cdp.sleep(1500);
    console.log(name, await cdp.evaluate(`document.querySelector('.lq-root')?.dataset.renderer + ' ready=' + document.documentElement.dataset.ready`));
    await cdp.screenshot(out(name));
  }
};
