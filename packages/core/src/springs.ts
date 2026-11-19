/**
 * Springs: the UIKit/AnimationKit closed-form spring, the SwiftUI duration/bounce
 * conversion, a named preset table and a single-rAF Animator.
 *
 * Sources (all under ~/Documents/uikit-internals/):
 *   GR  = deep/glass-render/findings.md      (AnimationKit closed form, retarget impulse §1)
 *   SM  = deep/swiftui-motion/findings.md     (SwiftUI presets §1, duration/bounce §2, solver §3)
 *   TR  = findings/transitions.md             (UIKit transition springs, conversion table)
 *   MO  = deep/motion/findings.md             (switch, menu morph, minimized tab bar)
 *   LG  = findings/liquid-glass.md            (tab lens §10)
 *   GD  = deep/glass-drag/findings.md         (flex press/drag, glow §6–7)
 *   GS  = deep/gestures/findings.md           (swipe actions §1)
 *   PT  = deep/photos-transition/findings.md  (context-menu .pop commit §2)
 *
 * Convention (TR, header): mass 1, ω = 2π/response, k = ω², c = 2ζω.
 */

const TWO_PI = 2 * Math.PI;

/** UIKit-style spring description. `dampingRatio` ζ and `response` (seconds). */
export interface SpringParams {
  dampingRatio: number;
  response: number;
  /** Kept for API parity; with (ζ, response) parameters the motion is mass-independent. */
  mass?: number;
  /**
   * AnimationKit retarget impulse (GR §1): on every target change
   * `v += impulse · (2π/response)² · (newTarget − previousTarget)`.
   */
  impulse?: number;
  /**
   * UIKit `initialSpringVelocity` (normalised: 1 = the whole distance per second).
   * Applied on `setTarget` when no explicit velocity is passed: `v = initialVelocity · (target − value)`.
   */
  initialVelocity?: number;
}

/** Stiffness and damping at mass 1 (TR header: k = ω², c = 2ζω). */
export function springCoefficients(p: SpringParams): { stiffness: number; damping: number } {
  const omega = TWO_PI / p.response;
  return { stiffness: omega * omega, damping: 2 * p.dampingRatio * omega };
}

/**
 * Inverse of `springCoefficients`, for springs that the findings give as committed
 * CASpringAnimation values (TR header: response = 2π/√(k/m), ζ = c/(2√(km))).
 */
export function springFromStiffnessDamping(
  stiffness: number,
  damping: number,
  mass = 1,
): SpringParams {
  return {
    dampingRatio: damping / (2 * Math.sqrt(stiffness * mass)),
    response: TWO_PI / Math.sqrt(stiffness / mass),
  };
}

/**
 * SwiftUI `Spring(duration:bounce:)` (SM §2):
 * - ω = 2π/duration, so response = duration
 * - 0 ≤ bounce ≤ 1: ζ = 1 − bounce; bounce > 1 is clamped to 1 (ζ 0)
 * - negative bounce: ζ = 1/(1 + bounce); bounce ≤ −1 takes a ζ = ∞ path
 */
export function springFromDurationBounce(duration: number, bounce: number): SpringParams {
  let dampingRatio: number;
  if (bounce >= 0) dampingRatio = 1 - Math.min(bounce, 1);
  else if (bounce > -1) dampingRatio = 1 / (1 + bounce);
  else dampingRatio = Infinity; // SM §2: separate ζ = ∞ path
  return { dampingRatio, response: duration };
}

