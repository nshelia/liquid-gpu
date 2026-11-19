/**
 * Gesture decision rules, transcribed from the extraction.
 *
 * Sources (under ~/Documents/uikit-internals/):
 *   GS  = deep/gestures/findings.md         (swipe actions §1, pop §3, sheet §4, refresh §5)
 *   GD  = deep/glass-drag/findings.md       (flex variants §2, press §3, drag stretch §4, springs §6, glow §7)
 *   SH  = deep/sheets/findings.md           (scroll hand-off §1)
 *   SMG = findings/scroll-motion-gestures.md (rubber band §3, gesture thresholds §7)
 *   TR  = findings/transitions.md           (interactive pop §2, context menu §8)
 *   HF  = deep/haptics-framerate/findings.md
 */

import { springs, type SpringParams } from './springs';

export interface Pt {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------------------------------------------------------------------------
// Rubber band (SMG §3)
// ---------------------------------------------------------------------------

/** SMG §3 `c` for touch input. Trackpad/mouse variants are in `RUBBER_BAND_COEFFICIENTS`. */
export const RUBBER_BAND_TOUCH = 0.55;

/** SMG §3 `_UIScrollViewRubberBandCoefficient` per input device. */
export const RUBBER_BAND_COEFFICIENTS = {
  touch: 0.55,
  smallTrackpad: 0.715,
  lowResMouse: 0.5,
  continuousMouse: 0.4,
  hiResMouseOrLargeTrackpad: 0.17,
} as const;

/**
 * SMG §3 `_UIScrollViewRubberBandOffsetWithoutDecorationForOffset`:
 * past max: `max + (1 − 1/((o − max)/range·c + 1))·range`, mirrored for min.
 */
export function rubberBand(
  offset: number,
  min: number,
  max: number,
  range: number,
  c: number = RUBBER_BAND_TOUCH,
): number {
  if (range <= 0) return clamp(offset, min, max);
  if (offset > max) return max + (1 - 1 / (((offset - max) / range) * c + 1)) * range;
  if (offset < min) return min - (1 - 1 / (((min - offset) / range) * c + 1)) * range;
  return offset;
}

// ---------------------------------------------------------------------------
// Thresholds
// ---------------------------------------------------------------------------

export const gestureThresholds = {
  panHysteresis: 10, // SMG §7 UIPanGestureRecognizer _hysteresis
  edgePanHysteresis: 15, // SMG §7 / TR §2 _UIParallaxTransitionPanGestureRecognizer
  edgePanRegion: 46.6, // TR §2 edgeSettings edge region (pt)
  swipeActionHysteresis: 25, // GS §1 _UISwipeActionPanGestureRecognizer
  longPressDuration: 0.5, // SMG §7 UILongPressGestureRecognizer
  longPressAllowableMovement: 10, // SMG §7
  doubleTapInterval: 0.35, // swiftui-motion §6 TapGesture max interval
  touchDelay: 0.15, // SMG §5 delaysContentTouches
  contextMenuMinimumDuration: 0.15, // TR §8 _UILongPressClickInteractionDriver minimumDurationRequired
  contextMenuCommit: 0.725, // TR §8 clickTimeoutDuration (default)
  sheetQuickSwipeInterval: 0.4, // SH §1 MinimumSheetSwipeInterval
  zoomDismissDistance: 150, // TR §4 swipeDown dismissThreshold (config)
  zoomDismissDistanceFactor: 0.6, // TR §4 effectiveDistanceFactor
  zoomDismissMinScale: 0.6, // TR §4 minScale
} as const;

/** TR §8: context-menu highlight progress, x = elapsed/timeout; `x / (x + (1 − x)^3.4)`. */
export function contextMenuPressProgress(elapsed: number, timeout: number = gestureThresholds.contextMenuCommit): number {
  const x = clamp(elapsed / timeout, 0, 1);
  if (x <= 0) return 0;
  return x / (x + Math.pow(1 - x, 3.4));
}

/** MO §2 / transitions §8: lifted preview scale = min(maxLiftScale 1.15, (w + 26)/w). */
export function contextMenuLiftScale(width: number): number {
  return Math.min(1.15, (width + 26) / width); // deep/motion §2 _UIContextMenuPlatformMetrics_Glass
}

// ---------------------------------------------------------------------------
// Interactive pop (GS §3, TR §2)
// ---------------------------------------------------------------------------

/** GS §3: projection horizon D = transition duration 0.35 s. */
export const POP_PROJECTION_SECONDS = 0.35;

/** GS §3 / TR §2: threshold = min(187.5 / width, 0.5). 0.4261 on a 440 pt screen. */
export function popThreshold(width: number): number {
  return Math.min(187.5 / width, 0.5);
}

/**
 * GS §3 finish rule. `p` = translation/W, `v` = 3-sample mean velocity (widths/s),
 * `a` = 3-sample mean acceleration (widths/s²), `samples` = accepted sample count.
 * With ≥ 3 samples: finish iff p + v·D + ½·a·D² > min(187.5/W, 0.5). Otherwise finish iff v > 0.
 */
export function popShouldFinish(p: number, v: number, a: number, width: number, samples: number): boolean {
  if (samples < 3) return v > 0;
  const D = POP_PROJECTION_SECONDS;
  return p + v * D + 0.5 * a * D * D > popThreshold(width);
}

/** TR §2: release velocity × 4.25 while |v̄| ≥ 1.5 widths/s since touch-down. */
export const EDGE_FLICK_BOOST_THRESHOLD = 1.5;
export const EDGE_FLICK_BOOST_FACTOR = 4.25;

/** GS §3 parallax: the screen underneath sits at x = −0.3·W·(1 − p). */
export const POP_PARALLAX = 0.3; // TR §1 parallaxOffset = round(width × 0.7)

/**
 * GS §3 / TR §2 `_updateStatistics:` estimator.
 * - p = translation / W; velocities in widths/s.
 * - A sample is taken if dt ≥ 0.01 s, or dt > 0.001 s with movement.
 * - v̄ and ā are 3-sample ring means; each acceleration sample is clamped to ±5.
 * - Edge-flick phase holds while |v̄| ≥ 1.5 widths/s from touch-down.
 */
export class PopGestureTracker {
  readonly width: number;
  samples = 0;
  progress = 0;
  inEdgeFlickPhase = true;
  private readonly vRing: number[] = [];
  private readonly aRing: number[] = [];
  private lastT: number | null = null;
  private lastP = 0;
  private lastV: number | null = null;

