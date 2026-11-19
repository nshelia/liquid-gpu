// Portions adapted from robinWongM/liquid-glass (Apache-2.0): src/glass/tabView.tsx, liquidLens.tsx, motion/flex.js,
// platform/ios26_5.ts (lens and flex parameters).
/**
 * Tab bar liquid lens (pure, time-driven; times in seconds, lengths in platter-local pt).
 *
 * - Press: the lens lifts (progress q 0 → 1, rest W × 54 → (W + 16) × 70) and settles on the pressed tab.
 * - Drag: it follows the finger keeping the press point's relative position in the lens (`follow`), DRAG spring.
 * - Release: it settles on the tab under the finger (SETTLE); it drops once within GATE pt of it and at least
 *   `hang` s after the press. Squash/stretch comes from the lens centre's acceleration (`LensFlex`).
 */
import type { Rect } from '@liquid-gpu/gpu';

export interface Spring1 {
  from: number;
  v0: number;
  target: number;
  t0: number;
  response: number;
  damping: number;
}

/** Closed-form damped spring at time t. */
export function springAt(s: Spring1, t: number): { value: number; velocity: number } {
  const w = (2 * Math.PI) / s.response;
  const z = s.damping;
  const a = s.from - s.target;
  const dt = Math.max(0, t - s.t0);
  if (z >= 1) {
    const b = s.v0 + w * a;
    const e = Math.exp(-w * dt);
    return { value: s.target + (a + b * dt) * e, velocity: (s.v0 - w * b * dt) * e };
  }
  const wd = w * Math.sqrt(1 - z * z);
  const b = (s.v0 + z * w * a) / wd;
  const e = Math.exp(-z * w * dt);
  const c = Math.cos(wd * dt);
  const sn = Math.sin(wd * dt);
  const p = a * c + b * sn;
  return { value: s.target + e * p, velocity: e * (-z * w * p + wd * (-a * sn + b * c)) };
}

export const LENS = {
  settle: { response: 0.4, damping: 0.85 },
  drag: { response: 0.2, damping: 0.85 },
  /** Lift / drop of the tab lens (tabView `BOUNDS`: critically damped, no impulse). */
  bounds: { response: 0.25, damping: 1 },
  lift: 8,
  gate: 8,
  hang: 0.22,
  contentScale: 0.16,
  /** Content warp: amount −H/4·q, band 0.2·H·q, rim band 11.2 (H = lifted height). */
  rimHeight: 11.2,
} as const;

// ---- Flex, lens variant (iOS 26.5 `flex.lens`): squash/stretch from the centre's acceleration ---------------------

interface Chan {
  value: number;
  velocity: number;
  target: number;
  response: number;
  damping: number;
}

function step(s: Chan, dt: number): void {
  if (dt <= 0 || (s.value === s.target && s.velocity === 0)) return;
  const omega = (2 * Math.PI) / s.response;
  const a = omega * s.damping;
  const u = s.value - s.target;
  const e = Math.exp(-a * dt);
  if (s.damping >= 1) {
    const r = Math.sqrt(Math.max(0, a * a - omega * omega));
    if (r < 1e-9) {
      const c = s.velocity + a * u;
      s.value = s.target + (u + c * dt) * e;
      s.velocity = (s.velocity - a * c * dt) * e;
    } else {
      const r1 = -a + r;
      const r2 = -a - r;
      const c2 = (s.velocity - r1 * u) / (r2 - r1);
      const c1 = u - c2;
      s.value = s.target + c1 * Math.exp(r1 * dt) + c2 * Math.exp(r2 * dt);
      s.velocity = c1 * r1 * Math.exp(r1 * dt) + c2 * r2 * Math.exp(r2 * dt);
    }
  } else {
    const b = Math.sqrt(omega * omega - a * a);
    const sin = Math.sin(dt * b);
    const cos = Math.cos(dt * b);
    const v = (s.velocity + a * u) / b;
    const f = cos * u + sin * v;
    s.value = s.target + e * f;
    s.velocity = e * (b * (cos * v) - b * (u * sin)) - e * (f * a);
  }
  const d = s.target - s.value;
  const w = s.velocity * ((2 * s.damping) / omega);
  if (d * d + w * w <= 1e-6) {
    s.value = s.target;
    s.velocity = 0;
  }
}

