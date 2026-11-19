/**
 * Pure helpers for the basics components. Measurements: BL = uikit-internals/deep/demo-audit/basics (raw/*.jsonl,
 * per-frame presentation layers on iOS 27.0, real idb taps).
 */
import type { SpringParams } from '@liquid-gpu/core';

/** BL anim-*-expand/collapse: chevron rotation and standalone reveal = Animation.default (ζ 1, response 0.5; fit 0.49/1.02). */
export const disclosureSpring: SpringParams = { dampingRatio: 1, response: 0.5 };
/** BL anim-list-*: list rows insert/remove (cells fade in place, rows below slide): ζ 1, response 0.3 (rms 0.001). */
export const disclosureListSpring: SpringParams = { dampingRatio: 1, response: 0.3 };
/** BL anim-link-hold: plain-button press opacity 0.2 at touch-down; release back to 1 fits ζ 0.88, response 0.54. */
export const pressReleaseSpring: SpringParams = { dampingRatio: 0.88, response: 0.54 };
export const PRESSED_OPACITY = 0.2;

/** chevron.right 7×12 rotated 90° when expanded, about a pivot 1 pt left of its centre (BL: centre (415.83, 550) → (414.83, 551)). */
export const CHEVRON = { width: 7, height: 12, originX: 2.5, originY: 6 } as const;

export function chevronTransform(progress: number): string {
  const a = 90 * progress;
  return Math.abs(a) < 1e-3 ? '' : `rotate(${+a.toFixed(3)}deg)`;
}

/** Clamped [0, 1] progress (springs can overshoot slightly). */
export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Revealed height of the disclosure content for a spring progress (never negative, never past the content). */
export function revealHeight(progress: number, contentHeight: number): number {
  return clamp01(progress) * Math.max(0, contentHeight);
}