  constructor(width: number) {
    this.width = width;
  }

  /** `t` in seconds, `translation` in points (positive = toward finishing). */
  add(t: number, translation: number): void {
    const p = translation / this.width;
    this.progress = p;
    if (this.lastT === null) {
      this.lastT = t;
      this.lastP = p;
      return;
    }
    const dt = t - this.lastT;
    const moved = p !== this.lastP;
    if (!(dt >= 0.01 || (dt > 0.001 && moved))) return; // GS §3 sample rule
    const v = (p - this.lastP) / dt;
    if (this.lastV !== null) {
      push3(this.aRing, clamp((v - this.lastV) / dt, -5, 5)); // GS §3 ±5 clamp
    }
    push3(this.vRing, v);
    this.lastV = v;
    this.lastT = t;
    this.lastP = p;
    this.samples++;
    if (Math.abs(this.velocity) < EDGE_FLICK_BOOST_THRESHOLD) this.inEdgeFlickPhase = false;
  }

  /** v̄ in widths/s. */
  get velocity(): number {
    return mean(this.vRing);
  }

  /** ā in widths/s². */
  get acceleration(): number {
    return mean(this.aRing);
  }

  shouldFinish(): boolean {
    return popShouldFinish(this.progress, this.velocity, this.acceleration, this.width, this.samples);
  }