/** Pure closed-form step of a damped spring: displacement d and velocity v after dt seconds. */
export function stepSpringClosedForm(
  d0: number,
  v0: number,
  dt: number,
  dampingRatio: number,
  response: number,
): [d: number, v: number] {
  if (dt <= 0) return [d0, v0];
  if (!(response > 0)) return [0, 0]; // response 0: jump to target
  // TODO(unknown): SM §2 says bounce ≤ −1 takes a separate ζ = ∞ path that was not decoded. Hold still.
  if (!Number.isFinite(dampingRatio)) return [d0, 0];
  const w = TWO_PI / response;
  const z = Math.max(0, dampingRatio);
  // GR §1: AnimationKit evaluates in closed form; sincos/atan2 (ζ<1), exp (ζ=1), sinh/cosh (ζ>1).
  if (Math.abs(z - 1) < 1e-6) {
    const b = v0 + w * d0;
    const e = Math.exp(-w * dt);
    return [(d0 + b * dt) * e, (v0 - w * b * dt) * e];
  }
  if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    const e = Math.exp(-z * w * dt);
    const c = Math.cos(wd * dt);
    const s = Math.sin(wd * dt);
    const b = (v0 + z * w * d0) / wd;
    const d = e * (d0 * c + b * s);
    const v = e * (-z * w * (d0 * c + b * s) + wd * (b * c - d0 * s));
    return [d, v];
  }
  const root = Math.sqrt(z * z - 1);
  const r1 = -w * (z - root);
  const r2 = -w * (z + root);
  const c2 = (v0 - r1 * d0) / (r2 - r1);
  const c1 = d0 - c2;
  const e1 = Math.exp(r1 * dt);
  const e2 = Math.exp(r2 * dt);
  return [c1 * e1 + c2 * e2, c1 * r1 * e1 + c2 * r2 * e2];
}

/**
 * Rest threshold for `settled`. SM §3 "plain floating-point values: 0.001".
 * AnimationKit's own threshold was not extracted: TODO(unknown).
 */
export const SPRING_REST_EPSILON = 0.001;

function retargetVelocity(p: SpringParams, delta: number): number {
  // GR §1: applied only if impulse > 0, response > 0 and dampingRatio > 0.
  const impulse = p.impulse ?? 0;
  if (impulse > 0 && p.response > 0 && p.dampingRatio > 0) {
    const w = TWO_PI / p.response;
    return impulse * w * w * delta;
  }
  return 0;
}

export interface SetTargetOptions {
  params?: SpringParams;
  /** Explicit velocity in units/second (e.g. a gesture hand-off), applied before the impulse. */
  velocity?: number;
}

/** 1-D retargetable spring with velocity carry-over and the AnimationKit retarget kick. */
export class Spring {
  value: number;
  velocity = 0;
  params: SpringParams;
  restEpsilon = SPRING_REST_EPSILON;
  private _target: number;

  constructor(value: number, params: SpringParams) {
    this.value = value;
    this._target = value;
    this.params = params;
  }

  get target(): number {
    return this._target;
  }

  set target(t: number) {
    this.setTarget(t);
  }

  setTarget(t: number, opts: SetTargetOptions = {}): void {
    if (opts.params) this.params = opts.params;
    const prev = this._target;
    this._target = t;
    if (opts.velocity !== undefined) this.velocity = opts.velocity;
    else if (this.params.initialVelocity) this.velocity = this.params.initialVelocity * (t - this.value);
    this.velocity += retargetVelocity(this.params, t - prev);
  }

  /** Jump to a value with no motion. */
  snap(value: number): void {
    this.value = value;
    this._target = value;
    this.velocity = 0;
  }

  step(dtSeconds: number): void {
    if (this.settled) {
      this.value = this._target;
      this.velocity = 0;
      return;
    }
    const [d, v] = stepSpringClosedForm(
      this.value - this._target,
      this.velocity,
      dtSeconds,
      this.params.dampingRatio,
      this.params.response,
    );
    this.value = this._target + d;
    this.velocity = v;
    if (this.settled) {
      this.value = this._target;
      this.velocity = 0;
    }
  }

  get settled(): boolean {
    return (
      Math.abs(this.value - this._target) < this.restEpsilon &&
      Math.abs(this.velocity) < this.restEpsilon
    );
  }
}

/** N-dimensional spring (x, y, w, h, radius…) sharing one parameter set. */
export class SpringVec {
  value: number[];
  velocity: number[];
  params: SpringParams;
  restEpsilon = SPRING_REST_EPSILON;
  private _target: number[];

  constructor(value: readonly number[], params: SpringParams) {
    this.value = [...value];
    this._target = [...value];
    this.velocity = value.map(() => 0);
    this.params = params;
  }

  get target(): readonly number[] {
    return this._target;
  }

  set target(t: readonly number[]) {
    this.setTarget(t);
  }

