/**
 * UIScrollView physics, stepped once per millisecond.
 *
 * Source: ~/Documents/uikit-internals/findings/scroll-motion-gestures.md (SMG) §1–5.
 * Listings (iOS 27.0 UIKitCore): BNC = `disasm/…getBouncingDecelerationOffset…s`,
 * SSU = `disasm-27.1/…smoothScrollSyncWithUpdateTime…s`, EPN = `deep/demo-audit/scroll/disasm/…endPanNormal…s`,
 * SWE = `disasm/…scrollViewWillEndDraggingWithDeceleration…s`.
 * Checked frame by frame against simulator traces in `deep/demo-audit/scroll/raw/`.
 *
 * Units: offsets in points, internal velocity in pt/ms (SMG §1 "Velocity unit pt/ms").
 * Public velocities are pt/s. Positive velocity = content offset increasing
 * (the opposite sign of the finger's motion).
 */

import { rubberBand, RUBBER_BAND_TOUCH } from './gestures';

/** SMG §1 `setDecelerationRate:` snaps: rate < 0.994 → 0.99, else 0.998. */
export const DECELERATION_RATE_NORMAL = 0.998;
export const DECELERATION_RATE_FAST = 0.99;

export function snapDecelerationRate(rate: number): 0.998 | 0.99 {
  return rate < 0.994 ? DECELERATION_RATE_FAST : DECELERATION_RATE_NORMAL;
}

/** SMG §1 velocity scale: pt/s × 0.001 = pt/ms. */
export const VELOCITY_SCALE = 0.001;
/** SMG §1 stop threshold: |v| < 0.01 pt/ms (10 pt/s). */
export const STOP_VELOCITY = 0.01;
/** SMG §3 bounce-back: overshoot × exp(−0.01005·ms) (ln 0.99). */
export const BOUNCE_LN_DECAY = -0.01005;
/** BNC +692/+776: bounce ends once the offset is within 0.5 pt of the bounds. */
export const BOUNCE_END_TOLERANCE = 0.5;
/** EPN +732…+764: a release under 0.25 pt/ms (250 pt/s) inside the bounds does not decelerate. */
export const MIN_RELEASE_VELOCITY = 250;
/** SSU +116…+124: updates less than 1 ms apart are skipped. */
const MIN_UPDATE_MS = 1;
/** SMG §4 flick-to-next-page threshold: |v| > 0.3 pt/ms (300 pt/s). */
export const PAGING_FLICK_VELOCITY = 0.3;
/** SWE +3120…+3148: a shortened retarget's factor is capped at 0.999. */
export const RETARGET_MAX_RATE = 0.999;
/** SWE +1740…+1792: a lengthened retarget slower than 0.25 pt/ms restarts at factor 0.985 (−ln 0.985 = 0.0151136). */
export const RETARGET_SLOW_VELOCITY = 0.25;
export const RETARGET_SLOW_RATE = 0.985;

/**
 * SMG §1 per-step decay factor: x = ln(rate)·dt_ms; e = x < −0.5 ? exp(x) : 1 + x + x²/2.
 */
export function decayFactor(rate: number, dtMs: number): number {
  const x = Math.log(rate) * dtMs;
  return x < -0.5 ? Math.exp(x) : 1 + x + (x * x) / 2;
}

/**
 * SMG §1 one deceleration step. `v` in pt/ms. UIKit takes one step per display update (SSU +72…+84).
 * offset += v·rate·(1 − e)/(1 − rate); v *= e.
 */
export function decelerationStep(offset: number, v: number, rate: number, dtMs: number): [offset: number, v: number] {
  const e = decayFactor(rate, dtMs);
  return [offset + (v * rate * (1 - e)) / (1 - rate), v * e];
}

/**
 * Distance a decay from `v` (pt/ms) travels before |v| drops to the 0.01 stop speed: (v ∓ 0.01)/−ln(rate).
 * This is UIKit's default target (SWE = `_scrollViewWillEndDraggingWithDeceleration:` +140…+188, +592…+648).
 */