function softLimit(v: number, lower: number, upper: number): number {
  const ext = (upper - lower) / 3;
  if (v < lower) {
    const edge = lower - ext;
    const width = lower - edge;
    return edge + width * (Math.tanh(((v - edge) / width) * 0.55 - 0.55) + 1);
  }
  if (v > upper) return upper + ext * Math.tanh(((v - upper) / ext) * 0.55);
  return v;
}

const mix = (t: number, a: number, b: number) => (1 - t) * a + t * b;
const ema = (was: number[] | undefined, v: number[], k: number) => (was ? v.map((x, i) => x * k + was[i]! * (1 - k)) : v);

/** `flex.lens`: edges [37, 70], movement [10, 100], min [0.9, 0.75], max [1.1, 1.15], normalization [2000, 2500]. */
function lensSpec([w, h]: number[]) {
  const t = Math.max(0, Math.min(1, (Math.min(w!, h!) - 37) / 33));
  return {
    movement: mix(t, 10, 100),
    min: mix(t, 0.9, 0.75),
    max: mix(t, 1.1, 1.15),
    normalization: mix(t, 2000, 2500),
    tracking: { response: mix(t, 0.444, 0.5), damping: mix(t, 0.56, 0.9) },
    release: { response: mix(t, 0.444, 0.5), damping: mix(t, 0.56, 1) },
  };
}

export class LensFlex {
  private spec;
  private ch: Chan[] = [1, 1, 0, 0].map((value) => ({ value, velocity: 0, target: value, response: 1, damping: 1 }));
  private time: number | null = null;
  private resume = false;
  private lead = false;
  private integ: { position?: number[]; last?: number; velocity?: number[]; acceleration?: number[] } = {};
  active = false;
  translation = [0, 0];

  constructor(private size: number[]) {
    this.spec = lensSpec(size);
  }

  resize(size: number[]): void {
    if (size[0] === this.size[0] && size[1] === this.size[1]) return;
    this.size = size;
    this.spec = lensSpec(size);
  }

  get settled(): boolean {
    return this.ch.every((c) => c.value === c.target && c.velocity === 0);
  }

  down(): void {
    if (this.active) return;
    if (!this.active && this.settled) this.resume = true;
    this.active = true;
    this.integ = {};
  }

  up(t: number): void {
    if (!this.active) return;
    const rest = this.settled;
    if (this.time !== null) for (const c of this.ch) step(c, t - this.time);
    this.time = t;
    this.resume = this.lead = rest;
    this.active = false;
    this.retarget();
  }

  private sample(c: number[], t: number): void {
    const was = this.integ;
    const gap = was.last === undefined ? null : t - was.last;
    if (gap !== null && gap < 1e-4) return;
    const k = 0.3;
    const start = gap !== null && gap > 0.05 ? {} : was;
    const position = ema(start.position, c, k);
    if (start.last === undefined || !start.position) {
      this.integ = { position, last: t, velocity: [0, 0], acceleration: [0, 0] };
      return;
    }
    const velocity = ema(start.velocity, position.map((v, i) => (v - start.position![i]!) / gap!), k);
    const acceleration = ema(start.acceleration, velocity.map((v, i) => (v - start.velocity![i]!) / gap!), k);
    this.integ = { position, last: t, velocity, acceleration };
  }

  private targets(): number[] {
    if (!this.active) return [1, 1, 0, 0];
    const [w, h] = this.size as [number, number];
    const S = this.spec;
    const range = (d: number) => [Math.max(S.min, (d - S.movement) / d), Math.min((d + S.movement) / d, S.max)] as const;
    const [lx, ux] = range(w);
    const [ly, uy] = range(h);
    const [ax, ay] = (this.integ.acceleration ?? [0, 0]).map((v) => v / S.normalization) as [number, number];
    let sx = 1;
    let sy = 1;
    let dx = 0;
    let dy = 0;
    if (ax !== 0) {
      const own = softLimit(mix(ax, 1, ux), lx, ux);
      sx += own - 1;
      dx += (1 - own) * 0.2 * w;
      sy += softLimit(mix(ax, 1, ly), ly, uy) - 1;
    }
    if (ay !== 0) {
      const own = softLimit(mix(ay, 1, uy), ly, uy);
      sy += own - 1;
      dy += (1 - own) * 0.2 * h;
      sx += softLimit(mix(ay, 1, lx), lx, ux) - 1;
    }
    return [sx, sy, dx, dy];
  }