  get dimensions(): number {
    return this.value.length;
  }

  setTarget(t: readonly number[], opts: { params?: SpringParams; velocity?: readonly number[] } = {}): void {
    if (t.length !== this.value.length) throw new RangeError('SpringVec: dimension mismatch');
    if (opts.params) this.params = opts.params;
    for (let i = 0; i < t.length; i++) {
      const prev = this._target[i]!;
      const next = t[i]!;
      this._target[i] = next;
      const explicit = opts.velocity?.[i];
      if (explicit !== undefined) this.velocity[i] = explicit;
      else if (this.params.initialVelocity)
        this.velocity[i] = this.params.initialVelocity * (next - this.value[i]!);
      this.velocity[i]! += retargetVelocity(this.params, next - prev);
    }
  }

  snap(value: readonly number[]): void {
    this.value = [...value];
    this._target = [...value];
    this.velocity = value.map(() => 0);
  }

  step(dtSeconds: number): void {
    const { dampingRatio, response } = this.params;
    for (let i = 0; i < this.value.length; i++) {
      const target = this._target[i]!;
      const [d, v] = stepSpringClosedForm(this.value[i]! - target, this.velocity[i]!, dtSeconds, dampingRatio, response);
      this.value[i] = target + d;
      this.velocity[i] = v;
    }
    if (this.settled) this.snap(this._target);
  }

  get settled(): boolean {
    for (let i = 0; i < this.value.length; i++) {
      if (Math.abs(this.value[i]! - this._target[i]!) >= this.restEpsilon) return false;
      if (Math.abs(this.velocity[i]!) >= this.restEpsilon) return false;
    }
    return true;
  }
}

// ---------------------------------------------------------------------------
// Preset table
// ---------------------------------------------------------------------------

const sp = (dampingRatio: number, response: number, extra: Partial<SpringParams> = {}): SpringParams => ({
  dampingRatio,
  response,
  ...extra,
});