export function projectedDecelerationDistance(v: number, rate: number): number {
  return (v - Math.sign(v) * STOP_VELOCITY) / -Math.log(rate);
}

/** SMG §4 paging friction: min(width, 1024)·0.0000099431818 + 0.9668181818. */
export function pagingFriction(pageWidth: number): number {
  return Math.min(pageWidth, 1024) * 0.0000099431818 + 0.9668181818;
}

/**
 * SMG §4 paging spring pull: 0.000285227 @400 pt, 0.000277841 @440 pt
 * (≈ 0.00035909 − 1.8466e-7·width, derived from those two points).
 */
export function pagingSpringPull(pageWidth: number): number {
  return 0.00035909 - 1.8466e-7 * pageWidth;
}

/** SMG §4 per-ms paging step: v += (target − pos)·pull; v *= friction; pos += v. */
export function pagingStep(
  pos: number,
  v: number,
  target: number,
  pull: number,
  friction: number,
): [pos: number, v: number] {
  let nv = v + (target - pos) * pull;
  nv *= friction;
  return [pos + nv, nv];
}

/**
 * SMG §4 page choice at release: |v| > 0.3 pt/ms flicks to the next page in the direction of v,
 * else the nearest page (0.5 rounding). Returns a page index.
 */
export function pagingTargetPage(offset: number, velocityPtPerMs: number, pageSize: number): number {
  const page = offset / pageSize;
  if (velocityPtPerMs > PAGING_FLICK_VELOCITY) return Math.floor(page) + 1;
  if (velocityPtPerMs < -PAGING_FLICK_VELOCITY) return Math.ceil(page) - 1;
  return Math.floor(page + 0.5);
}

/**
 * SWE +3080…+3148: a target short of the projection keeps v and solves the factor, exp(−(v − c)/Δ) capped at 0.999,
 * c = ±0.01 (SWE +144…+188, −0.01 when v < 0). `v` in pt/ms, Δ = target − offset.
 */
export function retargetDecelerationRate(v: number, delta: number): number {
  const c = v < 0 ? -STOP_VELOCITY : STOP_VELOCITY;
  return Math.min(Math.exp(-(v - c) / delta), RETARGET_MAX_RATE);
}

/**
 * SMG §5 UIAnimation curves. 0 (setContentOffset animated): sin²(t·π/2);
 * 1: 1 − 2·sin²((1−t)·π/4); 2: 2·sin²(t·π/4).
 */
export function uiAnimationCurve(curve: 0 | 1 | 2, t: number): number {
  const x = Math.min(1, Math.max(0, t));
  switch (curve) {
    case 0:
      return Math.sin((x * Math.PI) / 2) ** 2;
    case 1:
      return 1 - 2 * Math.sin(((1 - x) * Math.PI) / 4) ** 2;
    case 2:
      return 2 * Math.sin((x * Math.PI) / 4) ** 2;
  }
}

/** SMG §5 `_contentOffsetAnimationDuration`. */
export const SET_CONTENT_OFFSET_DURATION = 0.3;

export interface ScrollPhysicsOptions {
  /** SMG §1 values are snapped by the setter (< 0.994 → 0.99). Default 0.998. */
  decelerationRate?: number;
  paging?: boolean;
  /** Page size in points (the scroll view's width/height along the axis). */
  pageSize?: number;
  /** Scroll view width; sets the paging friction and pull (SMG §4). Defaults to `pageSize`. */
  boundsWidth?: number;
  /** Rubber band coefficient c, default 0.55 (SMG §3 touch). */
  rubberBand?: number;
  /**
   * Rubber band range: UIKit uses the scroll view's bounds size along the axis.
   * Defaults to `pageSize`, else 956 (the iPhone 18 Pro Max height, SMG §8).
   */
  viewportSize?: number;
  /** Bounce at the edges (UIScrollView.bounces). Default true. */
  bounces?: boolean;
  /** Device pixel ratio for paging pixel rounding (SMG §4). Default 3 (SMG §8, @3x). */
  pixelRatio?: number;
  bounds?: { min: number; max: number };
  offset?: number;
}