  private retarget(): void {
    const b = this.active ? this.spec.tracking : this.spec.release;
    this.targets().forEach((target, i) => {
      const c = this.ch[i]!;
      if (c.target !== target) Object.assign(c, { target, ...b });
    });
  }

  /** Advance to t with the lens centre `c`; returns scale and translation (pt, already scaled). */
  frame(t: number, c: number[]): { sx: number; sy: number; tx: number; ty: number } {
    const dt = this.resume || this.time === null ? 0 : t - this.time;
    const tick = !this.resume && t !== this.time;
    const lead = this.lead && tick ? 0.4 / 60.06 : 0;
    if (tick) this.lead = false;
    this.resume = false;
    for (const ch of this.ch) step(ch, dt + lead);
    this.time = t;
    if (this.active) this.sample([c[0]! + this.translation[0]!, c[1]! + this.translation[1]!], 1 + t);
    this.retarget();
    const [sx, sy, dx, dy] = this.ch.map((ch) => ch.value) as [number, number, number, number];
    this.translation = [dx, dy];
    return { sx, sy, tx: dx * sx, ty: dy * sy };
  }
}

// ---- Lens state machine -------------------------------------------------------------------------------------------

export interface LensFrame {
  /** Lifted (spring alive); false: the rest pill at the selected tab. */
  active: boolean;
  /** Lift progress 0…1. */
  q: number;
  /** Unflexed lens rect, platter-local. */
  rect: Rect;
  flex: { sx: number; sy: number; tx: number; ty: number };
  /** Still animating: request another frame. */
  moving: boolean;
}

export class TabLens {
  private x: Spring1 | null = null;
  private lift: Spring1 | null = null;
  private lifted = false;
  private acceptedAt = 0;
  private fallAt: number | null = null;
  private flex: LensFlex | null = null;
  private tracking = false;
  private anchor = 0.5;
  private highlighted = -1;
  private reselect = true;
  private startX = 0;
  private settling = false;
  private shown: number;

  /** Buttons (platter-local), platter width, selected index. */
  constructor(
    public buttons: Rect[],
    public width: number,
    public index: number,
  ) {
    this.shown = index;
  }

  get pressed(): boolean {
    return this.tracking;
  }

  private centre(i: number): number {
    const b = this.buttons[i]!;
    return b.x + b.width / 2;
  }

  private xAt(t: number): number {
    return this.x ? springAt(this.x, t).value : this.centre(this.index);
  }

  private aim(target: number, cfg: { response: number; damping: number }, t: number): void {
    const p = this.x ? springAt(this.x, t) : { value: this.centre(this.index), velocity: 0 };
    this.x = { from: p.value, v0: p.velocity, target, t0: t, ...cfg };
  }

  private progress(t: number) {
    return this.lift ? springAt(this.lift, t) : { value: 0, velocity: 0 };
  }

  private retargetLift(target: number, t: number): void {
    const p = this.progress(t);
    this.lift = { from: p.value, v0: p.velocity, target, t0: t, ...LENS.bounds };
  }

  /** Button under x; overlapping buttons prefer the selected one. */
  buttonAt(x: number): number {
    const has = (i: number) => x >= this.buttons[i]!.x && x < this.buttons[i]!.x + this.buttons[i]!.width;
    return this.buttons[this.index] && has(this.index) ? this.index : this.buttons.findIndex((_, i) => has(i));
  }

  private follow(x: number): number {
    const w = this.buttons[Math.max(0, this.highlighted)]!.width;
    const a = this.anchor;
    return Math.min(this.width - (1 - a) * w, Math.max(a * w, x)) - a * w + w / 2;
  }

