/**
 * Sheet geometry (pure). TR = findings/transitions.md §3, SH = deep/sheets/findings.md, GS = deep/gestures §4.
 */
import { metrics, radii, rubberBand, sheetExtents } from '@liquid-gpu/core';

export type DetentName = 'medium' | 'large';

/** Detent tops in container coordinates. TR §3a: large 62 (the safe-area top), medium 440.4 on a 956 pt screen. */
export function detentTop(d: DetentName, height: number, safeTop: number): number {
  if (d === 'large') return Math.max(safeTop, 10); // TODO(unknown): with no status bar the gap is a visual choice
  return height * (metrics.sheetDetentMedium / metrics.sheetDetentDismissed);
}

/**
 * Drag constraint: no travel above the largest detent (SH §2 extentBeyondMinimum y = 0); below the lowest allowed
 * point (dismissed, or the lowest detent when not dismissible) a 200 pt rubber band with c 0.55 (SH §2).
 */
export function constrainSheetTop(raw: number, largestTop: number, lowestTop: number): number {
  if (raw < largestTop) return largestTop;
  if (raw > lowestTop) return rubberBand(raw, largestTop, lowestTop, sheetExtents.beyondDismissed, sheetExtents.rubberBand);
  return raw;
}

/** 0 at (or below) medium, 1 at large; TR §3a: inset/scale interpolate linearly with the position. */
export function sheetExpansion(top: number, mediumTop: number, largeTop: number): number {
  if (mediumTop <= largeTop) return 1;
  return Math.min(1, Math.max(0, (mediumTop - top) / (mediumTop - largeTop)));
}

/** TR §3a: medium drawn at scale 0.96364 (inset 8), large at 1; top radius 54 → 62, bottom 38. */
export function sheetScale(expansion: number): number {
  return metrics.sheetMediumScale + (1 - metrics.sheetMediumScale) * expansion;
}

export function sheetTopRadius(expansion: number): number {
  return radii.sheetMediumTop + (radii.sheetLargeTop - radii.sheetMediumTop) * expansion;
}

/**
 * Visual drop of the scaled sheet: at medium the drawn top is 451.08 for a 440.4 detent (TR §3a: scale about the
 * 515.67 pt bounds centre, ty +1.376) = 10.68 pt, proportional to (1 − scale).
 */
export function sheetVisualOffset(scale: number): number {
  return ((1 - scale) / (1 - metrics.sheetMediumScale)) * 10.68;
}

/**
 * SH §4: glass at medium, opaque once the sheet passes the midpoint between the detents.
 * Returns true when the content background should be opaque.
 */
export function sheetOpaque(top: number, mediumTop: number | null, largeTop: number | null): boolean {
  if (mediumTop === null) return true;
  if (largeTop === null) return false;
  return top < (mediumTop + largeTop) / 2;
}

/**
 * Dimming factor 0…1 (× the dimming colour alpha 0.2 light / 0.48 dark, TR §3a). SH §5: dimmed at every detent by
 * default; with `largestUndimmedDetent = medium` 0 at medium and 1 at large. Between detents and while presenting it
 * is interpolated linearly by position (TODO(unknown): the in-between curve was not measured, SH §5).
 */
export function sheetDimming(top: number, height: number, largeTop: number, mediumTop: number, lowestTop: number, undimmedMedium: boolean): number {
  if (undimmedMedium) return sheetExpansion(top, mediumTop, largeTop);
  if (top >= height) return 0;
  if (top <= lowestTop) return 1;
  return Math.max(0, Math.min(1, (height - top) / (height - lowestTop)));
}