type Phase = 'idle' | 'dragging' | 'decelerating' | 'paging' | 'animating';

/** One axis of UIScrollView: drag with rubber band, deceleration, bounce-back, paging. */
export class ScrollPhysics {
  bounds: { min: number; max: number };
  /** Current content offset (unrounded). */
  offset: number;
  decelerationRate: 0.998 | 0.99;
  paging: boolean;
  pageSize: number;
  boundsWidth: number;
  rubberBandCoefficient: number;
  viewportSize: number;
  bounces: boolean;
  pixelRatio: number;
  /** Display frame interval (s), UIKit's 1/maximumFramesPerSecond (EPN +88…+100); see `observeFrame`. */
  frameInterval = 1 / 60;

  private phase: Phase = 'idle';
  /** pt/ms */
  private v = 0;
  private rate: number;
  /** The display update of the release frame is skipped (its timestamp precedes the release, SSU +116). */
  private skipStep = false;
  private decelTarget: number | null = null;
  private pageTarget = 0;
  private anim: { from: number; to: number; t: number } | null = null;

  constructor(opts: ScrollPhysicsOptions = {}) {
    this.decelerationRate = snapDecelerationRate(opts.decelerationRate ?? DECELERATION_RATE_NORMAL);
    this.rate = this.decelerationRate;
    this.paging = opts.paging ?? false;
    this.pageSize = opts.pageSize ?? 0;
    this.boundsWidth = opts.boundsWidth ?? 0;
    this.rubberBandCoefficient = opts.rubberBand ?? RUBBER_BAND_TOUCH;
    this.viewportSize = opts.viewportSize ?? (this.pageSize > 0 ? this.pageSize : 956);
    this.bounces = opts.bounces ?? true;
    this.pixelRatio = opts.pixelRatio ?? 3;
    this.bounds = opts.bounds ?? { min: 0, max: 0 };
    this.offset = opts.offset ?? 0;
  }

  /** Current velocity in pt/s. */
  get velocity(): number {
    return this.v / VELOCITY_SCALE;
  }

  /** True while decelerating, bouncing, paging or animating (not while dragging or idle). */
  get active(): boolean {
    return this.phase === 'decelerating' || this.phase === 'paging' || this.phase === 'animating';
  }

  get settled(): boolean {
    return !this.active;
  }

  /** Finger is down (UIScrollView.isTracking). */
  get tracking(): boolean {
    return this.phase === 'dragging';
  }

  /** Offset rounded to device pixels. */
  get displayOffset(): number {
    return Math.round(this.offset * this.pixelRatio) / this.pixelRatio;
  }

  /** Offset that undoes the rubber band, so a drag can resume from a bounced position. */
  get unbandedOffset(): number {
    const { min, max } = this.bounds;
    const range = this.viewportSize;
    const c = this.rubberBandCoefficient;
    const o = this.offset;
    // Inverse of rubberBand: r = (1 − 1/(x·c + 1))·range → x = (1/(1 − r/range) − 1)/c·range
    if (o > max) {
      const r = Math.min((o - max) / range, 0.999999);
      return max + ((1 / (1 - r) - 1) / c) * range;
    }
    if (o < min) {
      const r = Math.min((min - o) / range, 0.999999);
      return min - ((1 / (1 - r) - 1) / c) * range;
    }
    return o;
  }

  dragBegin(): void {
    this.phase = 'dragging';
    this.v = 0;
    this.anim = null;
    this.decelTarget = null;
    this.skipStep = false;
  }

