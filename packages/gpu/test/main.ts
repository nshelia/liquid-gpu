/**
 * @liquid-gpu/gpu test page: a scrolling DOM list (images + Georgian text) captured as a layer, a glass nav bar,
 * a floating two-button glass group that merges (spacing 20), a tab-bar platter with the liquid lens, press/drag
 * flex on the glass buttons, and a light/dark toggle.
 *
 * Motion comes from @liquid-gpu/core (flexTransform [GD §4], flex/glow/lens spring presets).
 *
 * URL params: ?dark=1  ?fallback=1  ?scroll=<px>  ?press=fabA|fabB|navBack|lens  ?drag=<dx>,<dy>  ?bench=1
 */
import { createRenderer, LiquidRenderer, type GlassShape, type Layer, type Renderer, type Rect, type FrameStats } from '../src/index';
import { Spring, springs, resolveFlexSpec, flexTransform, flexGlow, type SpringParams } from '@liquid-gpu/core';

/** Spring preset or ad-hoc (ζ, response); every value used below cites its source. */
const sp = (dampingRatio: number, response: number): SpringParams => ({ dampingRatio, response });
const to = (s: Spring, target: number, params: SpringParams) => s.setTarget(target, { params });

const params = new URLSearchParams(location.search);
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

// ------------------------------------------------------------------------------------------- content
function paintPhoto(seed: number, w: number, h: number): string {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const hue = (seed * 47) % 360;
  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0, `hsl(${hue}, 80%, 62%)`);
  sky.addColorStop(0.6, `hsl(${(hue + 40) % 360}, 85%, 72%)`);
  sky.addColorStop(1, `hsl(${(hue + 80) % 360}, 70%, 55%)`);
  g.fillStyle = sky;
  g.fillRect(0, 0, w, h);
  g.fillStyle = `hsla(${(hue + 180) % 360}, 90%, 85%, 0.9)`;
  g.beginPath();
  g.arc(w * (0.2 + rnd() * 0.6), h * (0.2 + rnd() * 0.2), Math.min(w, h) * 0.12, 0, Math.PI * 2);
  g.fill();
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = `hsl(${(hue + 200 + layer * 25) % 360}, ${45 + layer * 10}%, ${45 - layer * 12}%)`;
    g.beginPath();
    g.moveTo(0, h);
    let x = 0;
    const base = h * (0.5 + layer * 0.14);
    while (x <= w) {
      g.lineTo(x, base - rnd() * h * 0.22);
      x += w / (6 + rnd() * 6);
    }
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  }
  // Stripes so refraction is easy to see.
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 8; i++) g.fillRect(0, (h / 8) * i, w, h / 40);
  return c.toDataURL('image/jpeg', 0.85);
}

const PLACES = [
  ['თბილისი', 'ძველი ქალაქი · 214 ფოტო'],
  ['მცხეთა', 'სვეტიცხოველი · 58 ფოტო'],
  ['ყაზბეგი', 'გერგეტის სამება · 131 ფოტო'],
  ['ბათუმი', 'ზღვისპირა ბულვარი · 77 ფოტო'],
  ['სიღნაღი', 'სიყვარულის ქალაქი · 42 ფოტო'],
  ['უშგული', 'სვანეთის კოშკები · 96 ფოტო'],
  ['ვარძია', 'კლდის მონასტერი · 33 ფოტო'],
  ['ქუთაისი', 'ბაგრატის ტაძარი · 61 ფოტო'],
];

function buildContent(): void {
  $('hero').style.backgroundImage = `url(${paintPhoto(3, 880, 460)})`;
  $('hero2').style.backgroundImage = `url(${paintPhoto(11, 880, 460)})`;
  for (const [id, offset] of [['rows', 0], ['rows2', 4]] as const) {
    const box = $(id);
    for (let i = 0; i < 8; i++) {
      const [t, sub] = PLACES[(i + offset) % PLACES.length]!;
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `<img alt="" src="${paintPhoto(i + offset * 3 + 20, 92, 92)}"><div class="t"><b>${t}</b><i>${sub}</i></div><span class="chev">›</span>`;
      box.appendChild(row);
    }
  }
  const grid = $('grid');
  for (let i = 0; i < 12; i++) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = paintPhoto(i + 40, 200, 200);
    grid.appendChild(img);
  }
}

