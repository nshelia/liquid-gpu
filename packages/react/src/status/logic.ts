/**
 * Pure geometry for the status components. Sources (all iOS 27.0, 440×956 @3x):
 * - SUI = uikit-internals/deep/swiftui-components/out/raw (gauge.*, unavailable.*, tab.page*)
 * - CT = uikit-internals/components/controls.md §6 (UIPageControl)
 * - ST = uikit-internals/deep/demo-audit/status/raw (StatusLab probe: shape paths, page-control timelines)
 */

/** Accessory circular gauges: 58×58, ring centre-line radius 26.238, stroke 5.5238 (SUI gauge.accessoryCircular*). */
export const ring = { size: 58, radius: 26.2381, stroke: 5.5238 } as const;
/** `.accessoryCircular`: 270° arc open at the bottom, from −135° to +135° (clockwise from 12 o'clock; ST paths). */
export const ARC_SPAN = 270;

export function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));
}

/** Normalised value of `value` in `[min, max]`. */
export function gaugeFraction(value: number, min = 0, max = 1): number {
  return max === min ? 0 : clamp01((value - min) / (max - min));
}

/** Point on the ring at `deg` (clockwise from 12 o'clock). */
export function ringPoint(deg: number, r: number = ring.radius, c: number = ring.size / 2): [number, number] {
  const a = (deg * Math.PI) / 180;
  return [c + r * Math.sin(a), c - r * Math.cos(a)];
}

/** SVG arc path from `a0` to `a1` degrees (clockwise from 12 o'clock) on the gauge ring. */
export function arcPath(a0: number, a1: number, r: number = ring.radius, c: number = ring.size / 2): string {
  if (a1 - a0 >= 360) a1 = a0 + 359.999;
  const [x0, y0] = ringPoint(a0, r, c);
  const [x1, y1] = ringPoint(a1, r, c);
  const large = a1 - a0 > 180 ? 1 : 0;
  const f = (n: number) => +n.toFixed(4);
  return `M${f(x0)} ${f(y0)}A${r} ${r} 0 ${large} 1 ${f(x1)} ${f(y1)}`;
}

/** `.accessoryCircular` indicator angle for a fraction (−135° … +135°). */
export function circularIndicatorAngle(fraction: number): number {
  return -ARC_SPAN / 2 + clamp01(fraction) * ARC_SPAN;
}

/**
 * UIPageControl geometry (CT §6.1, SUI tab.page): dots 9.667 at a 17.667 pitch, content width 20 + 17.667·n (14 pt
 * side padding around the dot row), height 25.667, capsule radius 12.833. ST many9/10/11/30 (TabView(.page), 440 pt
 * wide): at most 10 slots (196.67 for 10+ pages; CT's standalone 30-page control measured 8 slots, 161.33).
 */
export const pageDots = { dot: 9.6667, pitch: 17.6667, height: 25.6667, radius: 12.8333, pad: 14, maxSlots: 10 } as const;

/** ST many_taps: dots in the two outermost slots on a side with more pages beyond scale to 4.312 / 7.335 (of 9.667). */
export const edgeDotScales = [0.446, 0.759] as const;

/**
 * First page of the 10-slot window (ST many_taps / many_back, 12 pages): moving forward the window slides once the
 * current page would leave relative slot 7; moving back once it would leave relative slot 1.
 */
export function pageWindowStart(prev: number, current: number, pages: number): number {
  let s = prev;
  if (current > s + 7) s = current - 7;
  if (current < s + 1) s = current - 1;
  return Math.min(Math.max(0, pages - pageDots.maxSlots), Math.max(0, s));
}

/** Scale of dot `i` for a window starting at integer page `start`. */
export function dotScale(i: number, start: number, pages: number): number {
  const N = pageDots.maxSlots;
  if (pages <= N) return 1;
  const r = i - start;
  if (r < 0 || r >= N) return 0;
  if (start > 0 && r < 2) return edgeDotScales[r]!;
  if (start + N < pages && r >= N - 2) return edgeDotScales[N - 1 - r]!;
  return 1;
}

/** Scale for a sliding (fractional) window position: linear between the two integer layouts. */
export function dotScaleAt(i: number, w: number, pages: number): number {
  const max = Math.max(0, pages - pageDots.maxSlots);
  const c = Math.min(max, Math.max(0, w));
  const a = Math.floor(c);
  const f = c - a;
  return f === 0 ? dotScale(i, a, pages) : dotScale(i, a, pages) * (1 - f) + dotScale(i, a + 1, pages) * f;
}

export function pageControlWidth(pages: number): number {
  const n = Math.min(Math.max(pages, 0), pageDots.maxSlots);
  return n > 0 ? 20 + pageDots.pitch * n : 0;
}

/** Left of dot `i` inside the content view. */
export function dotLeft(i: number): number {
  return pageDots.pad + i * pageDots.pitch;
}

/**
 * Scrub: the page under the finger. ST scrub.jsonl: from a touch on dot 0, pages changed at Δx ≈ 16 / 28 / 45 pt
 * (CT data: 18 / 30 / 51), i.e. about ¾ of the way to the next dot.
 */
export function scrubPage(x: number, firstDotCentre: number, pages: number): number {
  const p = Math.floor((x - firstDotCentre) / pageDots.pitch + 0.25);
  return Math.min(pages - 1, Math.max(0, p));
}

/**
 * Page shown by the dots while a paging scroll view moves (ST swipe/cross.jsonl): while the finger is down, the page
 * whose half the offset is in (switches at the midpoint); after release, the page the paging animation is heading to
 * (the motion is monotonic, so the next page boundary in the direction of motion).
 */
export function pageForOffset(offset: number, pageSize: number, pages: number, tracking: boolean, direction: number): number {
  if (pageSize <= 0) return 0;
  const p = offset / pageSize;
  const raw = tracking || Math.abs(direction) < 1e-6 ? Math.round(p) : direction > 0 ? Math.ceil(p - 1e-3) : Math.floor(p + 1e-3);
  return Math.min(pages - 1, Math.max(0, raw));
}
