/**
 * Navigation geometry and decisions (pure).
 * TR = findings/transitions.md (§1 push/pop, §2 interactive pop, §6 large title), BR = components/bars.md.
 */
import { gestureThresholds, metrics, POP_PARALLAX, rubberBand, RUBBER_BAND_TOUCH } from '@liquid-gpu/core';
import type { GestureDecision } from '../root/gestures';

/** TR §1: `_UIParallaxDimmingView` black α 0.10 over the outgoing view. */
export const NAV_DIM_ALPHA = 0.1;
/** TR §2 `rubberBandExtent` 0.5 (fraction of the width) for over-drag past the start. */
export const POP_RUBBER_BAND_EXTENT = 0.5;

/**
 * Positions for transition progress `p` (0 = the top screen fully off to the right, 1 = fully shown).
 * Incoming x = W·(1 − p); the screen below parallaxes to −0.3·W·p (TR §1) and dims to 0.1·p.
 */
export function stackTransforms(p: number, width: number): { topX: number; belowX: number; belowDim: number } {
  return {
    topX: width * (1 - p),
    belowX: -POP_PARALLAX * width * p,
    belowDim: NAV_DIM_ALPHA * Math.max(0, Math.min(1, p)),
  };
}

/** TR §2: percent = rubberBand(translation/W, min 0, max 1, range 0.5, c). */
export function popPercent(translation: number, width: number, c = RUBBER_BAND_TOUCH): number {
  return rubberBand(translation / width, 0, 1, POP_RUBBER_BAND_EXTENT, c);
}

/**
 * Interactive back-swipe recognition. Edge pan: start within 46.6 pt of the leading edge, hysteresis 15
 * (TR §2 edgeSettings). Full-width content pan: hysteresis 10 (SMG §7 UIPanGestureRecognizer). Rightward only.
 */
export function popGestureDecision(
  dx: number,
  dy: number,
  startXInScreen: number,
  fullWidth: boolean,
): GestureDecision {
  const edge = startXInScreen <= gestureThresholds.edgePanRegion;
  if (!edge && !fullWidth) return 'fail';
  const h = edge ? gestureThresholds.edgePanHysteresis : gestureThresholds.panHysteresis;
  if (dx >= h && dx > Math.abs(dy)) return 'claim';
  if (Math.abs(dy) >= h && Math.abs(dy) >= Math.abs(dx)) return 'fail';
  if (dx <= -h) return 'fail';
  return 'wait';
}

/** BR §1.1: inline bar 54 tall below the safe area; the large-title band adds 52. */
export function navBarHeight(safeTop: number, large: boolean): number {
  return safeTop + metrics.navBarHeight + (large ? metrics.largeTitleBand : 0);
}

/**
 * TR §6: the bar height tracks the scroll 1:1 over the 52 pt band; the inline title appears once the band is
 * scrolled away. Returns the collapse fraction 0…1.
 */
export function largeTitleCollapse(offset: number): number {
  return Math.min(1, Math.max(0, offset / metrics.largeTitleBand));
}

/**
 * BR §9 scroll edge effect region: the bar bottom + 40 (156 on a 62 pt safe area inline bar). Automatic style:
 * opacity 0 at the scroll edge, 1 once scrolled.
 */
export function scrollEdgeHeight(safeTop: number): number {
  return safeTop + metrics.navBarHeight + 40;
}

/** BR §2: toolbar capsules 48 tall, 28 from the sides and the bottom; content inset bottom 86. */
export const TOOLBAR = { height: 48, inset: 28, contentInsetBottom: 86, itemHeight: 38, itemInset: 5, itemGap: 14, capsuleGap: 12 } as const;

/** BR §1.7: nav item capsules 44 tall, 20 pt margins, 12 apart; items 36 tall inset 4, 16 apart. */
export const NAV_ITEMS = { height: 44, margin: 20, capsuleGap: 12, itemHeight: 36, itemInset: 4, itemGap: 16, symbolPad: 7, textPad: 12 } as const;