// ------------------------------------------------------------------------------------------- scene
interface Button {
  id: string;
  el: HTMLElement;
  layer: Layer;
  glass: GlassShape;
  rect: Rect;
  sx: Spring;
  sy: Spring;
  tx: Spring;
  ty: Spring;
  gx: Spring;
  gy: Spring;
  gOpacity: Spring;
  gScale: Spring;
  press: Spring;
  down?: { x: number; y: number; id: number };
}

let renderer: Renderer;
const buttons: Button[] = [];
let lens: { glass: GlassShape; x: Spring; press: Spring; size: Spring; index: number; down?: number } | null = null;
let listLayer: Layer;
let hud: Layer;
let tabsLayer: Layer;
let tabRect: Rect;
let animating = false;
let last = 0;
const stats: FrameStats[] = [];

function placeLayer(layer: Layer, rect: Rect, sx = 1, sy = 1, tx = 0, ty = 0): void {
  const cx = rect.x + rect.width / 2 + tx;
  const cy = rect.y + rect.height / 2 + ty;
  layer.transform = new DOMMatrix().translate(cx, cy).scale(sx, sy).translate(-rect.width / 2, -rect.height / 2);
}

function makeButton(id: string, rect: Rect, group: string, spacing: number, capture = true): Button {
  const el = $(id);
  const layer = renderer.addLayer(el, 11);
  const glass = renderer.addGlass({ group, rect, spacing, interactive: true, z: 10 });
  const spec = resolveFlexSpec({ w: rect.width, h: rect.height });
  const mk = (v: number) => new Spring(v, spec.tracking);
  const b: Button = {
    id,
    el,
    layer,
    glass,
    rect,
    sx: mk(1),
    sy: mk(1),
    tx: mk(0),
    ty: mk(0),
    gx: new Spring(0, springs.glowMove),
    gy: new Spring(0, springs.glowMove),
    gOpacity: new Spring(0, springs.glowShow),
    gScale: new Spring(1, springs.glowShow),
    press: new Spring(0, springs.glowShow),
  };
  placeLayer(layer, rect);
  attachFlex(b, capture);
  buttons.push(b);
  return b;
}

/** Press/drag → flex transform targets + glow choreography ([GD §3, §4, §7], [LG §9]). */
/**
 * `capture` = false for containers of real <button>s: pointer capture would retarget their click to the container.
 */
function attachFlex(b: Button, capture: boolean): void {
  const spec = resolveFlexSpec({ w: b.rect.width, h: b.rect.height });
  const local = (e: PointerEvent) => ({ x: e.clientX - b.rect.x, y: e.clientY - b.rect.y });
  b.el.addEventListener('pointerdown', (e) => {
    if (capture) b.el.setPointerCapture(e.pointerId);
    const p = local(e);
    b.down = { ...p, id: e.pointerId };
    pressTo(b, p, p);
    // Glow show at the touch point: spring (1.0, 0.1) [GD §7].
    b.gx.snap(e.clientX);
    b.gy.snap(e.clientY);
    to(b.gOpacity, 1, springs.glowShow);
    b.gScale.snap(1);
    to(b.press, 1, springs.glowShow);
    kick();
  });
  b.el.addEventListener('pointermove', (e) => {
    if (!b.down || b.down.id !== e.pointerId) return;
    const p = local(e);
    pressTo(b, b.down, p);
    // Follow the clamped finger: spring (1.0, 0.15) [GD §7].
    const cx = Math.min(b.rect.x + b.rect.width, Math.max(b.rect.x, e.clientX));
    const cy = Math.min(b.rect.y + b.rect.height, Math.max(b.rect.y, e.clientY));
    to(b.gx, cx, springs.glowMove);
    to(b.gy, cy, springs.glowMove);
    // Dissipate beyond littleGlowDissipationDistance 50: scale 2, opacity ½, spring (1, 0.5) [GD §7].
    if (Math.hypot(p.x - b.down.x, p.y - b.down.y) > spec.littleGlowDissipationDistance) {
      to(b.gScale, flexGlow.dissipatedScale, springs.glowDissipate);
      to(b.gOpacity, flexGlow.dissipatedOpacityFactor, springs.glowDissipate);
    }
    kick();
  });
  const up = (e: PointerEvent) => {
    if (!b.down || b.down.id !== e.pointerId) return;
    b.down = undefined;
    // Release: identity with the release spring [GD §6]; glow scale → 4, opacity → 0 with (1, 0.5) [GD §7].
    for (const [s, v] of [[b.sx, 1], [b.sy, 1], [b.tx, 0], [b.ty, 0]] as const) to(s, v, spec.release);
    to(b.gScale, flexGlow.releaseScale, springs.glowHide);
    to(b.gOpacity, 0, springs.glowHide);
    to(b.press, 0, springs.glowHide);
    kick();
  };
  b.el.addEventListener('pointerup', up);
  b.el.addEventListener('pointercancel', up);
  if (!capture) b.el.addEventListener('pointerleave', up);
}