  /** Hand-off velocity for the finishing spring, in widths/s (TR §2, with the edge-flick boost). */
  releaseVelocity(): number {
    const v = this.velocity;
    return this.inEdgeFlickPhase ? v * EDGE_FLICK_BOOST_FACTOR : v;
  }
}

function push3(ring: number[], v: number): void {
  ring.push(v);
  if (ring.length > 3) ring.shift();
}

function mean(ring: readonly number[]): number {
  if (ring.length === 0) return 0;
  let s = 0;
  for (const v of ring) s += v;
  return s / ring.length;
}

// ---------------------------------------------------------------------------
// Sheet release (GS §4, TR §3c)
// ---------------------------------------------------------------------------

/** TR §3c: projection uses r = 0.99: point + v·r/(1 − r)/1000 = point + 0.099 s × v. */
export const SHEET_DECELERATION_RATE = 0.99;
/** TR §3c `_minimumSpeed`: speeds under 250 pt/s count as 0. */
export const SHEET_MINIMUM_SPEED = 250;
/** GS §4 `SheetSpeedThreshold` (default 1000 pt/s): one-detent rule and the high-speed spring. */
export const SHEET_SPEED_THRESHOLD = 1000;

/** GS §4 `_projectedPoint` with `_effectiveVelocity`. */
export function sheetProjectedPoint(point: number, velocity: number): number {
  const v = Math.abs(velocity) < SHEET_MINIMUM_SPEED ? 0 : velocity;
  const r = SHEET_DECELERATION_RATE;
  return point + (v * r) / (1 - r) / 1000;
}

function nearestIndex(sorted: readonly number[], x: number): number {
  let best = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i]! - x) < Math.abs(sorted[best]! - x)) best = i;
  }
  return best;
}

/**
 * GS §4 release rule. `detents` are sheet-top positions; include the dismissed position
 * (e.g. the container height) when the sheet is dismissible: it counts as a detent.
 * `velocity` is in pt/s, positive = downward.
 */
export function sheetReleaseTarget(detents: number[], point: number, velocity: number): number {
  if (detents.length === 0) return point;
  const sorted = [...detents].sort((a, b) => a - b);
  const idxNow = nearestIndex(sorted, point);
  const idxProj = nearestIndex(sorted, sheetProjectedPoint(point, velocity));
  let idx = idxProj;
  if (Math.abs(velocity) >= SHEET_SPEED_THRESHOLD && idxNow === idxProj) {
    idx = clamp(idxNow + Math.sign(velocity), 0, sorted.length - 1);
  }
  return sorted[idx]!;
}

/** GS §4: |v| ≥ 1000 pt/s switches to the high-speed spring (ζ 0.8). */
export function sheetReleaseSpring(velocity: number): SpringParams {
  return Math.abs(velocity) >= SHEET_SPEED_THRESHOLD ? springs.sheetHighSpeed : springs.sheet;
}

// ---------------------------------------------------------------------------
// Sheet ↔ scroll hand-off (SH §1)
// ---------------------------------------------------------------------------

export interface SheetScrollHandoffInput {
  /** Offset the scroll view wants (`uy`, contentOffset.y). */
  proposedOffset: number;
  /** Offset at gesture start (`sy`). */
  startOffset: number;
  /** Top offset (minimum contentOffset.y, e.g. −adjustedContentInset.top). */
  maxTopOffset: number;
  /** False when the content fits and cannot scroll. */
  canScroll: boolean;
  /** Distance (≥ 0) the sheet can still travel up before reaching its largest detent. */
  distanceToLargestDetent: number;
  /** `prefersScrollingExpandsWhenScrolledToEdge` (default true). */
  expandsWhenScrolledToEdge?: boolean;
  /** Pan `velocityInView.y` (pt/s, positive = finger down). */
  panVelocity: number;
  /** Scroll view is decelerating (its own vertical velocity ≠ 0). */
  decelerating?: boolean;
  // Gate flags (SH §1 `_shouldInteractWithDescendentScrollView:`)
  scrubbing?: boolean;
  hasRefreshControl?: boolean;
  scrollsHorizontally?: boolean;
  interactiveKeyboardDismissWithFirstResponder?: boolean;
  interactionDisabled?: boolean;
  draggedByOtherSource?: boolean;
  /** Seconds since the previous pan ended (Infinity if none). */
  timeSinceLastPanEnd?: number;
  sheetAnimating?: boolean;
  sheetDragging?: boolean;
  dismissibleByDragging?: boolean;
}