  /** Set the offset the finger implies; returns the rubber-banded offset actually used. */
  dragMove(offsetFromFinger: number): number {
    if (this.phase !== 'dragging') this.dragBegin();
    const { min, max } = this.bounds;
    this.offset = this.bounces
      ? rubberBand(offsetFromFinger, min, max, this.viewportSize, this.rubberBandCoefficient)
      : Math.min(max, Math.max(min, offsetFromFinger));
    return this.offset;
  }

  /**
   * Release. `velocityPtPerSec` is the content-offset velocity (e.g. −finger velocity).
   * `targetFn` is the `scrollViewWillEndDragging(_:withVelocity:targetContentOffset:)` hook:
   * it receives the projected resting offset (clamped to the bounds) and returns the desired one.
   * `sinceLastMove` (s): time from the last finger move to the release. EPN +52…+136, +1908…+2024: when it is
   * 0.8–2.4 frames, UIKit steps one frame at once.
   */
  dragEnd(velocityPtPerSec: number, targetFn?: (projected: number) => number, sinceLastMove?: number): void {
    this.v = velocityPtPerSec * VELOCITY_SCALE;
    this.decelTarget = null;
    this.rate = this.decelerationRate;
    this.skipStep = true;
    const f = this.frameInterval;
    const stepNow = sinceLastMove !== undefined && sinceLastMove > 0.8 * f && sinceLastMove < 2.4 * f;

    if (this.paging && this.pageSize > 0) {
      const { min, max } = this.bounds;
      const page = pagingTargetPage(this.offset, this.v, this.pageSize);
      this.pageTarget = Math.min(max, Math.max(min, page * this.pageSize));
      this.phase = 'paging';
      if (stepNow) this.stepPaging(f * 1000);
      return;
    }

    if (targetFn && this.isInside(this.offset)) {
      // SWE: UIKit's projection is clamped to the bounds before the delegate sees it.
      const { min, max } = this.bounds;
      const projected = Math.min(max, Math.max(min, this.offset + projectedDecelerationDistance(this.v, this.rate)));
      const target = targetFn(projected);
      const delta = target - this.offset;
      if (delta === 0) this.v = 0;
      else if (target !== projected) {
        // SWE +1652…+1800, +2088…+2240: a target past the projection (or v = 0) re-solves v for the current factor:
        // v = c − Δ·ln(rate), c = ±0.01 by the sign of v (+ when v = 0); under 0.25 pt/ms the factor becomes 0.985.
        const c = this.v < 0 ? -STOP_VELOCITY : STOP_VELOCITY;
        if (this.v > 0 ? target > projected : this.v < 0 ? target < projected : true) {
          this.v = c - delta * Math.log(this.rate);
          if (Math.abs(this.v) < RETARGET_SLOW_VELOCITY) {
            this.rate = RETARGET_SLOW_RATE;
            this.v = c - delta * Math.log(this.rate);
          }
        } else this.rate = retargetDecelerationRate(this.v, delta);
        this.decelTarget = target;
      }
    }
    this.phase = 'decelerating';
    if (!this.bounces) this.offset = Math.min(this.bounds.max, Math.max(this.bounds.min, this.offset));
    if (this.decelTarget === null && this.isStopped()) this.finish();
    else if (stepNow) this.stepDeceleration(f * 1000);
  }

  /** Stop immediately (e.g. a touch-down that catches the scroll). */
  stop(): void {
    this.phase = 'idle';
    this.v = 0;
    this.anim = null;
  }

  /** SMG §5 `setContentOffset(_:animated:)`: 0.3 s, curve 0 (sin²). */
  scrollTo(offset: number, animated = true): void {
    this.v = 0;
    if (!animated) {
      this.offset = offset;
      this.phase = 'idle';
      return;
    }
    this.anim = { from: this.offset, to: offset, t: 0 };
    this.phase = 'animating';
  }