function pressTo(b: Button, down: { x: number; y: number }, finger: { x: number; y: number }): void {
  const spec = resolveFlexSpec({ w: b.rect.width, h: b.rect.height });
  const f = flexTransform({ w: b.rect.width, h: b.rect.height }, down, finger, true, spec);
  to(b.sx, f.sx, spec.tracking);
  to(b.sy, f.sy, spec.tracking);
  to(b.tx, f.tx, spec.tracking);
  to(b.ty, f.ty, spec.tracking);
}

function tabCenter(i: number): number {
  return tabRect.x + (tabRect.width / 6) * (2 * i + 1);
}

function setupTabs(W: number, H: number): void {
  // Tab platter 274×62 for 3 tabs [LG §10].
  tabRect = { x: 16, y: H - 62 - 26, width: 274, height: 62 };
  renderer.addGlass({ group: 'tabs', rect: tabRect, z: 10 });
  tabsLayer = renderer.addLayer($('tabs'), 13);
  placeLayer(tabsLayer, tabRect);
  // Selection lens 94×54, radius 27 at rest; 110×70 while pressed (+8 pt per side) [LG §10].
  const glass = renderer.addGlass({ group: 'lens', rect: { x: 0, y: 0, width: 94, height: 54 }, radius: 27, style: 'lens', z: 12 });
  lens = { glass, x: new Spring(tabCenter(0), springs.tabLensMove), press: new Spring(0, springs.tabLensLift), size: new Spring(0, springs.tabLensLift), index: 0 };
  const el = $('tabs');
  const indexAt = (x: number) => Math.max(0, Math.min(2, Math.floor(((x - tabRect.x) / tabRect.width) * 3)));
  el.addEventListener('pointerdown', (e) => {
    if (!lens) return;
    el.setPointerCapture(e.pointerId);
    lens.down = e.pointerId;
    // Lift: spring (1.0, 0.25) [LG §10].
    to(lens.press, 1, springs.tabLensLift);
    to(lens.size, 1, springs.tabLensLift);
    to(lens.x, e.clientX, springs.tabLensMove);
    kick();
  });
  el.addEventListener('pointermove', (e) => {
    if (!lens || lens.down !== e.pointerId) return;
    to(lens.x, Math.min(tabCenter(2), Math.max(tabCenter(0), e.clientX)), sp(1, 0.25)); // follows the finger with the lift spring [LG §10]
    kick();
  });
  const up = (e: PointerEvent) => {
    if (!lens || lens.down !== e.pointerId) return;
    lens.down = undefined;
    const i = indexAt(e.clientX);
    lens.index = i;
    el.querySelectorAll('.tab').forEach((t, j) => t.classList.toggle('sel', j === i));
    // Tab-switch move (0.85, 0.4); dematerialize (1.0, 0.4) [LG §10].
    to(lens.x, tabCenter(i), springs.tabLensMove);
    to(lens.press, 0, springs.tabLensDematerialize);
    to(lens.size, 0, springs.tabLensDematerialize);
    kick();
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
}

function applyLens(): void {
  if (!lens) return;
  const grow = 8 * lens.size.value;
  const w = 94 + 2 * grow;
  const h = 54 + 2 * grow;
  lens.glass.rect = { x: lens.x.value - w / 2, y: tabRect.y + 31 - h / 2, width: w, height: h };
  lens.glass.radius = h / 2;
  lens.glass.pressAmount = Math.max(0, Math.min(1, lens.press.value));
}

function applyButton(b: Button): void {
  const f = { sx: b.sx.value, sy: b.sy.value, tx: b.tx.value, ty: b.ty.value };
  b.glass.flex = f;
  b.glass.pressed = !!b.down;
  b.glass.pressAmount = Math.max(0, Math.min(1, b.press.value));
  const go = Math.max(0, b.gOpacity.value);
  b.glass.glow = go > 0.002 ? { x: b.gx.value, y: b.gy.value } : undefined;
  b.glass.glowOpacity = go;
  b.glass.glowScale = b.gScale.value;
  placeLayer(b.layer, b.rect, f.sx, f.sy, f.tx, f.ty);
}

function allSprings(): Spring[] {
  const s: Spring[] = [];
  for (const b of buttons) s.push(b.sx, b.sy, b.tx, b.ty, b.gx, b.gy, b.gOpacity, b.gScale, b.press);
  if (lens) s.push(lens.x, lens.press, lens.size);
  return s;
}

function kick(): void {
  if (animating) return;
  animating = true;
  last = performance.now();
  requestAnimationFrame(tick);
}

function tick(now: number): void {
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;
  const springs = allSprings();
  for (const s of springs) s.step(dt);
  for (const b of buttons) applyButton(b);
  applyLens();
  renderer.frame();
  const busy = springs.some((s) => !s.settled) || buttons.some((b) => b.down) || lens?.down !== undefined;
  if (busy) requestAnimationFrame(tick);
  else animating = false;
}

// ------------------------------------------------------------------------------------------- bench
async function bench(frames = 240, step = 6): Promise<Record<string, unknown>> {
  const r = renderer as LiquidRenderer;
  const list = $('list');
  list.scrollTop = 0;
  await new Promise((res) => setTimeout(res, 300));
  stats.length = 0;
  const intervals: number[] = [];
  const gpuMs: number[] = [];
  let paintsBefore = r.paintEvents ?? 0;
  let prev = 0;
  let dir = 1;
  await new Promise<void>((resolve) => {
    let n = 0;
    const loop = (t: number) => {
      if (prev) intervals.push(t - prev);
      prev = t;
      performance.mark('scroll-step');
      const max = list.scrollHeight - list.clientHeight;
      if (list.scrollTop + step * dir > max || list.scrollTop + step * dir < 0) dir = -dir;
      list.scrollTop += step * dir;
      if (r.device) {
        const t0 = performance.now();
        r.device.queue.onSubmittedWorkDone().then(() => gpuMs.push(performance.now() - t0));
      }
      if (++n < frames) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  await new Promise((res) => setTimeout(res, 200));
  const q = (a: number[], p: number) => {
    const s = [...a].sort((x, y) => x - y);
    return +(s[Math.min(s.length - 1, Math.floor(p * s.length))] ?? 0).toFixed(2);
  };
  const mean = (a: number[]) => +(a.reduce((x, y) => x + y, 0) / Math.max(1, a.length)).toFixed(3);
  const cpu = stats.map((s) => s.cpuMs);
  const withCapture = stats.filter((s) => s.captures > 0).length;
  return {
    frames: intervals.length,
    intervalMean: mean(intervals),
    intervalP50: q(intervals, 0.5),
    intervalP95: q(intervals, 0.95),
    intervalP99: q(intervals, 0.99),
    intervalMax: q(intervals, 1),
    over20ms: intervals.filter((x) => x > 20).length,
    frameCpuMean: mean(cpu),
    frameCpuP95: cpu.length ? q(cpu, 0.95) : 0,
    rendererFrames: stats.length,
    framesWithCapture: withCapture,
    paintEvents: (r.paintEvents ?? 0) - paintsBefore,
    submitToGpuDoneMean: mean(gpuMs),
    submitToGpuDoneP95: gpuMs.length ? q(gpuMs, 0.95) : 0,
    dpr: devicePixelRatio,
    size: `${innerWidth}x${innerHeight}`,
  };
}

// ------------------------------------------------------------------------------------------- boot
async function main(): Promise<void> {
  const dark = params.get('dark') === '1';
  document.documentElement.classList.toggle('dark', dark);
  buildContent();
  const canvas = $<HTMLCanvasElement>('stage');
  renderer = await createRenderer(canvas, {
    appearance: dark ? 'dark' : 'light',
    forceFallback: params.get('fallback') === '1',
    onFrameStats: (s) => {
      stats.push(s);
      if (stats.length > 2000) stats.shift();
    },
  });
  document.documentElement.dataset.renderer = renderer.kind;
  const W = innerWidth;
  const H = innerHeight;

  listLayer = renderer.addLayer($('list'), 0);
  listLayer.transform = new DOMMatrix();

  // Nav bar: back button 44 pt glass circle, centred title, right pill (two 44 pt buttons) [ARCHITECTURE NavBar].
  makeButton('navBack', { x: 16, y: 54, width: 44, height: 44 }, 'navBack', 0);
  makeButton('navRight', { x: W - 16 - 96, y: 54, width: 96, height: 44 }, 'navRight', 0, false);
  const title = renderer.addLayer($('navTitle'), 11);
  placeLayer(title, { x: (W - 220) / 2, y: 54, width: 220, height: 44 });

  // Floating glass button group: two 58 pt circles 4 pt apart in one container with spacing 20 → they merge.
  setupTabs(W, H);
  const fabY = tabRect.y + 2;
  const fabB = { x: W - 16 - 58, y: fabY, width: 58, height: 58 };
  const fabA = { x: fabB.x - 58 - 4, y: fabY, width: 58, height: 58 };
  makeButton('fabA', fabA, 'fab', 20);
  makeButton('fabB', fabB, 'fab', 20);

  hud = renderer.addLayer($('hud'), 20);
  placeLayer(hud, { x: 20, y: 104, width: 200, height: 20 });
  hud.visible = false;

  $('toggle').addEventListener('click', () => {
    const d = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', d);
    renderer.setAppearance(d ? 'dark' : 'light');
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'd') $('toggle').click();
  });

  const scroll = Number(params.get('scroll') ?? 0);
  if (scroll) $('list').scrollTop = scroll;

  // Scripted press for screenshots: ?press=fabA&drag=40,0
  const press = params.get('press');
  if (press) {
    const [dx = 0, dy = 0] = (params.get('drag') ?? '0,0').split(',').map(Number);
    if (press === 'lens' && lens) {
      lens.press.snap(1);
      lens.size.snap(1);
      lens.x.snap(tabCenter(0) + dx);
    } else {
      const b = buttons.find((x) => x.id === press);
      if (b) {
        const down = { x: b.rect.width / 2, y: b.rect.height / 2 };
        const finger = { x: down.x + dx, y: down.y + dy };
        const f = flexTransform({ w: b.rect.width, h: b.rect.height }, down, finger, true);
        b.sx.snap(f.sx);
        b.sy.snap(f.sy);
        b.tx.snap(f.tx);
        b.ty.snap(f.ty);
        b.down = { ...down, id: -1 };
        b.press.snap(1);
        b.gOpacity.snap(Math.hypot(dx, dy) > 50 ? 0.5 : 1);
        b.gScale.snap(Math.hypot(dx, dy) > 50 ? 2 : 1);
        b.gx.snap(b.rect.x + Math.min(b.rect.width, Math.max(0, finger.x)));
        b.gy.snap(b.rect.y + Math.min(b.rect.height, Math.max(0, finger.y)));
      }
    }
  }
  for (const b of buttons) applyButton(b);
  applyLens();
  renderer.frame();

  // FPS HUD while scrolling (?hud=1).
  if (params.get('hud') === '1') {
    hud.visible = true;
    let frames = 0;
    let t0 = performance.now();
    const hudLoop = (t: number) => {
      frames++;
      if (t - t0 > 500) {
        $('hud').textContent = `${renderer.kind} · ${((frames * 1000) / (t - t0)).toFixed(0)} fps`;
        frames = 0;
        t0 = t;
      }
      requestAnimationFrame(hudLoop);
    };
    requestAnimationFrame(hudLoop);
  }

  (window as unknown as Record<string, unknown>).__liquid = { renderer, bench, buttons, stats };
  document.documentElement.dataset.ready = '1';
  if (params.get('bench') === '1') {
    const res = await bench();
    (window as unknown as Record<string, unknown>).__bench = res;
    console.log('bench', JSON.stringify(res));
  }
}

main().catch((e) => {
  console.error(e);
  document.documentElement.dataset.error = String(e);
});
