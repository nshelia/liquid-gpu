// Photos header: white at the top, dark scrim + white text once the grid passes under it (deep/photos-header).
// Usage (apps/demo): test/run.sh test/tasks/photos-header.mjs --dpr=3 --h=956
const out = (n) => new URL(`../out/photos/header-${n}.png`, import.meta.url).pathname;
export default async (cdp) => {
  const keep = setInterval(() => {}, 1000);
  try {
    await cdp.goto('http://127.0.0.1:5179/photos.html?top&clock=9:31'); await cdp.sleep(2500);
    await cdp.screenshot(out('top'));
    const at = async (o, name, settle = 700) => { await cdp.evaluate(`window.__photos.scrollTo(${o})`); await cdp.sleep(settle); await cdp.screenshot(out(name)); };
    await at(120, 'o120');
    await at(160, 'switching', 115); // ≈ half-way through the 0.23 s crossfade
    await cdp.sleep(600); await cdp.screenshot(out('o160'));
    await at(420, 'o420');
  } finally { clearInterval(keep); }
};