  /** Advance one display update of `dtSeconds`. Returns the display offset. */
  step(dtSeconds: number): number {
    if (this.phase === 'animating' && this.anim) {
      this.anim.t += dtSeconds / SET_CONTENT_OFFSET_DURATION;
      this.offset = this.anim.from + (this.anim.to - this.anim.from) * uiAnimationCurve(0, this.anim.t);
      if (this.anim.t >= 1) {
        this.offset = this.anim.to;
        this.anim = null;
        this.phase = 'idle';
      }
      return this.displayOffset;
    }
    if (this.phase !== 'decelerating' && this.phase !== 'paging') return this.displayOffset;
    this.observeFrame(dtSeconds);
    if (this.skipStep) {
      this.skipStep = false;
      return this.displayOffset;
    }
    // Cap one update at 1 s so a stalled tab cannot jump far.
    const ms = Math.min(dtSeconds, 1) * 1000;
    if (ms < MIN_UPDATE_MS) return this.displayOffset;
    if (this.phase === 'paging') this.stepPaging(ms);
    else this.stepDeceleration(ms);
    return this.displayOffset;
  }

  /** Learn the display's maximum frame rate from a frame or input interval (snapped to 30 Hz steps). */
  observeFrame(dtSeconds: number): void {
    if (dtSeconds > 1 / 250 && dtSeconds < 1 / 25) {
      this.frameInterval = Math.min(this.frameInterval, 1 / (Math.round(1 / dtSeconds / 30) * 30));
    }
  }

  private isInside(o: number): boolean {
    return o >= this.bounds.min && o <= this.bounds.max;
  }

  private isStopped(): boolean {
    return Math.abs(this.v) < STOP_VELOCITY && this.isInside(this.offset);
  }

  private finish(): void {
    if (this.decelTarget !== null && this.isInside(this.decelTarget)) this.offset = this.decelTarget;
    this.v = 0;
    this.phase = 'idle';
    this.decelTarget = null;
  }

  /** SMG §4 paging spring: floor(dt) one-ms steps per update, the remainder dropped (fits the simulator traces). */
  private stepPaging(dtMs: number): void {
    // UIKit's friction and pull follow the bounds width even when paging vertically (SMG §4; traces).
    const w = this.boundsWidth || this.pageSize;
    const friction = pagingFriction(w);
    const pull = pagingSpringPull(w);
    for (let i = Math.floor(dtMs); i > 0 && this.phase === 'paging'; i--) {
      [this.offset, this.v] = pagingStep(this.offset, this.v, this.pageTarget, pull, friction);
      // Stop: velocity under the SMG §1 threshold and within half a device pixel of the page.
      if (Math.abs(this.v) < STOP_VELOCITY && Math.abs(this.pageTarget - this.offset) < 0.5 / this.pixelRatio) {
        this.offset = this.pageTarget;
        this.v = 0;
        this.phase = 'idle';
      }
    }
  }