export interface SheetScrollHandoffResult {
  /** True when the sheet takes some of the movement. */
  handoff: boolean;
  /** Offset the scroll view should use. */
  scrollOffset: number;
  /** Sheet translation from its start point (positive = down). 0 when not handing off. */
  sheetTranslation: number;
  /** Zero the scroll view's velocity. */
  zeroScrollVelocity: boolean;
  /** Velocity to hand to the sheet (pt/s). */
  sheetVelocity: number;
}

/** SH §1 `-[_UISheetInteraction _scrollView:adjustedUnconstrainedOffsetForUnconstrainedOffset:…]`. */
export function sheetScrollHandoff(i: SheetScrollHandoffInput): SheetScrollHandoffResult {
  const uy = i.proposedOffset;
  const sy = i.startOffset;
  const top = i.maxTopOffset;
  const none: SheetScrollHandoffResult = {
    handoff: false,
    scrollOffset: uy,
    sheetTranslation: 0,
    zeroScrollVelocity: false,
    sheetVelocity: 0,
  };
  // Gate: start offset below the top, scrubbing, refresh control, horizontal scrolling,
  // interactive keyboard dismiss, disabled, or already dragged by another source.
  if (Math.round(top) < Math.round(sy)) return none;
  if (
    i.scrubbing ||
    i.hasRefreshControl ||
    i.scrollsHorizontally ||
    i.interactiveKeyboardDismissWithFirstResponder ||
    i.interactionDisabled ||
    i.draggedByOtherSource
  )
    return none;
  // Quick re-swipes within 0.4 s: only while the sheet animates or is dismissible by dragging.
  if ((i.timeSinceLastPanEnd ?? Infinity) < gestureThresholds.sheetQuickSwipeInterval && !i.sheetDragging) {
    if (!i.sheetAnimating && !i.dismissibleByDragging) return none;
  }
  // Already over-scrolled at the top: hand-off only while the finger moves down.
  if (sy < top && i.panVelocity < 0) return none;

  const sheetVelocity = i.decelerating ? 0 : i.panVelocity;

  if (!i.canScroll) {
    // Content fits: every movement goes to the sheet.
    return { handoff: true, scrollOffset: sy, sheetTranslation: sy - uy, zeroScrollVelocity: true, sheetVelocity };
  }
  if (uy < top) {
    // Pull down at the top: pin the content, the sheet takes maxTop − uy.
    return { handoff: true, scrollOffset: top, sheetTranslation: top - uy, zeroScrollVelocity: true, sheetVelocity };
  }
  if (uy > sy && (i.expandsWhenScrolledToEdge ?? true) && i.distanceToLargestDetent > 0) {
    // Push up below the largest detent: the sheet takes it until the largest detent, the excess scrolls.
    const wanted = uy - sy;
    const room = i.distanceToLargestDetent;
    if (wanted <= room) {
      return { handoff: true, scrollOffset: sy, sheetTranslation: -wanted, zeroScrollVelocity: true, sheetVelocity };
    }
    return {
      handoff: true,
      scrollOffset: sy + (wanted - room),
      sheetTranslation: -room,
      zeroScrollVelocity: false,
      sheetVelocity,
    };
  }
  return none;
}