/** Every named spring the components need. Each entry cites its source. */
export const springs = {
  // SwiftUI presets (SM §1). .smooth/.snappy/.bouncy = duration 0.5 with bounce 0 / 0.15 / 0.30.
  default: sp(1, 0.5), // SM §1 Animation.default (iOS 17+ apps): FluidSpring response 0.5, ζ 1
  smooth: sp(1, 0.5), // SM §1
  snappy: sp(0.85, 0.5), // SM §1
  bouncy: sp(0.7, 0.5), // SM §1
  interactive: sp(0.85, 0.15), // SM §1 .interactiveSpring(): response 0.15, ζ 0.85
  interpolating: springFromStiffnessDamping(157.9137, 25.1327), // SM §1 .interpolatingSpring(): m1 k157.9137 c25.1327

  // Navigation (TR §1–2, GR §1)
  push: sp(1, 0.3, { impulse: 0.02 }), // TR §1 noninteractiveSpring {dr 1, resp 0.3, retargetImpulse 0.02}; GR §1 v0 = 8.77×distance/s
  pop: sp(1, 0.3, { impulse: 0.02 }), // TR §1: pop uses the same noninteractive spring
  navInteractiveFinish: sp(0.85, 0.3), // TR §2 finishing/cancelling spring (dr 0.85, resp 0.30)
  navTracking: sp(0.85, 0.08), // TR §2 interactiveSpring tracking (0.85, 0.08)
  defaultTracking: sp(0.86, 0.15), // TR conversion table "default tracking in most specs"

  // Sheets (TR §0, §3b)
  sheet: sp(1, 0.3441), // TR §0/§3b curve 7 rendered ζ 1, response 0.3441 (k 333.33, c 36.51)
  sheetHighSpeed: sp(0.8, 0.3441), // TR §3b transitionSpringParametersHighSpeed
  sheetBoundary: sp(1, 0.1), // TR §3b _boundaryCrossedSpringParameters
  sheetMorphWidth: sp(0.75, 0.5), // deep/sheets §6 zoom-from-button width fit (rough, ±10 pt)
  sheetMorphHeight: sp(0.65, 0.48), // deep/sheets §6 height fit (rough)

  // Zoom transition (TR §4)
  zoomIn: sp(1, 0.34, { impulse: 0.016 }), // TR §4 zoomIn (1.0, 0.34), retargetImpulse 0.016
  zoomInShowcase: sp(0.85, 0.34), // TR §4 zoomInShowcase
  zoomOut: sp(0.92, 0.34), // TR §4 zoomOut, no impulse
  zoomCornerRadius: sp(1, 0.35), // TR §4 cornerRadiusAdjustment
  zoomCancel: sp(1, 0.25), // TR §4 cancelInteractive
  zoomOutInteractive: sp(1, 0.4), // TR §4 zoomOutInteractive general/morph
  zoomOutInteractiveTransform: sp(0.8, 0.42), // TR §4 (config only)
  zoomOutInteractivePosition: sp(0.82, 0.45), // TR §4 (config only)
  zoomDismissUpdate: sp(1, 0.2), // TR §4 _UIDismissInteractionSettings updateSpring
  zoomDismissTracking: sp(0.85, 0.08), // TR §4 tracking (0.85, 0.08)

  // Menus (MO §2, TR §8)
  menuOpen: sp(0.75, 0.35), // MO §2 present = mainEjectSpring 0.5 × speed 0.7
  menuClose: sp(0.8, 0.49), // MO §2 dismiss = mainAbsorbSpring 0.7 × speed 0.7
  menuList: sp(0.85, 0.35), // MO §2 dismiss: menu list scale 1→0.2 + fade
  menuKick: sp(0.8, 0.35 * 0.7), // MO §2 present vertical kick spring (approximate fit)
  menuKickSettle: sp(0.8, 0.5 * 0.7), // MO §2 kick settle (approximate fit)
  menuBlurIn: sp(1, 0.3 * 0.7), // MO §2 MorphAnimationSettings blurIn (1.0, 0.3) × speed 0.7
  menuBlurOut: sp(0.8, 0.45 * 0.7), // MO §2 blurOut (0.8, 0.45) × speed 0.7
  contextMenuPresent: sp(0.8, 0.32), // TR §8 rapid-click present
  contextMenuDismiss: sp(0.85, 0.35), // TR §8 dismiss
  contextMenuGravityWell: sp(0.6, 0.4), // TR §8 _UIGravityWellEffect press spring
  // PT §2: UIView.animate(0.5, damping 0.7, initialSpringVelocity 15) committed as m1 k267.11 c22.881.
  contextMenuCommit: { ...springFromStiffnessDamping(267.11, 22.881), initialVelocity: 15 },
  // PT §2: centre + fade, animate(0.35, damping 1.0, v0 0) committed as k695.97 c52.76 (ζ 1, 0.238 s).
  contextMenuCommitCentre: springFromStiffnessDamping(695.97, 52.76),

  // Switch and liquid lens (MO §1)
  switchKnob: sp(1, 0.3), // MO §1 knob travel _UIViewSpringAnimationBehavior(1.0, 0.3)
  lensLift: sp(0.625, 0.27), // MO §1 _UILiquidLensViewSmallVariantSpec.liftSpring (needs ~390 pt/s width v0)
  lensUnlift: sp(0.7, 0.5), // MO §1 unLiftSpring (0.7, 0.5); measured 0.70 / 0.478
  switchTrackOn: springFromStiffnessDamping(85.377, 18.48), // MO §1 well slide turning on (CASpring m1 k85.377 c18.48)
  switchTrackOff: springFromStiffnessDamping(246.74, 31.42), // MO §1 well slide turning off

  // Tab bar lens (LG §10)
  tabLensMove: sp(0.85, 0.4), // LG §10 tab-switch lens move
  tabLensLift: sp(0.85, 0.34), // measured lift: size and glass together
  tabLensFollow: sp(0.95, 0.15), // lifted lens following the finger
  tabLensDematerialize: sp(0.95, 0.27), // measured release: 110 → 94
  tabPlatterRelease: sp(0.6, 0.375), // platter press scale back to 1 (slight undershoot)
  tabPlatterPress: sp(0.634, 0.311), // LG §10 platter press-scale fit

  // Minimized tab bar / scroll-away (TR §5, MO §3)
  minimizeCollapseIntermediate: sp(0.72, 0.36), // TR §5 collapse intermediate
  minimizeCollapse: sp(0.76, 0.42), // TR §5 collapse final (+0.05 s delay)
  minimizeExpandIntermediate: sp(0.72, 0.3), // TR §5 expand intermediate
  minimizeExpand: sp(0.72, 0.36), // TR §5 expand final (+0.05 s delay)
  minimizeCollapsed: sp(0.75, 0.4), // MO §3 collapsedSpring
  minimizeExpansion: sp(0.5, 0.4), // MO §3 expansionSpring
  scrollAwayTracking: sp(0.8, 0.1), // TR §5 scrollAwayTrackingProgressSpring
  scrollAwayHintReset: sp(0.8, 0.3), // TR §5 scrollAwayHintResetSpring
  scrollAwayProgress: sp(0.8, 0.5), // TR §5 scrollAwayProgressSpring
  minimizePlatterRelease: sp(0.8, 0.28), // MO §3 platter release after the swap

  // Large title (TR §6)
  titleTransition: sp(1, 0.35), // TR §6 animate(springDuration 0.35, bounce 0)

  // Interactive glass flex (GD §2/§6). Interpolate small→large by u′ with `flexSprings` in gestures.ts.
  flexTrackingSmall: sp(0.625, 0.262), // GD §6 ultraSmall/small tracking
  flexTrackingLarge: sp(0.625, 0.314), // GD §6 large tracking
  flexReleaseSmall: sp(0.375, 0.4), // GD §6 ultraSmall/small release
  flexReleaseLarge: sp(0.6, 0.36), // GD §6 large release
  flexTrackingMenu: sp(0.5, 0.15, { impulse: 0.016 }), // GD §2 menu spec tracking, retargetImpulse 0.016
  flexReleaseMenu: sp(0.5, 0.6, { impulse: 0.016 }), // GD §2 menu spec release
  flexTrackingVariant5: sp(0.548, 0.574), // GD §2 variant 5 tracking override

  // Glow (GD §7)
  glowShow: sp(1, 0.1), // GD §7 showGlowAt:
  glowMove: sp(1, 0.15), // GD §7 moveGlowTo:
  glowDissipate: sp(1, 0.5), // GD §7 dissipate beyond 50 pt
  glowHide: sp(1, 0.5), // GD §7 hideGlow

  // Swipe actions (GS §1)
  swipeActionTracking: springFromDurationBounce(0.5, 0), // GS §1 SwiftUI spring 0.5/0, interactive, retargeted per frame
  swipeActionRelease: springFromDurationBounce(0.5, 0), // GS §1 release: SwiftUI 0.5/0 non-interactive (fit ζ1, 0.500–0.507 s)
  swipeCellBackground: springFromStiffnessDamping(200, 100, 2), // GS §1 swiped-cell bg/corner CASpring m2 k200 c100
  swipeDeleteButton: springFromStiffnessDamping(511.55, 45.235), // GS §1 primary button after full swipe
  swipeDeleteRow: springFromStiffnessDamping(532.85, 46.167), // GS §1 deleted-row collapse
  swipeDeleteFade: springFromStiffnessDamping(341.02, 36.93), // GS §1 opacity fade

  // Alert (TR §7)
  alert: springFromStiffnessDamping(522.35, 45.71), // TR §7 committed m1 k522.35 c45.71 (ζ 1, 0.2749 s)

  // Misc
  scrollIndicator: springFromStiffnessDamping(322.27, 35.9), // haptics-framerate §5 scroll indicator show spring
} satisfies Record<string, SpringParams>;