  /** One deceleration step of `dtMs`, following `_getBouncingDecelerationOffset` (BNC). */
  private stepDeceleration(dtMs: number): void {
    const { min } = this.bounds;
    const max = Math.max(this.bounds.min, this.bounds.max); // BNC +36…+40
    const rate = this.rate;
    const last = this.offset;
    let bounceMs = 0;

    if (!this.isInside(last)) {
      bounceMs = dtMs; // BNC +80…+104: already outside → the whole step is bounce
    } else {
      const [next, nv] = decelerationStep(last, this.v, rate, dtMs);
      if (next >= min && next <= max) {
        this.offset = next;
        this.v = nv;
      } else {
        // BNC +244…+400: decelerate up to the edge, spend the rest of the step bouncing.
        const edgeMs = next < min ? (dtMs * (last - min)) / (last - next) : (dtMs * (max - last)) / (next - last);
        bounceMs = dtMs - edgeMs;
        if (!this.bounces) {
          this.offset = next < min ? min : max;
          this.v = 0;
          this.finish();
          return;
        }
        if (edgeMs > 0) [this.offset, this.v] = decelerationStep(last, this.v, rate, edgeMs);
      }
    }

    if (bounceMs > 0) {
      // BNC +404…+656. BNC +688…+792: still bouncing while outside (min − 0.5, max + 0.5).
      const eDecel = decayFactor(rate, bounceMs);
      const eBounce = decayFactor(Math.exp(BOUNCE_LN_DECAY), bounceMs);
      // BNC +536…+560 clamps v to ±3 pt/ms only after a scroll-type-2/4 release (EPN +1048…+1116), never for touch.
      const edge = this.offset < min ? min : max;
      this.offset = edge + eBounce * (this.offset - edge);
      this.offset += (rate * eBounce * this.v * (1 - eDecel)) / (1 - rate);
      this.v *= eDecel * eBounce;
      if (
        this.offset > min - BOUNCE_END_TOLERANCE &&
        this.offset < max + BOUNCE_END_TOLERANCE &&
        Math.abs(this.v) < STOP_VELOCITY
      ) {
        this.offset = Math.min(max, Math.max(min, this.offset));
        this.v = 0;
        this.phase = 'idle';
        this.decelTarget = null;
      }
      return;
    }

    const t = this.decelTarget;
    if (t === null) {
      if (this.isStopped()) this.finish();
    } else if ((this.v > 0 && this.offset >= t) || (this.v < 0 && this.offset <= t)) {
      this.finish(); // SSU +1444…+1504, +1584: reached the target → land on it
    } else if (Math.abs(this.v) < STOP_VELOCITY) {
      // SSU +1508…+1576: below 0.01 pt/ms short of the target, creep at ±0.01 pt/ms (__const table {−0.01, 0.01}).
      if (this.offset === t) this.finish();
      else this.v = this.offset < t ? STOP_VELOCITY : -STOP_VELOCITY;
    }
  }
}

/**
 * SMG §2 pan velocity smoothing: v = 0.2·latest + 0.8·previous sample (when the previous dt > 2^-23 s); a sample is
 * the velocity between two consecutive touch events. `releaseVelocity` adds UIScrollView's release rule.
 */
export class VelocityTracker {
  private lastT: number | null = null;
  private lastX = 0;
  private latest: { v: number; dt: number } | null = null;
  private previous: { v: number; dt: number } | null = null;
  /** Pan velocity after the latest and the previous move (UIScrollView `_verticalVelocity`, `_previous…`). */
  private pan = 0;
  private prevPan = 0;

  /** `t` in milliseconds (e.g. `PointerEvent.timeStamp`), `x` in points. */
  add(t: number, x: number): void {
    if (this.lastT !== null) {
      const dt = (t - this.lastT) / 1000;
      if (dt > 0) {
        this.previous = this.latest;
        this.latest = { v: (x - this.lastX) / dt, dt };
        this.prevPan = this.pan;
        this.pan = this.velocity();
      }
    }
    this.lastT = t;
    this.lastX = x;
  }

  /** pt/s */
  velocity(): number {
    if (!this.latest) return 0;
    // SMG §2: only blend if the previous sample's dt > 2^-23 s (1.19e-7).
    if (this.previous && this.previous.dt > 2 ** -23) return 0.2 * this.latest.v + 0.8 * this.previous.v;
    return this.latest.v;
  }

  /**
   * UIScrollView release velocity (pt/s, finger direction). EPN +732…+764: under 250 pt/s → 0 unless released outside
   * the bounds; EPN +1344…+1428: 0.75·previous + 0.25·latest pan velocity when the previous one is non-zero.
   */
  releaseVelocity(outsideBounds = false): number {
    if (!outsideBounds && Math.abs(this.pan) < MIN_RELEASE_VELOCITY) return 0;
    return this.prevPan !== 0 ? 0.75 * this.prevPan + 0.25 * this.pan : this.pan;
  }

  reset(): void {
    this.lastT = null;
    this.latest = null;
    this.previous = null;
    this.pan = 0;
    this.prevPan = 0;
  }
}
