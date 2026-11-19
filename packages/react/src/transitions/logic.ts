/**
 * Pure transition logic: Photos-style zoom (UIKit `.zoom` and Photos tile mode), the swipe-down dismiss curve and
 * decision, and the glass-button → full-screen card morph.
 *
 * Sources (under ~/Documents/uikit-internals/):
 *   PT = deep/photos-transition/findings.md  (§3 UIKit .zoom, §4 Photos tile, §5 Photos swipe-down)
 *   TR = findings/transitions.md             (§4 zoom springs, dismiss interaction settings)
 *   SH = deep/sheets/findings.md             (§6 zoom from a glass button)
 */
import { gestureThresholds, radii, rubberBand, shadows, springs, type SpringParams } from '@liquid-gpu/core';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type ZoomMode = 'zoom' | 'tile';

/** Per-mode constants. */
export const zoomModes = {
  /** UIKit `.zoom` (PT §3, TR §4). */
  zoom: {
    open: springs.zoomIn, // TR §4 zoomIn ζ1 0.34, retargetImpulse 0.016
    openVelocity: 6.5, // TR §4 measured v0 ≈ 6.5 × distance/s
    close: springs.zoomOut, // TR §4 zoomOut ζ0.92 0.34
    radius: springs.zoomCornerRadius, // TR §4 cornerRadiusAdjustment ζ1 0.35
    track: springs.zoomDismissUpdate, // TR §4 updateSpring ζ1 0.2
    commit: springs.zoomOutInteractive, // TR §4 zoomOutInteractive ζ1 0.4
    cancel: springs.zoomCancel, // TR §4 cancelInteractive ζ1 0.25
    dim: 0.15, // PT §3 / TR §4 dimming black @0.15
    shadow: shadows.zoomPlatter, // PT §3 opacity 0.4, radius 40, offset (0, 10)
    presenterScale: 1 - 34.67 / 440, // PT §3 receded background 0.9212 (scaleDownPoints 34.67)
    destinationRadius: radii.display, // card at rest has the display corner radius
    follow: 0.6, // PT §3 / TR §4 card centre ≈ 0.6 × (finger − 15)
  },
  /** Photos `PUOneUpAssetNavigationTransition` (PT §4, §5). */
  tile: {
    open: { dampingRatio: 1, response: 0.3 } as SpringParams, // PT §4 kind 1000: ζ1, 0.3 s
    openVelocity: 0,
    close: { dampingRatio: 1, response: 0.3 } as SpringParams, // PT §4 pop duration 0.3
    radius: { dampingRatio: 1, response: 0.3 } as SpringParams,
    track: { dampingRatio: 1, response: 0.08 } as SpringParams, // PT §5 follows 1:1 (light smoothing). TODO(unknown)
    commit: { dampingRatio: 1, response: 0.2 } as SpringParams, // PT §5 release → grid: ζ1, response ≈0.20 s
    cancel: { dampingRatio: 1, response: 0.3 } as SpringParams, // TODO(unknown): cancel spring not measured
    dim: 0, // Photos crossfades the background to the viewer colour instead of dimming
    shadow: { opacity: 0, radius: 0, offsetY: 0 },
    presenterScale: 1,
    destinationRadius: 0, // PT §4 itemContentCornerRadius 0: square corners
    follow: 1,
  },
} as const;

/** TR §4 hysteresis 15 pt; PT §5 "1:1 after ≈15 pt hysteresis". */
export const SWIPE_HYSTERESIS = 15;

/** Piecewise-linear interpolation through (x, y) knots, clamped at the ends and extrapolated past the last knot. */
function piecewise(knots: readonly (readonly [number, number])[], x: number): number {
  if (x <= knots[0]![0]) return knots[0]![1];
  for (let i = 1; i < knots.length; i++) {
    const [x1, y1] = knots[i]!;
    const [x0, y0] = knots[i - 1]!;
    if (x <= x1) return lerp(y0, y1, (x - x0) / (x1 - x0));
  }
  const [xa, ya] = knots[knots.length - 2]!;
  const [xb, yb] = knots[knots.length - 1]!;
  return yb + ((yb - ya) / (xb - xa)) * (x - xb);
}

/** PT §3 measured scale per finger travel (UIKit .zoom, MEAS-LAB r4 trial 5). */
const ZOOM_SCALE_KNOTS = [
  [0, 1],
  [44, 0.989],
  [98, 0.954],
  [155, 0.914],
  [222, 0.866],
  [300, 0.806],
] as const;

/** PT §5 measured Photos scale (0.972 @ 76 pt, 0.789 @ 281 pt). */
const TILE_SCALE_KNOTS = [
  [0, 1],
  [76, 0.972],
  [281, 0.789],
] as const;

