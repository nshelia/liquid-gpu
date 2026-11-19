// Screenshots in both appearances, scrolled so content sits behind the glass, plus pressed/drag states.
const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/';
const out = (n) => new URL(`../out/${n}`, import.meta.url).pathname;
export default async (cdp) => {
  const cases = [
    ['light-top.png', ''], ['dark-top.png', 'dark=1'],
    ['light-scrolled.png', 'scroll=330'], ['dark-scrolled.png', 'scroll=330&dark=1'],
    ['light-press-drag.png', 'scroll=330&press=fabA&drag=-40,-30'], ['dark-press-lens.png', 'scroll=330&dark=1&press=lens&drag=60,0'],
    ['fallback-light.png', 'scroll=330&fallback=1'],
  ];
  for (const [name, q] of cases) {
    await cdp.goto(BASE + '?' + q);
    await cdp.sleep(2000);
    console.log(name, await cdp.evaluate(`document.documentElement.dataset.renderer + ' ' + (document.documentElement.dataset.error ?? '')`));
    await cdp.screenshot(out(name));
  }
};
