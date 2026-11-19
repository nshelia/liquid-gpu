/**
 * Pure control logic (no React, no DOM): button metrics, switch knob, slider tracking, stepper auto-repeat.
 *
 * Sources (under ~/Documents/uikit-internals/):
 *   CT = components/controls.md
 *   MO = deep/motion/findings.md
 *   HF = deep/haptics-framerate/findings.md
 */
import { metrics, radii, rubberBand } from '@liquid-gpu/core';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------------------------- Button

export type ButtonSize = 'mini' | 'small' | 'medium' | 'large';
export type ButtonVariant = 'plain' | 'gray' | 'tinted' | 'filled' | 'glass' | 'prominentGlass' | 'clearGlass';

export interface ButtonMetrics {
  height: number;
  /** Content insets top/bottom and leading/trailing. */
  insetV: number;
  insetH: number;
  titleSize: number;
  titleLineHeight: number;
  /** Corner radius for solid styles (`dynamic` corner style). Glass styles are capsules (h/2). */
  radius: number;
}

/** CT §1.3 size table (mini = small on iOS 27.0) and CT §1.4 dynamic radius. */
export const buttonMetrics: Record<ButtonSize, ButtonMetrics> = {
  mini: { height: metrics.buttonHeightSmall, insetV: 5, insetH: 10, titleSize: 15, titleLineHeight: 17.9, radius: radii.buttonSmall },
  small: { height: metrics.buttonHeightSmall, insetV: 5, insetH: 10, titleSize: 15, titleLineHeight: 17.9, radius: radii.buttonSmall },
  medium: {
    height: metrics.buttonHeightMedium,
    insetV: metrics.buttonInsetsMedium[0],
    insetH: metrics.buttonInsetsMedium[1],
    titleSize: 17,
    titleLineHeight: 20.29,
    radius: radii.buttonMedium,
  },
  large: { height: metrics.buttonHeightLarge, insetV: 15, insetH: 20, titleSize: 17, titleLineHeight: 20.29, radius: radii.buttonLarge },
};

export const isGlassVariant = (v: ButtonVariant): v is 'glass' | 'prominentGlass' | 'clearGlass' =>
  v === 'glass' || v === 'prominentGlass' || v === 'clearGlass';

/** CT §1.5 colours. `tint` is the accent (default system tint). Returns fill and foreground CSS colours. */
export function buttonColors(
  variant: ButtonVariant,
  appearance: 'light' | 'dark',
  tint: string,
  state: { highlighted?: boolean; disabled?: boolean } = {},
): { fill: string | null; foreground: string } {
  const dark = appearance === 'dark';
  if (state.disabled) {
    // CT §1.5 states: foreground #3C3C43@0.298; solid fills #787880@0.12; plain/glass keep no fill.
    const fg = dark ? 'rgba(235, 235, 245, 0.298)' : 'rgba(60, 60, 67, 0.298)';
    const solid = variant === 'gray' || variant === 'tinted' || variant === 'filled';
    return { fill: solid ? 'rgba(120, 120, 128, 0.12)' : null, foreground: fg };
  }
  const h = state.highlighted ?? false;
  const label = dark ? '#FFFFFF' : '#000000';
  switch (variant) {
    case 'plain':
      return { fill: null, foreground: h ? withAlpha(tint, 0.75) : tint };
    case 'tinted':
      // CT §1.5: 0.18 light / 0.25 dark; highlighted 0.18 → 0.117 (×0.65).
      return { fill: withAlpha(tint, (dark ? 0.25 : 0.18) * (h ? 0.65 : 1)), foreground: h ? withAlpha(tint, 0.75) : tint };
    case 'gray':
      // CT §1.5: #787880@0.16 light / @0.32 dark; highlighted 0.16 → 0.12 (×0.75).
      return { fill: `rgba(120, 120, 128, ${(dark ? 0.32 : 0.16) * (h ? 0.75 : 1)})`, foreground: h ? withAlpha(label, 0.75) : label };
    case 'filled':
      return { fill: h ? withAlpha(tint, 0.75) : tint, foreground: '#FFFFFF' };
    case 'glass':
    case 'clearGlass':
      return { fill: null, foreground: h ? withAlpha(label, 0.75) : label };
    case 'prominentGlass':
      return { fill: null, foreground: '#FFFFFF' };
  }
}

