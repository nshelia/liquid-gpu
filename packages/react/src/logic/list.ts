/**
 * Swipe-action geometry (pure). LS = components/lists.md §1.7, GS = deep/gestures/findings.md §1 (core encodes the
 * decision rules: swipeActionOffset, swipeActionRubberBand, swipeActionShouldConfirm, swipeActionRelease).
 */
import { gestureThresholds, swipeActionMetrics, swipeActionOffset, swipeActionRubberBand } from '@liquid-gpu/core';
import type { GestureDecision } from '../root/gestures';

/** LS §1.7: inter-button padding 10, also at the outer edge. */
export const SWIPE_PADDING = 10;
/** LS §1.7: button width = title + 2 × 12, minimum 60. */
export const SWIPE_BUTTON_MIN = 60;
export const SWIPE_BUTTON_TEXT_PAD = 12;

export function swipeButtonWidth(titleWidth: number): number {
  return Math.max(SWIPE_BUTTON_MIN, titleWidth + 2 * SWIPE_BUTTON_TEXT_PAD);
}

/** LS §1.7: openThreshold = Σ button widths + (n + 1) × 10 (−156.67 for Delete + More); signed by side. */
export function swipeOpenThreshold(buttonWidths: readonly number[], side: 'leading' | 'trailing'): number {
  if (buttonWidths.length === 0) return 0;
  const w = buttonWidths.reduce((a, b) => a + b, 0) + (buttonWidths.length + 1) * SWIPE_PADDING;
  return side === 'trailing' ? -w : w;
}

/**
 * Cell offset while dragging. A closed cell follows the finger minus the 25 pt hysteresis (GS §1); an open cell
 * follows 1:1 from where it was. Past the full row width the excess is rubber-banded with exponent 0.7 (LS §1.7).
 * Sides without actions are clamped at 0.
 */
export function swipeDragOffset(
  base: number,
  translation: number,
  translationAtClaim: number,
  rowWidth: number,
  hasLeading: boolean,
  hasTrailing: boolean,
): number {
  let off = base === 0 ? swipeActionOffset(translation) : base + (translation - translationAtClaim);
  if (!hasLeading) off = Math.min(0, off);
  if (!hasTrailing) off = Math.max(0, off);
  if (off < -rowWidth) off = swipeActionRubberBand(off, -rowWidth);
  if (off > rowWidth) off = swipeActionRubberBand(off, rowWidth);
  return off;
}

/**
 * Recognition for a row's swipe: claims a horizontal move of 25 pt (GS §1 `_UISwipeActionPanGestureRecognizer`) toward
 * a side with actions (or any horizontal move when already open); fails on vertical movement (the scroll view takes
 * it) or on a horizontal move toward a side without actions (the back swipe may take it). A rightward move that starts
 * in the 46.6 pt edge region belongs to the navigation back swipe.
 */
export function swipeDecision(
  dx: number,
  dy: number,
  startX: number,
  open: boolean,
  hasLeading: boolean,
  hasTrailing: boolean,
): GestureDecision {
  const h = gestureThresholds.swipeActionHysteresis;
  const pan = gestureThresholds.panHysteresis;
  if (Math.abs(dy) >= pan && Math.abs(dy) > Math.abs(dx)) return 'fail';
  if (open) return Math.abs(dx) >= pan ? 'claim' : 'wait';
  const toward = dx < 0 ? hasTrailing : hasLeading && startX > gestureThresholds.edgePanRegion;
  if (Math.abs(dx) >= pan && !toward) return 'fail';
  if (Math.abs(dx) >= h && Math.abs(dx) > Math.abs(dy)) return 'claim';
  return 'wait';
}

export const SWIPED_CELL_RADIUS = swipeActionMetrics.cornerRadius;

/**
 * Edit mode (deep/demo-audit/list-edit, UIKit27-C): the content view moves from cell + 0 to cell + 44 and its leading
 * margin shrinks 20 → 16, so text goes from cell + 20 to cell + 60; the 25.67 pt edit control box (22 pt glyph) is
 * centred at cell + 32 and slides in with the content (from −24.73); the 27 pt reorder control ends at maxX − 20 and
 * slides in from maxX. All share one critically damped spring, response 0.30 (fit max err 0.0007), opacity = progress.
 */
export const EDIT = {
  textShift: 40,
  controlShift: 44,
  controlCenter: 32,
  controlGlyph: 22,
  grabberWidth: 27,
  grabberTrailing: 20,
  /** Content view ends at the grabber (cell maxX − 47) with a 16 pt margin. */
  trailingWithGrabber: 63,
  spring: { dampingRatio: 1, response: 0.3 },
  /** Delete reveal by the minus control: cell on the swipe release spring; Delete button scale 0.48 / ζ 0.72. */
  deleteScaleSpring: { dampingRatio: 0.72, response: 0.48 },
  /** Reorder: neighbours ζ 1 / 0.30, drop ζ 1 / 0.28 (fits 0.0006, 0.0025–0.0044). */
  shiftSpring: { dampingRatio: 1, response: 0.3 },
  dropSpring: { dampingRatio: 1, response: 0.28 },
  /** Lift appears 0.15 s after touch-down on the grabber (or on the first move). */
  liftDelay: 0.15,
} as const;

/** Slot the dragged row targets: its centre crosses half of a neighbour (UIKit swaps at offset > h/2). */
export function reorderTarget(from: number, offset: number, heights: readonly number[]): number {
  let to = from;
  let rest = offset;
  if (offset > 0) {
    while (to + 1 < heights.length && rest > heights[to + 1]! / 2) {
      rest -= heights[to + 1]!;
      to++;
    }
  } else {
    while (to - 1 >= 0 && -rest > heights[to - 1]! / 2) {
      rest += heights[to - 1]!;
      to--;
    }
  }
  return to;
}

/** Shift of row `i` while row `from` (height `h`) is dragged toward slot `to`. */
export function reorderShift(i: number, from: number, to: number, h: number): number {
  if (from < to && i > from && i <= to) return -h;
  if (from > to && i < from && i >= to) return h;
  return 0;
}

/** Offset of slot `to` relative to slot `from` (sum of the heights crossed). */
export function reorderSlotOffset(from: number, to: number, heights: readonly number[]): number {
  let y = 0;
  for (let i = from + 1; i <= to; i++) y += heights[i]!;
  for (let i = to; i < from; i++) y -= heights[i]!;
  return y;
}

/** `array` with the element at `from` moved to `to` (SwiftUI `move(fromOffsets:toOffset:)` for one element). */
export function moveItem<T>(array: readonly T[], from: number, to: number): T[] {
  const out = array.slice();
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x as T);
  return out;
}