/** SH §2: rubber band past the detents (`_UIHyperAsymmetricExtender`). */
export const sheetExtents = {
  beyondLargest: 0, // SH §2 extentBeyondMinimum y = 0: no travel above the top detent
  beyondDismissed: 200, // SH §2 extentBeyondMaximum y = 200
  rubberBand: RUBBER_BAND_TOUCH, // SH §1 coefficient 0.55
} as const;

// ---------------------------------------------------------------------------
// Swipe actions (GS §1)
// ---------------------------------------------------------------------------

/** GS §1 tracking: cell offset = finger translation − 25 (hysteresis), sign-aware. */
export function swipeActionOffset(translation: number): number {
  const h = gestureThresholds.swipeActionHysteresis;
  if (Math.abs(translation) <= h) return 0;
  return translation - Math.sign(translation) * h;
}

/** GS §1 rubber band past the end: limit + excess^0.7 (sign follows `limit`). */
export function swipeActionRubberBand(offset: number, limit: number): number {
  const excess = Math.abs(offset) - Math.abs(limit);
  if (excess <= 0) return offset;
  return Math.sign(limit || offset) * (Math.abs(limit) + Math.pow(excess, 0.7));
}

/**
 * GS §1 confirmation threshold. Leading: 0.525 × width (+210 at 400).
 * Trailing: −(width − 29) (−371 at 400; DIS literal −29 at +144, derived).
 */
export function swipeConfirmationThreshold(width: number, side: 'leading' | 'trailing'): number {
  return side === 'leading' ? 0.525 * width : -(width - 29);
}

/**
 * GS §1 edge zone the finger must be in for a trailing full swipe:
 * 90 pt when the screen width ≥ 414, otherwise 75 or 50.
 * The 375 split between 75 and 50 is inferred from the literals in HF §4 (414, 375, 75).
 */
export function swipeEdgeZone(screenWidth: number): number {
  if (screenWidth >= 414) return 90;
  return screenWidth >= 375 ? 75 : 50;
}

export interface SwipeConfirmInput {
  /** Current cell offset (signed; negative = trailing). */
  offset: number;
  /** Finger velocity along x, pt/s. */
  velocity: number;
  /** Finger x in window coordinates. */
  fingerX: number;
  screenWidth: number;
  /** Signed confirmation threshold (see `swipeConfirmationThreshold`). */
  confirmationThreshold: number;
}

/**
 * GS §1 full swipe during the drag.
 * Trailing: finger within the edge zone AND |offset| > |threshold| × clamp(|v|/2500, 0.5, 0.75).
 * Leading (measured): |offset| > |threshold|, no edge zone, no 0.5 factor.
 */
export function swipeActionShouldConfirm(i: SwipeConfirmInput): boolean {
  const trailing = i.confirmationThreshold < 0;
  if (!trailing) return i.offset > i.confirmationThreshold;
  if (i.fingerX >= swipeEdgeZone(i.screenWidth)) return false;
  const f = clamp(Math.abs(i.velocity) / 2500, 0.5, 0.75);
  return -i.offset > -i.confirmationThreshold * f;
}

export type SwipeOutcome = 'open' | 'close' | 'confirm';

/**
 * GS §1 release: a confirmed swipe performs the action; if |v| > 50 pt/s it opens when the
 * velocity points in the open direction and closes otherwise; else it opens iff
 * |offset| > 0.5 × |openThreshold|.
 */
export function swipeActionRelease(
  offset: number,
  velocity: number,
  openThreshold: number,
  confirmed = false,
): SwipeOutcome {
  if (confirmed) return 'confirm';
  if (Math.abs(velocity) > 50) {
    return Math.sign(velocity) === Math.sign(openThreshold) ? 'open' : 'close';
  }
  return Math.abs(offset) > 0.5 * Math.abs(openThreshold) ? 'open' : 'close';
}