/** Parse "#RRGGBB", "rgb()" or "rgba()" and return it with `alpha` multiplied in. Unknown strings pass through. */
export function withAlpha(color: string, alpha: number): string {
  const c = parseRgb(color);
  if (!c) return color;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${+(c[3] * alpha).toFixed(4)})`;
}

export function parseRgb(color: string): [number, number, number, number] | null {
  const s = color.trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    const full = hex.length === 3 ? [...hex].map((ch) => ch + ch).join('') : hex;
    if (full.length !== 6 && full.length !== 8) return null;
    const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
    return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(s);
  if (!m) return null;
  const parts = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
  if (parts.length < 3 || parts.some((p) => Number.isNaN(p))) return null;
  return [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
}

// ---------------------------------------------------------------------------------------------- Switch

/** CT §2.1 / MO §1 geometry. */
export const switchGeometry = {
  width: metrics.switchWidth, // 63
  height: metrics.switchHeight, // 28
  knobW: metrics.switchKnobWidth, // 37
  knobH: metrics.switchKnobHeight, // 24
  knobPressedW: metrics.switchKnobPressedWidth, // 58
  knobPressedH: metrics.switchKnobPressedHeight, // 38.333
  centreOff: metrics.switchKnobCentreOff, // 20.5
  centreOn: metrics.switchKnobCentreOn, // 42.5
  centreY: 14, // CT §2.1
  travel: metrics.switchKnobCentreOn - metrics.switchKnobCentreOff, // MO §1: 22 pt
  rubberRange: 12, // CT §2.1 drag rubber band range 12
  rubberC: 0.55, // CT §2.1 coefficient 0.55
  lensHangTime: 0.22, // CT §2.3 lensHangTime 0.22 s
  disabledAlpha: 0.5, // CT §2.2
  trackColorDuration: 0.18, // MO §1 well colour crossfade 0.18 s
} as const;

/**
 * CT §2.1 `_knobPositionAdjusted:…`: knob centre while dragged = clamp(base + offset) plus the rubber-banded
 * overshoot 12·(1 − 1/(o/12·0.55 + 1)) past either end. `rtl` swaps the ends.
 */
export function switchKnobCentre(on: boolean, dragOffset: number, rtl = false): number {
  const { centreOff, centreOn, rubberRange, rubberC } = switchGeometry;
  const lo = centreOff;
  const hi = centreOn;
  const base = on !== rtl ? hi : lo;
  return rubberBand(base + dragOffset, lo, hi, rubberRange, rubberC);
}

/**
 * Value committed at touch-up (CT §2.3: commits only at touch-up, also when the drag ends outside).
 * A tap (no drag past the slop) toggles; a drag commits to the side the knob centre is on.
 */
export function switchValueOnRelease(on: boolean, dragged: boolean, knobCentre: number): boolean {
  if (!dragged) return !on;
  return knobCentre > (switchGeometry.centreOff + switchGeometry.centreOn) / 2;
}

// ---------------------------------------------------------------------------------------------- Slider

/** CT §3.1 / §3.2 / §3.3. */
export const sliderGeometry = {
  height: metrics.sliderHeight, // 34
  trackHeight: metrics.sliderTrackHeight, // 6
  trackY: 14, // CT §3.1 trackRect y 14
  thumbW: metrics.sliderThumbWidth, // 37
  thumbH: metrics.sliderThumbHeight, // 24
  thumbY: 5, // CT §3.1 thumb at y 5
  liftScale: 57.35 / 37, // CT §3.2 lens lifts 37×24 → 57.35×37.2 (×1.55)
  slop: 10, // CT §3.2 value changes start after about 10 pt
  tickSize: 3, // CT §3.1 tick dots 3×3
  tickOffsetY: 8.5, // CT §3.1 slider.ticks.json: dots at y 24 (centre 25.5) = 8.5 below the track centre 17 (the doc's 11.5 contradicts its own y 23–26)
  stretchAmount: 50, // CT §3.3 defaultStretchAmount 50
  squishFactor: 0.92, // CT §3.3 squishFactor
  minSquishPoints: 4, // CT §3.3 minSquishPoints
  thumbRubber: 12, // CT §3.2 thumb rubber-bands +12 pt past its maximum
  disabledAlpha: 0.5, // CT §3.1
} as const;

/** CT §3.1 thumbRect: x = v·(W − 37). */
export function sliderThumbX(fraction: number, width: number): number {
  return clamp(fraction, 0, 1) * (width - sliderGeometry.thumbW);
}

/** CT §3.1 tick centres: 18.5 + k·(W − 37)/(n − 1). */
export function sliderTickCentres(width: number, ticks: number): number[] {
  if (ticks < 2) return [];
  const span = width - sliderGeometry.thumbW;
  return Array.from({ length: ticks }, (_, k) => sliderGeometry.thumbW / 2 + (k * span) / (ticks - 1));
}

/**
 * CT §3.2 relative tracking: Δvalue = Δx / trackWidth (the full width, not W − 37), applied once the finger moved
 * past the 10 pt slop. Returns the unclamped fraction (the caller rubber-bands past the ends).
 */
export function sliderTrack(startFraction: number, dx: number, width: number, slopPassed: boolean): number {
  if (!slopPassed) return startFraction;
  return startFraction + dx / width;
}

/** Snap a fraction to `ticks` stops (when `snap` is set) or to `step` in value space. */
export function sliderQuantize(fraction: number, opts: { ticks?: number; snapToTicks?: boolean; steps?: number }): number {
  const f = clamp(fraction, 0, 1);
  if (opts.snapToTicks && opts.ticks && opts.ticks > 1) return Math.round(f * (opts.ticks - 1)) / (opts.ticks - 1);
  if (opts.steps && opts.steps > 0) return Math.round(f * opts.steps) / opts.steps;
  return f;
}

/**
 * CT §3.2 drag past the end: overshoot o (pt of finger past the end, ≥ 0) →
 * track stretch (300 → 307.6 for a long overshoot, i.e. rubber band over `stretchAmount` 50 with c 0.55, scaled ×0.15),
 * height squish (6 → 2.54) and the thumb rubber band (+12 pt max).
 * TODO(unknown): the exact stretch/squish formula was not disassembled; this reproduces the measured end values
 * (+7.6 pt stretch, height ×0.42, thumb +12 pt) for a 150 pt overshoot and is monotonic in o.
 */
export function sliderOvershoot(o: number): { stretch: number; squish: number; thumb: number } {
  if (!(o > 0)) return { stretch: 0, squish: 1, thumb: 0 };
  const band = (range: number, x: number) => (1 - 1 / ((x / range) * 0.55 + 1)) * range;
  const k150 = band(sliderGeometry.stretchAmount, 150);
  const stretch = (band(sliderGeometry.stretchAmount, o) / k150) * 7.6;
  const squish = 1 - (stretch / 7.6) * (1 - 2.54 / 6);
  const thumb = (band(sliderGeometry.stretchAmount, o) / k150) * sliderGeometry.thumbRubber;
  return { stretch, squish, thumb };
}

/** HF §4: index of each tick crossed when the fraction moves a → b (for the tick haptic). */
export function ticksCrossed(a: number, b: number, ticks: number): number[] {
  if (ticks < 2 || a === b) return [];
  const out: number[] = [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (let k = 0; k < ticks; k++) {
    const t = k / (ticks - 1);
    // Half-open so a tick is reported once when the value lands on it.
    if (a < b ? t > lo && t <= hi : t >= lo && t < hi) out.push(k);
  }
  return a < b ? out : out.reverse();
}

/** HF §4: the edge haptic fires when the value reaches an end it was not already at. */
export function hitsEdge(prev: number, next: number): 'min' | 'max' | null {
  if (next >= 1 && prev < 1) return 'max';
  if (next <= 0 && prev > 0) return 'min';
  return null;
}

// ---------------------------------------------------------------------------------------------- Stepper

/** CT §4.1 geometry. */
export const stepperGeometry = {
  width: metrics.stepperWidth, // 94
  height: metrics.stepperHeight, // 32
  minusW: 46.333, // CT §4.1 half-capsule widths 46.33 / 46.67
  plusW: 46.667,
  minusX: 0.667, // stepper.json frames: minus half at x 0.667, plus half at x 47.0, divider at x 46.667
  plusX: 47,
  dividerX: 46.667,
  dividerH: 24,
  dividerY: 4,
  glyph: 13.33,
} as const;

/** CT §4.2: the first repeat fires 0.5 s after touch-down. */
export const STEPPER_FIRST_REPEAT = 0.5;

/**
 * CT §4.2 `_updateCount:`: 0.5 s while count ≤ 3, 0.1 s while count ≤ 18, then 0.05 s. The 3.8 s measured hold
 * changed at +0.50, 1.00, 1.51, 2.01, 2.51, 3.01 and then every 0.101 s, i.e. six 0.5 s repeats: the count advances
 * once per two repeats (CT §13 "the count increments may be paired"). `repeats` = value changes so far.
 */
export function stepperRepeatInterval(repeats: number): number {
  const count = Math.floor(repeats / 2) + 1; // paired count, matching the measured timeline
  if (count <= 3) return 0.5;
  if (count <= 18) return 0.1;
  return 0.05;
}

/** Times (s after touch-down) at which a hold of `duration` seconds produces value changes. */
export function stepperRepeatTimes(duration: number): number[] {
  const out: number[] = [];
  let t = STEPPER_FIRST_REPEAT;
  let count = 0;
  while (t <= duration + 1e-9) {
    out.push(+t.toFixed(6));
    count++;
    t += stepperRepeatInterval(count);
  }
  return out;
}

/** Clamp/wrap a stepper step. */
export function stepperStep(value: number, dir: 1 | -1, opts: { min: number; max: number; step: number; wraps?: boolean }): number {
  const next = +(value + dir * opts.step).toFixed(10);
  if (opts.wraps) {
    if (next > opts.max) return opts.min;
    if (next < opts.min) return opts.max;
  }
  return clamp(next, opts.min, opts.max);
}

// ---------------------------------------------------------------------------------------------- Segmented

/** CT §5.1 / §5.2. */
export const segmentedGeometry = {
  height: metrics.segmentedHeight, // 32
  segmentWidth: metrics.segmentWidth, // 65 (3 segments)
  inset: metrics.segmentedThumbInset, // 2
  radius: radii.segmented, // 16
  thumbRadius: radii.segmentedThumb, // 14
  liftScale: 84.1 / 61, // CT §5.2 lens 61×28 → peak 84.1×43.4 (×1.38)
  labelDimDuration: 0.47, // CT §5.2 touch-down label dim 0.47 s
} as const;

/** Index of the segment under x (local coordinates). */
export function segmentAt(x: number, width: number, count: number): number {
  if (count <= 0) return -1;
  return clamp(Math.floor((x / width) * count), 0, count - 1);
}

// ---------------------------------------------------------------------------------------------- Activity indicator

/** CT §8. */
export const activityGeometry = {
  medium: { size: 20, spokeInner: 3.3, spokeOuter: 9.7, spokeWidth: 1.25 },
  large: { size: 37, spokeInner: 6, spokeOuter: 17, spokeWidth: 2.3 }, // TODO(unknown) large spoke width not read
  spokes: 8,
  frames: 16,
  loop: 0.8, // fullLoopDuration 0.8 s
} as const;

/**
 * CT §8 per-spoke alpha (0…1) at frame f (0…15), spoke i (0…7, clockwise from the top).
 * Frame 0: five dim spokes at 42/255, then a trailing ramp 64 → 86 → 108 → 130. Odd frames shift the ramp half a step.
 */
export function activitySpokeAlpha(frame: number, spoke: number): number {
  // Alpha by distance behind the head spoke (0 = head) on even frames.
  const byBehind = [130, 108, 86, 64, 42, 42, 42, 42];
  const f = ((Math.floor(frame) % 16) + 16) % 16;
  const head = Math.floor(f / 2); // the head advances one spoke every 2 frames (50 ms half-steps)
  const behind = (((head - spoke) % 8) + 8) % 8;
  if (f % 2 === 0) return byBehind[behind]! / 255;
  // Odd frames sit half-way to the next even frame: (130+108)/2 = 119, 97, 75, 53 as measured.
  const next = (behind + 1) % 8;
  return (byBehind[behind]! + byBehind[next]!) / 2 / 255;
}