export type SpringPresetName = keyof typeof springs;

/**
 * Reduced-motion substitute: critically damped and short.
 * TODO(unknown): the extraction does not give UIKit's reduce-motion spring; 0.2 s is a visual choice.
 */
export function reducedMotionSpring(p: SpringParams): SpringParams {
  return { dampingRatio: 1, response: Math.min(p.response, 0.2) };
}

// ---------------------------------------------------------------------------
// Animator: one rAF loop for everything, idles when settled.
// ---------------------------------------------------------------------------

/** Anything the Animator can drive. `ScrollPhysics`, `Spring` and `SpringVec` qualify. */
export interface Animatable {
  step(dtSeconds: number): unknown;
  readonly settled: boolean;
}

export interface AnimatorOptions {
  requestFrame?: (cb: (now: number) => void) => number;
  cancelFrame?: (id: number) => void;
}

type FrameCallback = (dtSeconds: number, now: number) => void;

/**
 * SM §3: after more than 1 s without a frame the SwiftUI clock resets to now − 1/60.
 * The same rule is used here so a backgrounded tab does not jump.
 */
const LONG_GAP_SECONDS = 1;
const LONG_GAP_STEP = 1 / 60;

export class Animator {
  private readonly items = new Map<Animatable, ((item: Animatable) => void) | undefined>();
  private readonly frameCallbacks = new Set<FrameCallback>();
  private readonly requestFrame: (cb: (now: number) => void) => number;
  private readonly cancelFrame: (id: number) => void;
  private handle: number | null = null;
  private lastTime: number | null = null;
  private holds = 0;
  /** True while `tick` runs; `wake()` then only records the request (see `wake`). */
  private ticking = false;
  private wakeRequested = false;