/** GS §1 button metrics. */
export const swipeActionMetrics = {
  buttonWidth: 63.33, // GS §1 natural button width
  buttonSpacing: 10, // GS §1 primary width = |offset| − 3·10 − 63.33
  cornerRadius: 26, // GS §1 swiped-cell cornerRadii 0 → 26
} as const;

// ---------------------------------------------------------------------------
// Pull to refresh (GS §5)
// ---------------------------------------------------------------------------

/** GS §5 maximum snapping height (content view clamp). */
export const REFRESH_MAX_SNAPPING_HEIGHT = 189.349;
/** SMG §5 `_refreshControlHeight`; GS §5 content inset grows by 60 after trigger. */
export const REFRESH_CONTROL_HEIGHT = 60;

/** GS §5: round(scrollViewHeight × 0.5) clamped to [0, 189.349]. */
export function refreshSnappingHeight(scrollViewHeight: number): number {
  return clamp(Math.round(scrollViewHeight * 0.5), 0, REFRESH_MAX_SNAPPING_HEIGHT);
}

/** GS §5 revealedFraction = clamp(visible / snapping, 0, 1). */
export function refreshRevealedFraction(visibleHeight: number, snappingHeight: number): number {
  if (snappingHeight <= 0) return 0;
  return clamp(visibleHeight / snappingHeight, 0, 1);
}

/** GS §5: `.valueChanged` fires when the fraction reaches 1 while the finger is down. */
export function refreshShouldTrigger(visibleHeight: number, snappingHeight: number, tracking: boolean): boolean {
  return tracking && refreshRevealedFraction(visibleHeight, snappingHeight) >= 1;
}

/**
 * GS §5 trigger haptic intensity: stiffness = clamp(|v| × 48.33, 5, 150);
 * intensity = stiffness/150 × 0.85 + 0.15. The unit of v is not stated in the findings.
 */
export function refreshHapticIntensity(velocity: number): number {
  const stiffness = clamp(Math.abs(velocity) * 48.33, 5, 150);
  return (stiffness / 150) * 0.85 + 0.15;
}

// ---------------------------------------------------------------------------
// Interactive glass flex (GD §2–4, §6–7)
// ---------------------------------------------------------------------------

export interface FlexSpec {
  associatedDimension: number;
  liftScalePoints: number;
  /** scaleDistanceThreshold T. */
  scaleDistanceThreshold: number;
  movementScalePoints: number;
  movementMinScale: number;
  movementMaxScale: number;
  movementNormalizationFactor: number;
  littleGlowOpacity: number;
  littleGlowDissipationDistance: number;
  bigGlowOpacity: number;
  tracking: SpringParams;
  release: SpringParams;
}

