/**
 * Picker pure logic: UIPickerView wheel geometry (3D cylinder, magnifier band, fade mask) and row snapping.
 *
 * TO = ~/Documents/uikit-internals/components/text_overlays.md §6 (UIPickerView).
 * SC = ~/Documents/uikit-internals/deep/swiftui-components/spec.md §3 (SwiftUI Picker styles).
 * HF = ~/Documents/uikit-internals/deep/haptics-framerate/findings.md.
 */

export const wheelMetrics = {
  /** TO §6.1 default size 320 × 216; SC §3 `.wheel` 400 × 216 (stretched to the proposed width). */
  height: 216,
  /** TO §6.1 intrinsic width (used only when nothing proposes a width). */
  width: 320,
  /** TO §6.1 `_tableRowHeight` 32. */
  rowHeight: 32,
  /** TO §6.5 cylinder radius R = 97.26 pt (m43 = −R(1 − cos θ) holds for every row). */
  radius: 97.26,
  /** TO §6.1 `_selectionBarSideInset` 9 (table x = 9, width 302 at 320). */
  sideInset: 9,
  /**
   * TO §6.2 `_middleBarHeight` 34, frame [9, 91, 302, 34] (also SC §3 DatePicker `.wheel` band 302 × 34).
   * SC §3 Picker `.wheel` reports 32; the UIKit model value is used.
   */
  bandHeight: 34,
  /** TO §6.2: drawn as a capsule (radius ≈ h/2 = 17 from the screenshot scan). */
  bandRadius: 17,
  /** TO §6.3 top/bottom label font `.SFUI-Regular` 21, alpha 0.447. */
  fontSize: 21,
  outerAlpha: 0.447,
  /** TO §6.3 middle (magnified) label font 23.5 (magnification 1.119), alpha 1. */
  magnifiedFontSize: 23.5,
  /** TO §6.4 fade mask: CAGradientLayer destIn over [0, 10, 320, 196]. */
  fadeTop: 10,
  fadeHeight: 196,
  fadeAlphas: [0, 0.71, 0.8, 0.8, 0.71, 0] as const,
  fadeLocations: [0, 0.2, 0.4, 0.6, 0.8, 1] as const,
  /** TO §6.2 fill #747480@0.08 light. */
  bandFillLight: 'rgba(116, 116, 128, 0.08)',
  /**
   * TO §6.2 dark: screenshot (21,21,23) on black. Derived: #767680 at α ≈ 0.18 composites to (21,21,23) on black.
   * TODO(unknown): the model colour for dark was not captured.
   */
  bandFillDark: 'rgba(118, 118, 128, 0.18)',
  /** TO §6.6 `selectRow(animated:)` scrollAnimationDuration 0.3 (= ScrollPhysics.scrollTo, SMG §5). */
  selectDuration: 0.3,
  /** TO §6.6 rubber band 0.55. */
  rubberBand: 0.55,
  /**
   * TO §6.6 measured flick decay 0.99784 / ms (k = 2.164 /s). Core ScrollPhysics snaps rates to 0.998 / 0.99, so the
   * wheel uses UIScrollView's normal 0.998. TODO(unknown): why the picker decays slightly faster than 0.998.
   */
  decelerationRate: 0.998,
  /**
   * TO §6.1: three components give 97 pt each inside the 302 pt table → (302 − 3·97) / 2 = 5.5 pt between columns
   * (derived). TODO(unknown): the column spacing for other component counts.
   */
  columnGap: 5.5,
  /** Rows per PageUp/PageDown. TODO(unknown): UIPickerView has no page keys; web-only. */
  pageRows: 5,
} as const;

/**
 * TO §6.5: angle per row θ = rowHeight / R = 18.85°. The captured cell angles actually step 18.947° (18.849, 37.796,
 * 56.743, 75.691); TODO(unknown): the source of that 0.5 % difference (the model formula is used).
 */
export const ROW_ANGLE = wheelMetrics.rowHeight / wheelMetrics.radius;

export interface WheelRowTransform {
  /** Rotation about X (radians); 0 at the selection band, positive below it. */
  angle: number;
  /** Projected centre of the row relative to the wheel centre (pt, +down): R·sin(angle). */
  y: number;
  /** Projected vertical scale cos(angle) (orthographic: TO §6.5 m34 = 0). */
  scaleY: number;
  /** False once the row is past the cylinder's horizon (|angle| ≥ 90°). */
  visible: boolean;
}

/**
 * Cylinder transform of row `index` at content offset `offset` (offset = selected row · rowHeight at rest).
 * TO §6.5: each row rotates about X by its arc distance / R, m34 = 0, so it projects to y = R sin φ, height ×cos φ.
 */
export function wheelRowTransform(
  index: number,
  offset: number,
  rowHeight: number = wheelMetrics.rowHeight,
  radius: number = wheelMetrics.radius,
): WheelRowTransform {
  const angle = (index * rowHeight - offset) / radius;
  const visible = Math.abs(angle) < Math.PI / 2;
  return { angle, y: radius * Math.sin(angle), scaleY: Math.max(0, Math.cos(angle)), visible };
}

/** CSS `matrix()` for a row whose box is centred on the wheel centre. */
export function wheelRowMatrix(t: WheelRowTransform): string {
  return `matrix(1, 0, 0, ${t.scaleY.toFixed(5)}, 0, ${t.y.toFixed(3)})`;
}