/**
 * Card scale for a downward finger travel (pt). Upward travel does not scale.
 * Floors: TR §4 minScale 0.6 (.zoom); PT §5 scaleDownFactor 0.5 (Photos).
 */
export function swipeDownScale(mode: ZoomMode, travel: number): number {
  if (!(travel > 0)) return 1;
  if (mode === 'zoom') return clamp(piecewise(ZOOM_SCALE_KNOTS, travel), gestureThresholds.zoomDismissMinScale, 1);
  return clamp(piecewise(TILE_SCALE_KNOTS, travel), 0.5, 1);
}

/**
 * Card translation for a finger displacement (dx, dy) since touch-down: nothing until the 15 pt hysteresis, then
 * 1:1 (tile) or 0.6× (zoom) of the travel past it. Upward motion is resisted (PT §5 upResistanceDistance 100).
 */
export function swipeDownOffset(mode: ZoomMode, dx: number, dy: number): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist <= SWIPE_HYSTERESIS) return { x: 0, y: 0 };
  const k = (dist - SWIPE_HYSTERESIS) / dist; // remove the hysteresis along the drag direction
  const f = zoomModes[mode].follow;
  let x = dx * k * f;
  let y = dy * k * f;
  // TODO(unknown): PT §5 gives only the resistance distances (up 100, horizontal 100), not the curve; the
  // UIScrollView rubber band (c 0.55) over that range is used.
  const resist = (v: number, range: number) => Math.sign(v) * range * (1 - 1 / ((Math.abs(v) / range) * 0.55 + 1));
  if (y < 0) y = resist(y, 100);
  if (mode === 'tile') x = resist(x, 100);
  return { x, y };
}

/**
 * Release decision. `travel` = downward finger travel (pt), `vy` = vertical release velocity (pt/s, + = down).
 * - .zoom reproduces every PT §3 outcome: 60@300 cancel, 120@300 cancel, 200@300 dismiss, 300@300 dismiss,
 *   60@1500 cancel, 120@1500 dismiss, 40@3000 cancel, up 150 cancel; TR §4: 58 slow cancel, 148/280 dismiss,
 *   40 pt flick cancel. Rule: travel ≥ 145 (≈ dismissThreshold 150 after the update-spring lag), or a flick
 *   (vy ≥ 1000) with travel ≥ 100.
 * - Photos: PT §5 "even a short 80 pt slow drag dismissed": any downward release velocity past the hysteresis
 *   dismisses, as does travel ≥ 200 (`_handlePan` literal 200) unless flicked back up.
 */
export function swipeDownShouldDismiss(mode: ZoomMode, travel: number, vy: number): boolean {
  if (travel <= SWIPE_HYSTERESIS) return false;
  if (mode === 'zoom') {
    if (vy < -100) return false;
    return travel >= 145 || (vy >= 1000 && travel >= 100);
  }
  if (vy < -50) return false;
  return vy > 50 || travel >= 200;
}

/** Fraction (0…1) of the background that is revealed while dragging, for the dim/crossfade. */
export function swipeDownProgress(travel: number): number {
  return clamp(travel / 400, 0, 1); // PT §5 transitionDistance 400
}

/** Aspect-fit `content` (w/h aspect) inside `box`. */
export function fitRect(box: Rect, aspect: number): Rect {
  if (!(aspect > 0)) return { ...box };
  let w = box.width;
  let h = w / aspect;
  if (h > box.height) {
    h = box.height;
    w = h * aspect;
  }
  return { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h };
}

/** Interpolate two rects. */
export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), width: lerp(a.width, b.width, t), height: lerp(a.height, b.height, t) };
}

// ---------------------------------------------------------------------------------------------- glass morph (SH §6)

export const glassMorph = {
  width: springs.sheetMorphWidth, // SH §6 width fit ζ0.75, 0.5 s (rough)
  height: springs.sheetMorphHeight, // SH §6 height fit ζ0.65, 0.48 s (rough)
  contentFadeDelay: 0.07, // SH §6 content opacity 0 → 1 starts ≈0.07 s after the tap
  contentFadeDuration: 0.2, // SH §6 0.2 s CABasicAnimation
  presenterScale: 0.921, // SH §6 presenting view recedes to 0.921 (405.3/440)
  presenterRadius: 24.3, // SH §6 floating bar container rounded ≈24.3 → 62
  midRadius: 96, // SH §6 corner radius ~90–98 mid-flight
  restRadius: radii.display, // 62 at rest
  dragWidthPerPt: 0.23, // SH §6 interactive dismiss: width shrinks ≈0.23 pt per pt of drag
  dragRadius: 48, // SH §6 corners 62 → ~48 while dragging
  buttonBounce: [1.204, 1.144, 1.017, 0.944, 1.012, 1] as const, // SH §6 source glass scale keyframes over ≈0.7 s
} as const;