/** GD §2 spec defaults (PTSettings). */
export const flexSpecs = {
  ultraSmall: {
    associatedDimension: 44,
    liftScalePoints: 16,
    scaleDistanceThreshold: 2000,
    movementScalePoints: 10,
    movementMinScale: 0.9,
    movementMaxScale: 1.1,
    movementNormalizationFactor: 10000,
    littleGlowOpacity: 1,
    littleGlowDissipationDistance: 50,
    bigGlowOpacity: 1,
    tracking: springs.flexTrackingSmall,
    release: springs.flexReleaseSmall,
  },
  small: {
    associatedDimension: 44,
    liftScalePoints: 16,
    scaleDistanceThreshold: 6000,
    movementScalePoints: 10,
    movementMinScale: 0.9,
    movementMaxScale: 1.1,
    movementNormalizationFactor: 10000,
    littleGlowOpacity: 0.3,
    littleGlowDissipationDistance: 50,
    bigGlowOpacity: 1,
    tracking: springs.flexTrackingSmall,
    release: springs.flexReleaseSmall,
  },
  large: {
    associatedDimension: 160,
    liftScalePoints: 4,
    scaleDistanceThreshold: 24000,
    movementScalePoints: 5,
    movementMinScale: 0.9,
    movementMaxScale: 1.1,
    movementNormalizationFactor: 10000,
    littleGlowOpacity: 0.2,
    littleGlowDissipationDistance: 50,
    bigGlowOpacity: 0,
    tracking: springs.flexTrackingLarge,
    release: springs.flexReleaseLarge,
  },
  menu: {
    associatedDimension: 160,
    liftScalePoints: 0,
    scaleDistanceThreshold: 6000,
    movementScalePoints: 5,
    movementMinScale: 0.9,
    movementMaxScale: 1.1,
    movementNormalizationFactor: 10000,
    littleGlowOpacity: 0.5,
    littleGlowDissipationDistance: 50,
    bigGlowOpacity: 0,
    tracking: springs.flexTrackingMenu,
    release: springs.flexReleaseMenu,
  },
  loupe: {
    associatedDimension: 70,
    liftScalePoints: 0,
    scaleDistanceThreshold: 0,
    movementScalePoints: 100,
    movementMinScale: 0.75,
    movementMaxScale: 1.15,
    movementNormalizationFactor: 2500,
    littleGlowOpacity: 0,
    littleGlowDissipationDistance: 0, // TODO(unknown): GD §2 lists "0" glow for loupe without a distance
    bigGlowOpacity: 0,
    tracking: { dampingRatio: 0.9, response: 0.5 },
    release: { dampingRatio: 1, response: 0.5 },
  },
  smallLoupe: {
    associatedDimension: 37,
    liftScalePoints: 0,
    scaleDistanceThreshold: 6000,
    movementScalePoints: 10,
    movementMinScale: 0.9,
    movementMaxScale: 1.1,
    movementNormalizationFactor: 2000,
    littleGlowOpacity: 0,
    littleGlowDissipationDistance: 0, // TODO(unknown): see loupe
    bigGlowOpacity: 0,
    tracking: { dampingRatio: 0.56, response: 0.444, impulse: 0.032 },
    release: { dampingRatio: 0.56, response: 0.444, impulse: 0.032 },
  },
} satisfies Record<string, FlexSpec>;

export type FlexVariant = 'automatic' | keyof typeof flexSpecs;

/** GD §2 threshold: max(w, h) < 120 uses `ultraSmall` as-is. */
export const FLEX_ULTRA_SMALL_MAX = 120;

const lerpSpring = (a: SpringParams, b: SpringParams, t: number): SpringParams => ({
  dampingRatio: lerp(a.dampingRatio, b.dampingRatio, t),
  response: lerp(a.response, b.response, t),
});

/**
 * GD §2 variant resolution. Automatic: max(w,h) < 120 → ultraSmall; otherwise interpolate
 * small→large with u = clamp((min(w,h) − 44)/116, 0, 1) for the glow, lift, T and normalisation
 * fields, and u′ = clamp((max(w,h) − 44)/116, 0, 1) for the springs.
 * TODO(unknown): GD "still open": movementScalePts/min/max for interpolated specs come from a fresh
 * instance whose defaults were not read; the `small` values are used.
 */
export function resolveFlexSpec(size: Size, variant: FlexVariant = 'automatic'): FlexSpec {
  if (variant !== 'automatic') return flexSpecs[variant];
  const maxDim = Math.max(size.w, size.h);
  const minDim = Math.min(size.w, size.h);
  if (maxDim < FLEX_ULTRA_SMALL_MAX) return flexSpecs.ultraSmall;
  const s = flexSpecs.small;
  const l = flexSpecs.large;
  const span = l.associatedDimension - s.associatedDimension; // 116
  const u = clamp((minDim - s.associatedDimension) / span, 0, 1);
  const u2 = clamp((maxDim - s.associatedDimension) / span, 0, 1);
  return {
    ...s,
    associatedDimension: lerp(s.associatedDimension, l.associatedDimension, u),
    bigGlowOpacity: lerp(s.bigGlowOpacity, l.bigGlowOpacity, u),
    littleGlowOpacity: lerp(s.littleGlowOpacity, l.littleGlowOpacity, u),
    littleGlowDissipationDistance: lerp(s.littleGlowDissipationDistance, l.littleGlowDissipationDistance, u),
    liftScalePoints: lerp(s.liftScalePoints, l.liftScalePoints, u),
    scaleDistanceThreshold: lerp(s.scaleDistanceThreshold, l.scaleDistanceThreshold, u),
    movementNormalizationFactor: lerp(s.movementNormalizationFactor, l.movementNormalizationFactor, u),
    tracking: lerpSpring(s.tracking, l.tracking, u2),
    release: lerpSpring(s.release, l.release, u2),
  };
}