/** First and last row index that can be on the cylinder at `offset` (inclusive, clamped). */
export function visibleRowRange(
  offset: number,
  count: number,
  rowHeight: number = wheelMetrics.rowHeight,
  radius: number = wheelMetrics.radius,
): [number, number] {
  const span = ((Math.PI / 2) * radius) / rowHeight;
  const c = offset / rowHeight;
  return [Math.max(0, Math.floor(c - span)), Math.min(count - 1, Math.ceil(c + span))];
}

export function clampIndex(i: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i));
}

/** Row at the selection band for a content offset. */
export function indexForOffset(offset: number, count: number, rowHeight: number = wheelMetrics.rowHeight): number {
  if (count <= 0) return -1;
  return clampIndex(Math.round(offset / rowHeight), count);
}

/** Snap a projected resting offset to the nearest row (the scrollViewWillEndDragging target). */
export function snapOffset(projected: number, count: number, rowHeight: number = wheelMetrics.rowHeight): number {
  return Math.max(0, indexForOffset(projected, count, rowHeight)) * rowHeight;
}

/** Nearest enabled row to `index` (searching in `dir` first). Returns -1 when none is enabled. */
export function nearestEnabled(index: number, enabled: readonly boolean[], dir: 1 | -1 = 1): number {
  const n = enabled.length;
  if (n === 0) return -1;
  const i0 = clampIndex(index, n);
  if (enabled[i0]) return i0;
  for (let d = 1; d < n; d++) {
    const a = i0 + d * dir;
    const b = i0 - d * dir;
    if (a >= 0 && a < n && enabled[a]) return a;
    if (b >= 0 && b < n && enabled[b]) return b;
  }
  return -1;
}

/**
 * Row under a point `dy` pt from the wheel centre (+down), inverting the cylinder projection. Null past the horizon.
 * UIPickerView scrolls a tapped row to the band.
 */
export function indexAtPoint(
  dy: number,
  offset: number,
  count: number,
  rowHeight: number = wheelMetrics.rowHeight,
  radius: number = wheelMetrics.radius,
): number | null {
  if (Math.abs(dy) >= radius || count <= 0) return null;
  const arc = Math.asin(dy / radius) * radius;
  const i = Math.round((offset + arc) / rowHeight);
  return i < 0 || i >= count ? null : i;
}

/** Keyboard navigation target (listbox semantics); null for keys the wheel does not handle. */
export function keyboardTarget(key: string, index: number, count: number, page: number = wheelMetrics.pageRows): number | null {
  switch (key) {
    case 'ArrowDown':
      return clampIndex(index + 1, count);
    case 'ArrowUp':
      return clampIndex(index - 1, count);
    case 'PageDown':
      return clampIndex(index + page, count);
    case 'PageUp':
      return clampIndex(index - page, count);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

export interface MaskStop {
  y: number;
  alpha: number;
}

/**
 * Mask for the top/bottom (unmagnified) rows: the TO §6.4 fade gradient, with the middle band cut out (TO §6.3: the
 * picker is split into top [0, 91], middle [91, 125] and bottom [125, 216] clip views; the middle shows the magnified
 * copy). Stops are in pt from the wheel's top.
 */
export function outerMaskStops(height: number = wheelMetrics.height, band: number = wheelMetrics.bandHeight): MaskStop[] {
  const m = wheelMetrics;
  // Keep the mask's 10 pt margins and 196 pt span relative to a 216 pt wheel, centred for other heights.
  const top = m.fadeTop + (height - m.height) / 2;
  const fade: MaskStop[] = m.fadeLocations.map((l, i) => ({ y: top + l * m.fadeHeight, alpha: m.fadeAlphas[i]! }));
  const b0 = height / 2 - band / 2;
  const b1 = height / 2 + band / 2;
  const at = (y: number) => {
    for (let i = 1; i < fade.length; i++) {
      const a = fade[i - 1]!;
      const b = fade[i]!;
      if (y <= b.y) return a.alpha + ((b.alpha - a.alpha) * (y - a.y)) / (b.y - a.y);
    }
    return 0;
  };
  const out: MaskStop[] = [];
  for (const s of fade) if (s.y < b0) out.push(s);
  out.push({ y: b0, alpha: at(b0) }, { y: b0, alpha: 0 }, { y: b1, alpha: 0 }, { y: b1, alpha: at(b1) });
  for (const s of fade) if (s.y > b1) out.push(s);
  return out;
}

/** CSS `linear-gradient` for `mask-image` from mask stops. */
export function maskGradient(stops: readonly MaskStop[]): string {
  return `linear-gradient(to bottom, ${stops.map((s) => `rgba(0,0,0,${+s.alpha.toFixed(4)}) ${+s.y.toFixed(3)}px`).join(', ')})`;
}

/** Index of `value` in options (−1 when absent). */
export function optionIndex<T>(options: readonly { value: T }[], value: T | undefined): number {
  if (value === undefined) return -1;
  return options.findIndex((o) => Object.is(o.value, value));
}

/**
 * HF §1/§4: one picker click per row crossing the selection bar while tracking or decelerating, throttled to one per
 * 0.04 s. Returns true when a tick should play.
 */
export function shouldTick(prevRow: number, row: number, now: number, lastTick: number, minInterval = 0.04): boolean {
  return row !== prevRow && now - lastTick >= minInterval;
}