  constructor(opts: AnimatorOptions = {}) {
    this.requestFrame =
      opts.requestFrame ?? ((cb) => globalThis.requestAnimationFrame(cb));
    this.cancelFrame = opts.cancelFrame ?? ((id) => globalThis.cancelAnimationFrame(id));
  }

  /** Drive `item`; `onUpdate` runs after each step. Returns a remover. Wakes the loop. */
  add<T extends Animatable>(item: T, onUpdate?: (item: T) => void): () => void {
    this.items.set(item, onUpdate as ((item: Animatable) => void) | undefined);
    this.wake();
    return () => {
      this.items.delete(item);
    };
  }

  remove(item: Animatable): void {
    this.items.delete(item);
  }

  /** Called once per frame after all items stepped (e.g. the renderer's `frame()`). */
  onFrame(cb: FrameCallback): () => void {
    this.frameCallbacks.add(cb);
    return () => {
      this.frameCallbacks.delete(cb);
    };
  }

  /** Retarget a spring and make sure the loop runs. */
  animate(spring: Spring, target: number, opts?: SetTargetOptions): void {
    spring.setTarget(target, opts);
    if (!this.items.has(spring)) this.items.set(spring, undefined);
    this.wake();
  }

  /** Keep the loop running (e.g. while a finger is down) until the returned release is called. */
  hold(): () => void {
    this.holds++;
    this.wake();
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.holds--;
    };
  }

  get running(): boolean {
    return this.handle !== null;
  }

  wake(): void {
    // Bug fix: waking from inside a tick (an onUpdate/onFrame callback that retargets a spring) used to reset
    // `lastTime` and request a second frame, so every later tick saw dt = 0 and nothing advanced.
    if (this.ticking) {
      this.wakeRequested = true;
      return;
    }
    if (this.handle !== null) return;
    this.lastTime = null;
    this.handle = this.requestFrame(this.tick);
  }

  stop(): void {
    if (this.handle !== null) this.cancelFrame(this.handle);
    this.handle = null;
    this.lastTime = null;
  }

  private readonly tick = (now: number): void => {
    this.handle = null;
    let dt = this.lastTime === null ? 0 : (now - this.lastTime) / 1000;
    if (dt > LONG_GAP_SECONDS) dt = LONG_GAP_STEP;
    this.lastTime = now;

    let busy = this.holds > 0;
    this.ticking = true;
    this.wakeRequested = false;
    try {
      for (const [item, onUpdate] of this.items) {
        const wasSettled = item.settled;
        if (!wasSettled) item.step(dt);
        if (!wasSettled) onUpdate?.(item);
        if (!item.settled) busy = true;
      }
      for (const cb of this.frameCallbacks) cb(dt, now);
    } finally {
      this.ticking = false;
    }
    if (this.wakeRequested) {
      this.wakeRequested = false;
      busy = true;
    }

    if (busy) {
      this.handle = this.requestFrame(this.tick);
    } else {
      this.lastTime = null;
    }
  };
}