/** GD §6 springs for a glass of this size: tracking while the finger is down, release after. */
export function flexSprings(size: Size, variant: FlexVariant = 'automatic'): { tracking: SpringParams; release: SpringParams } {
  const spec = resolveFlexSpec(size, variant);
  return { tracking: spec.tracking, release: spec.release };
}

/** GD §3 press lift: s₀ = (max(w,h) + liftScalePoints) / max(w,h). */
export function flexPressScale(size: Size, spec: FlexSpec = resolveFlexSpec(size)): number {
  const L = Math.max(size.w, size.h);
  return (L + spec.liftScalePoints) / L;
}

export interface FlexTransform {
  sx: number;
  sy: number;
  /** Translation after scaling (matrix m41 = driftX·scaleX). */
  tx: number;
  /** m42 = driftY·scaleY. */
  ty: number;
}

/**
 * GD §4 drag stretch (reproduces 124/124 measured drags).
 *
 * `touchDown` and `finger` are in the glass's local coordinates (origin top-left).
 * `inside` is the pressed state: true while the touch that began on the glass is down
 * (lift and stretch apply); false returns the rest transform.
 * Apply as `matrix(sx, 0, 0, sy, tx, ty)` about the glass centre.
 */
export function flexTransform(
  size: Size,
  touchDown: Pt,
  finger: Pt,
  inside = true,
  spec: FlexSpec = resolveFlexSpec(size),
): FlexTransform {
  if (!inside) return { sx: 1, sy: 1, tx: 0, ty: 0 };
  const s0 = flexPressScale(size, spec);
  const T = spec.scaleDistanceThreshold;
  if (!(T > 0)) return { sx: s0, sy: s0, tx: 0, ty: 0 };
  const px = clamp(finger.x, 0, size.w);
  const py = clamp(finger.y, 0, size.h);
  const trX = finger.x - touchDown.x;
  const trY = finger.y - touchDown.y;
  const itrX = px - touchDown.x;
  const itrY = py - touchDown.y;
  // 4× stiffer while the finger is inside the glass.
  const dx = Math.abs(itrX) / (4 * T) + (Math.abs(trX) - Math.abs(itrX)) / T;
  const dy = Math.abs(itrY) / (4 * T) + (Math.abs(trY) - Math.abs(itrY)) / T;
  const sx = s0 + dx - dy;
  const sy = s0 - dx + dy;
  const driftX = Math.sign(trX) * dx * size.w;
  const driftY = Math.sign(trY) * dy * size.h;
  return { sx, sy, tx: driftX * sx, ty: driftY * sy };
}

/** GD §7 glow behaviour. */
export const flexGlow = {
  dissipatedScale: 2, // GD §7 LittleGlow scales to 2.0 beyond the dissipation distance
  dissipatedOpacityFactor: 0.5, // GD §7 fades to ½ of its opacity
  releaseScale: 4, // GD §7 hideGlow: LittleGlow scale → 4.0, opacity → 0
  littleGlowSize: (h: number) => Math.min(1.5 * h, 160), // LG §9 circle of size min(1.5·h, 160)
} as const;