/**
 * SH §6 corner radius along the morph: starts at the button's capsule radius, bulges to ~96 mid-flight, rests at 62.
 * `pw`, `ph` = width / height progress (0…1+). Never exceeds half the short side.
 */
export function glassMorphRadius(sourceRadius: number, w: number, h: number, pw: number, ph: number): number {
  const p = clamp((pw + ph) / 2, 0, 1);
  const bulge = Math.sin(Math.PI * p) * (glassMorph.midRadius - lerp(sourceRadius, glassMorph.restRadius, p));
  const r = lerp(sourceRadius, glassMorph.restRadius, p) + Math.max(0, bulge);
  return Math.max(0, Math.min(r, Math.min(w, h) / 2));
}

/**
 * SH §6 path from a glass button in the content: the card grows centred on the button horizontally, its vertical
 * centre moves from the button to the screen centre. Width follows `pw`, height `ph` (separate springs), and the
 * horizontal centre follows the width progress so the card ends centred on screen.
 */
export function glassMorphRect(source: Rect, dest: Rect, pw: number, ph: number): Rect {
  const width = Math.max(1, lerp(source.width, dest.width, pw));
  const height = Math.max(1, lerp(source.height, dest.height, ph));
  const cx = lerp(source.x + source.width / 2, dest.x + dest.width / 2, pw);
  const cy = lerp(source.y + source.height / 2, dest.y + dest.height / 2, ph);
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

/** SH §6 interactive dismiss: the top follows the finger, the bottom stays, width shrinks 0.23 pt per pt. */
export function glassMorphDragRect(dest: Rect, dy: number): Rect & { radius: number } {
  const d = Math.max(0, dy);
  const width = Math.max(dest.width * 0.4, dest.width - glassMorph.dragWidthPerPt * d);
  const bottom = dest.y + dest.height - 0.06 * d; // SH §6 bottom stays near 925–950
  const top = dest.y + d;
  const p = clamp(d / 400, 0, 1);
  return {
    x: dest.x + (dest.width - width) / 2,
    y: top,
    width,
    height: Math.max(1, bottom - top),
    radius: lerp(glassMorph.restRadius, glassMorph.dragRadius, p),
  };
}

/** Content fade of the presented card at `t` seconds after the tap (SH §6: 0.2 s starting at 0.07 s). */
export function glassMorphContentOpacity(t: number): number {
  return clamp((t - glassMorph.contentFadeDelay) / glassMorph.contentFadeDuration, 0, 1);
}

// ---- One-up horizontal paging (Photos `PUTilingView`) ---------------------------------------------------------

/**
 * Gap between neighbouring photos while paging: `PUOneUpSettings.interpageSpacing = 40`
 * (deep/photos-transition raw/photos-dump/settings-flat.txt). Page pitch = viewport width + 40.
 */
export const ONE_UP_PAGE_SPACING = 40;
/** Movement before the swipe picks an axis; horizontal wins when |dx| > |dy| (UIScrollView pan hysteresis ≈ 10 pt). */
export const PAGE_AXIS_HYSTERESIS = 10;

/**
 * Horizontal content offset for a finger travel `dx`: 1:1 while a neighbour exists in that direction, otherwise the
 * UIScrollView rubber band (core `rubberBand`, range = page width).
 * TODO(unknown): Photos' own edge resistance is not measured; the UIScrollView rubber band is assumed.
 */
export function pageDragOffset(dx: number, hasPrev: boolean, hasNext: boolean, pageWidth: number): number {
  // rubberBand works in scroll-offset space (−dx); the bounds are open toward the neighbours that exist.
  return -rubberBand(-dx, hasPrev ? -Infinity : 0, hasNext ? Infinity : 0, pageWidth);
}

/**
 * Page chosen at release (SMG §4 `pagingTargetPage`: a flick over 0.3 pt/ms pages in its direction, else the nearest
 * page), clamped to one step and to the neighbours that exist. `offset` is the content offset (finger direction, pt),
 * `vx` the release velocity (pt/s). Returns −1 (previous), 0 (stay) or +1 (next).
 */
export function pageReleaseStep(offset: number, vx: number, pitch: number, hasPrev: boolean, hasNext: boolean): -1 | 0 | 1 {
  const page = -offset / pitch; // scroll-offset space: dragging left (offset < 0) moves toward the next page
  const v = -vx / 1000;
  const flick = 0.3; // SMG §4 PAGING_FLICK_VELOCITY (pt/ms)
  let target = v > flick ? Math.floor(page) + 1 : v < -flick ? Math.ceil(page) - 1 : Math.floor(page + 0.5);
  target = clamp(target, -1, 1);
  if (target > 0 && !hasNext) return 0;
  if (target < 0 && !hasPrev) return 0;
  return target as -1 | 0 | 1;
}