  private size(q: number): number[] {
    const b = this.buttons[this.index]!;
    return [b.width + 2 * LENS.lift * q, b.height + 2 * LENS.lift * q];
  }

  private press(t: number): void {
    if (!this.lifted) {
      this.lifted = true;
      this.acceptedAt = t;
      this.fallAt = null;
      this.retargetLift(1, t);
    }
    this.flex ??= new LensFlex(this.size(1));
    this.flex.resize(this.size(1));
    this.flex.down();
  }

  /** Pointer down at platter-local x. Returns false when it misses every button. */
  down(x: number, t: number): boolean {
    if (this.tracking) return false;
    const i = this.buttonAt(x);
    if (i < 0) return false;
    const b = this.buttons[i]!;
    Object.assign(this, { tracking: true, highlighted: i, anchor: (x - b.x) / b.width, reselect: true, startX: x, settling: false });
    this.press(t);
    this.aim(this.centre(i), LENS.settle, t);
    return true;
  }

  move(x: number, t: number): void {
    if (!this.tracking) return;
    if (Math.abs(x - this.startX) >= 4) this.reselect = false;
    const i = this.buttonAt(x);
    if (i >= 0) this.highlighted = i;
    this.aim(this.follow(x), LENS.drag, t);
    if (!this.lifted) this.press(t);
  }

  /** Pointer up (or cancel): returns the tab to select, or -1. */
  up(t: number, cancelled = false): number {
    if (!this.tracking) return -1;
    this.tracking = false;
    const to = cancelled ? -1 : this.highlighted;
    const next = to >= 0 && !(to === this.index && !this.reselect) ? to : this.index;
    this.highlighted = -1;
    this.shown = next;
    this.aim(this.centre(next), LENS.settle, t);
    this.settling = true;
    return to;
  }

  /** Selection changed (by `up`, a tap, the keyboard or the app): slide there unless the finger holds the lens. */
  select(i: number, t: number): void {
    this.index = i;
    if (this.shown === i) return;
    this.shown = i;
    if (!this.tracking) this.aim(this.centre(i), LENS.settle, t);
  }

  frame(t: number): LensFrame {
    const target = this.x?.target;
    if (this.settling && (!this.x || Math.abs(this.xAt(t) - target!) < LENS.gate)) {
      this.settling = false;
      if (this.lifted && this.fallAt === null) this.fallAt = Math.max(t, this.acceptedAt + LENS.hang);
    }
    if (this.fallAt !== null && t >= this.fallAt) {
      const at = this.fallAt;
      this.lifted = false;
      this.fallAt = null;
      this.retargetLift(0, at);
      if (this.flex) {
        this.flex.up(at);
        this.flex.resize(this.size(0));
      }
    }
    const xs = this.x ? springAt(this.x, t) : null;
    const xMoving = !!xs && (Math.abs(xs.value - this.x!.target) > 1e-3 || Math.abs(xs.velocity) > 1e-2);
    const cx = xs ? xs.value : this.centre(this.index);
    if (!xMoving && !this.tracking) this.x = null;
    const p = this.progress(t);
    const b = this.buttons[this.index]!;
    const cy = b.y + b.height / 2;
    const flex = this.flex ? this.flex.frame(t, [cx, cy]) : { sx: 1, sy: 1, tx: 0, ty: 0 };
    const still = !this.lift || (Math.abs(p.value - this.lift.target) < 1e-4 && Math.abs(p.velocity) < 1e-3);
    const flexing = !!this.flex && !this.flex.settled;
    if (still && !this.lifted && !flexing && this.lift) {
      this.lift = null;
      this.flex = null;
    }
    const q = this.lift ? Math.max(0, p.value) : 0;
    const [w, h] = this.size(q) as [number, number];
    return {
      active: !!this.lift,
      q,
      rect: { x: cx - w / 2, y: cy - h / 2, width: w, height: h },
      flex,
      moving: xMoving || !still || flexing || this.settling || this.fallAt !== null,
    };
  }
}
