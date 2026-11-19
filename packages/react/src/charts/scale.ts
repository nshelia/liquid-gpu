/**
 * Pure chart logic: data extraction, nice ticks, scales, stacking, path generation, number formatting, pie angles.
 * No React, no DOM: everything here is covered by `scale.test.ts`.
 *
 * Swift Charts is not in the uikit-internals extraction, so the defaults below emulate its documented behaviour
 * (automatic "nice" axis domains that include zero for bars/areas, diverging stacking for negative values,
 * `.catmullRom` / `.monotone` interpolation). // TODO(unknown): Swift Charts not extracted
 */

export type Datum = Record<string, string | number>;
export type AxisFormat = 'number' | 'percent' | 'currency' | 'compact';
export type Interpolation = 'linear' | 'catmullRom' | 'monotone';
export type Point = readonly [number, number];

// ---------------------------------------------------------------------------------------------------------------------
// Data extraction

export interface SeriesTable {
  /** Distinct x values in first-appearance order (as strings: the categorical domain). */
  categories: string[];
  /** Numeric x per category when every x value is a finite number (enables a linear x scale), else null. */
  numericX: number[] | null;
  /** Distinct series names in first-appearance order (one unnamed series `''` without a `series` key). */
  series: string[];
  /** values[s][c]: summed y of series s at category c, or NaN when that combination is absent. */
  values: number[][];
}

export function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return n;
  }
  return NaN;
}

/** Pivot `data` rows into a series × category table. Duplicate (series, x) pairs are summed (Swift Charts stacks them). */
export function extractSeries(data: readonly Datum[], x: string, y: string, series?: string): SeriesTable {
  const categories: string[] = [];
  const catIndex = new Map<string, number>();
  const seriesNames: string[] = [];
  const seriesIndex = new Map<string, number>();
  const rawX: unknown[] = [];
  const cells: [number, number, number][] = [];
  for (const row of data) {
    const xv = row[x];
    if (xv === undefined || xv === null) continue;
    const key = String(xv);
    let ci = catIndex.get(key);
    if (ci === undefined) {
      ci = categories.length;
      catIndex.set(key, ci);
      categories.push(key);
      rawX.push(xv);
    }
    const sname = series ? String(row[series] ?? '') : '';
    let si = seriesIndex.get(sname);
    if (si === undefined) {
      si = seriesNames.length;
      seriesIndex.set(sname, si);
      seriesNames.push(sname);
    }
    cells.push([si, ci, toNumber(row[y])]);
  }
  const values = seriesNames.map(() => categories.map(() => NaN));
  for (const [si, ci, v] of cells) {
    if (!Number.isFinite(v)) continue;
    const row = values[si]!;
    row[ci] = Number.isNaN(row[ci]!) ? v : row[ci]! + v;
  }
  const allNumeric = rawX.length > 0 && rawX.every((v) => typeof v === 'number' && Number.isFinite(v));
  return { categories, numericX: allNumeric ? (rawX as number[]) : null, series: seriesNames, values };
}

// ---------------------------------------------------------------------------------------------------------------------
// Nice ticks

/** A "nice" step (1, 2, 5 × 10ⁿ) close to `span / count`. */
export function niceStep(span: number, count: number): number {
  if (!(span > 0) || !(count > 0)) return 1;
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  const m = r >= 7.5 ? 10 : r >= 3.5 ? 5 : r >= 1.5 ? 2 : 1;
  return m * mag;
}

export interface NiceTicks {
  min: number;
  max: number;
  step: number;
  ticks: number[];
}

/** Round to the step's precision so 0.1 + 0.2 prints as 0.3. */
function snap(v: number, step: number): number {
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(v.toFixed(Math.min(20, digits)));
}

/**
 * Extend [min, max] to nice boundaries and list the ticks (about `count` intervals; Swift Charts shows ~3–5 y ticks
 * on a phone-sized chart). A zero-width domain is widened so it still renders.
 */
export function niceTicks(min: number, max: number, count = 4): NiceTicks {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, step: 0.25, ticks: [0, 0.25, 0.5, 0.75, 1] };
  if (min > max) [min, max] = [max, min];
  if (min === max) {
    if (min === 0) max = 1;
    else {
      const pad = Math.abs(min) * 0.5;
      if (min > 0) min = 0;
      else max = 0;
      if (min === max) max = min + pad;
    }
  }
  let step = niceStep(max - min, count);
  // A second pass: the extended domain can need a bigger step.
  let lo = Math.floor(min / step) * step;
  let hi = Math.ceil(max / step) * step;
  const step2 = niceStep(hi - lo, count);
  if (step2 > step) {
    step = step2;
    lo = Math.floor(min / step) * step;
    hi = Math.ceil(max / step) * step;
  }
  const ticks: number[] = [];
  const n = Math.round((hi - lo) / step);
  for (let i = 0; i <= n; i++) ticks.push(snap(lo + i * step, step));
  return { min: snap(lo, step), max: snap(hi, step), step, ticks };
}

/** Value extent of a table (finite values only), optionally including zero (bars and areas always do). */
export function extent(values: readonly (readonly number[])[], includeZero: boolean): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const row of values)
    for (const v of row) {
      if (!Number.isFinite(v)) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  if (lo === Infinity) return [0, 1];
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  return [lo, hi];
}

// ---------------------------------------------------------------------------------------------------------------------
// Scales

export interface LinearScale {
  (v: number): number;
  domain: readonly [number, number];
  range: readonly [number, number];
  invert(px: number): number;
}

export function linearScale(domain: readonly [number, number], range: readonly [number, number]): LinearScale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = ((v: number) => (d1 === d0 ? (r0 + r1) / 2 : r0 + (v - d0) * k)) as LinearScale;
  f.domain = domain;
  f.range = range;
  f.invert = (px: number) => (k === 0 ? d0 : d0 + (px - r0) / k);
  return f;
}

export interface BandScale {
  /** Start of band `i`. */
  (i: number): number;
  bandwidth: number;
  step: number;
  count: number;
  /** Centre of band `i`. */
  center(i: number): number;
  /** Nearest band index to a pixel position. */
  index(px: number): number;
}

/**
 * Bands across [r0, r1]. Swift Charts bar defaults: bars fill most of the band with a small gap. // TODO(unknown):
 * Swift Charts not extracted (paddingInner 0.2 / outer 0.1 chosen visually).
 */
export function bandScale(count: number, range: readonly [number, number], paddingInner = 0.2, paddingOuter = 0.1): BandScale {
  const [r0, r1] = range;
  const n = Math.max(1, count);
  const step = (r1 - r0) / Math.max(1, n - paddingInner + paddingOuter * 2);
  const bandwidth = step * (1 - paddingInner);
  const start = r0 + step * paddingOuter;
  const f = ((i: number) => start + i * step) as BandScale;
  f.bandwidth = bandwidth;
  f.step = step;
  f.count = count;
  f.center = (i: number) => start + i * step + bandwidth / 2;
  f.index = (px: number) => clampIndex(Math.floor((px - start + (step - bandwidth) / 2) / step), count);
  return f;
}

/** Evenly spaced points (a categorical line chart): first and last category sit at the range ends (with `inset`). */
export function pointScale(count: number, range: readonly [number, number], inset = 0): (i: number) => number {
  const [r0, r1] = range;
  if (count <= 1) return () => (r0 + r1) / 2;
  const s = (r1 - r0 - inset * 2) / (count - 1);
  return (i: number) => r0 + inset + i * s;
}

function clampIndex(i: number, count: number): number {
  return Math.max(0, Math.min(count - 1, i));
}

/** Index of the position in `xs` nearest to `px` (xs need not be sorted). -1 for an empty list. */
export function nearestIndex(xs: readonly number[], px: number): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const d = Math.abs(xs[i]! - px);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------------
// Stacking

export interface StackCell {
  y0: number;
  y1: number;
}

/**
 * Stack series per category. Positive values stack upwards from 0 and negative values downwards (Swift Charts
 * stacks marks with the same x this way). Missing values (NaN) occupy no height.
 */
export function stack(values: readonly (readonly number[])[]): StackCell[][] {
  const cats = values[0]?.length ?? 0;
  const pos = new Array<number>(cats).fill(0);
  const neg = new Array<number>(cats).fill(0);
  return values.map((row) =>
    row.map((v, c) => {
      if (!Number.isFinite(v) || v === 0) {
        const base = pos[c]!;
        return { y0: base, y1: base };
      }
      if (v > 0) {
        const y0 = pos[c]!;
        pos[c] = y0 + v;
        return { y0, y1: y0 + v };
      }
      const y0 = neg[c]!;
      neg[c] = y0 + v;
      return { y0, y1: y0 + v };
    }),
  );
}

/** [min, max] of a stacked table. */
export function stackExtent(cells: readonly (readonly StackCell[])[]): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const row of cells)
    for (const { y0, y1 } of row) {
      lo = Math.min(lo, y0, y1);
      hi = Math.max(hi, y0, y1);
    }
  return [lo, hi === lo ? lo + 1 : hi];
}

// ---------------------------------------------------------------------------------------------------------------------
// Paths

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const pt = (p: Point) => `${f2(p[0])} ${f2(p[1])}`;

/** Split a point list at NaN y values (gaps in a line). */
export function segments(points: readonly Point[]): Point[][] {
  const out: Point[][] = [];
  let cur: Point[] = [];
  for (const p of points) {
    if (Number.isFinite(p[0]) && Number.isFinite(p[1])) cur.push(p);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Path commands (after an initial M) through `pts` with the given interpolation. */
function curveTo(pts: readonly Point[], interpolation: Interpolation): string {
  if (pts.length < 2) return '';
  if (interpolation === 'linear' || pts.length === 2) return pts.slice(1).map((p) => `L${pt(p)}`).join('');
  if (interpolation === 'monotone') return monotoneTo(pts);
  return catmullRomTo(pts);
}

/**
 * Centripetal Catmull–Rom (α = 0.5), converted to cubic Béziers (the same formulation as d3 `curveCatmullRom`).
 * Swift Charts `.catmullRom` is documented as Catmull–Rom; its α is not public. // TODO(unknown): Swift Charts not extracted
 */
function catmullRomTo(pts: readonly Point[]): string {
  let d = '';
  const a = 0.5;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]!;
    const p1 = pts[i]!;
    const p2 = pts[i + 1]!;
    const p3 = pts[i + 2] ?? p2;
    const d1 = Math.pow(Math.hypot(p1[0] - p0[0], p1[1] - p0[1]), a);
    const d2 = Math.pow(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]), a);
    const d3 = Math.pow(Math.hypot(p3[0] - p2[0], p3[1] - p2[1]), a);
    let c1: Point = p1;
    let c2: Point = p2;
    if (d1 > 1e-6) {
      const A = 2 * d1 * d1 + 3 * d1 * d2 + d2 * d2;
      const n = 3 * d1 * (d1 + d2);
      c1 = [(p2[0] * d1 * d1 - p0[0] * d2 * d2 + p1[0] * A) / n, (p2[1] * d1 * d1 - p0[1] * d2 * d2 + p1[1] * A) / n];
    } else c1 = [p1[0] + (p2[0] - p1[0]) / 3, p1[1] + (p2[1] - p1[1]) / 3];
    if (d3 > 1e-6) {
      const B = 2 * d3 * d3 + 3 * d3 * d2 + d2 * d2;
      const m = 3 * d3 * (d3 + d2);
      c2 = [(p1[0] * d3 * d3 - p3[0] * d2 * d2 + p2[0] * B) / m, (p1[1] * d3 * d3 - p3[1] * d2 * d2 + p2[1] * B) / m];
    } else c2 = [p2[0] - (p2[0] - p1[0]) / 3, p2[1] - (p2[1] - p1[1]) / 3];
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

/** Monotone cubic in x (Fritsch–Carlson / Steffen as d3 `curveMonotoneX`): never overshoots the data. */
function monotoneTo(pts: readonly Point[]): string {
  const n = pts.length;
  const slopes: number[] = new Array(n).fill(0);
  const sec: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1]![0] - pts[i]![0];
    sec.push(h === 0 ? 0 : (pts[i + 1]![1] - pts[i]![1]) / h);
  }
  for (let i = 1; i < n - 1; i++) {
    const h0 = pts[i]![0] - pts[i - 1]![0];
    const h1 = pts[i + 1]![0] - pts[i]![0];
    const s0 = sec[i - 1]!;
    const s1 = sec[i]!;
    if (s0 * s1 <= 0) slopes[i] = 0;
    else {
      const p = (s0 * h1 + s1 * h0) / (h0 + h1);
      slopes[i] = (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(p));
    }
  }
  // End slopes: one-sided (d3 slope2).
  const end = (h: number, s: number, t: number) => (h ? (3 * s - t) / 2 : t);
  slopes[0] = end(pts[1]![0] - pts[0]![0], sec[0]!, slopes[1]!);
  slopes[n - 1] = end(pts[n - 1]![0] - pts[n - 2]![0], sec[n - 2]!, slopes[n - 2]!);
  if (n === 2) {
    slopes[0] = sec[0]!;
    slopes[1] = sec[0]!;
  }
  let d = '';
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i]!;
    const p1 = pts[i + 1]!;
    const dx = (p1[0] - p0[0]) / 3;
    d += `C${pt([p0[0] + dx, p0[1] + dx * slopes[i]!])} ${pt([p1[0] - dx, p1[1] - dx * slopes[i + 1]!])} ${pt(p1)}`;
  }
  return d;
}

/** SVG path for a line through `points`; NaN points break the line into segments. */
export function linePath(points: readonly Point[], interpolation: Interpolation = 'linear'): string {
  return segments(points)
    .map((seg) => `M${pt(seg[0]!)}${curveTo(seg, interpolation)}`)
    .join('');
}

/**
 * Closed area between `top` and `bottom` (same length, same x). The bottom edge is traced backwards with the same
 * interpolation, so stacked areas share their boundary exactly.
 */
export function areaPath(top: readonly Point[], bottom: readonly Point[], interpolation: Interpolation = 'linear'): string {
  const out: string[] = [];
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const t = top.slice(start, end);
    const b = bottom.slice(start, end).reverse();
    if (t.length) out.push(`M${pt(t[0]!)}${curveTo(t, interpolation)}L${pt(b[0]!)}${curveTo(b, interpolation)}Z`);
    start = -1;
  };
  for (let i = 0; i < top.length; i++) {
    const ok = Number.isFinite(top[i]![1]) && Number.isFinite(bottom[i]?.[1] ?? NaN);
    if (ok && start < 0) start = i;
    if (!ok) flush(i);
  }
  flush(top.length);
  return out.join('');
}

/** Rectangle path with optional top corner rounding (only the end away from the baseline is rounded). */
export function barPath(
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  orientation: 'vertical' | 'horizontal',
  negative: boolean,
): string {
  if (w <= 0 || h <= 0) return '';
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r === 0) return `M${f2(x)} ${f2(y)}h${f2(w)}v${f2(h)}h${f2(-w)}Z`;
  const R = f2(r);
  if (orientation === 'vertical') {
    if (!negative)
      return `M${f2(x)} ${f2(y + h)}V${f2(y + r)}A${R} ${R} 0 0 1 ${f2(x + r)} ${f2(y)}H${f2(x + w - r)}A${R} ${R} 0 0 1 ${f2(x + w)} ${f2(y + r)}V${f2(y + h)}Z`;
    return `M${f2(x)} ${f2(y)}V${f2(y + h - r)}A${R} ${R} 0 0 0 ${f2(x + r)} ${f2(y + h)}H${f2(x + w - r)}A${R} ${R} 0 0 0 ${f2(x + w)} ${f2(y + h - r)}V${f2(y)}Z`;
  }
  if (!negative)
    return `M${f2(x)} ${f2(y)}H${f2(x + w - r)}A${R} ${R} 0 0 1 ${f2(x + w)} ${f2(y + r)}V${f2(y + h - r)}A${R} ${R} 0 0 1 ${f2(x + w - r)} ${f2(y + h)}H${f2(x)}Z`;
  return `M${f2(x + w)} ${f2(y)}H${f2(x + r)}A${R} ${R} 0 0 0 ${f2(x)} ${f2(y + r)}V${f2(y + h - r)}A${R} ${R} 0 0 0 ${f2(x + r)} ${f2(y + h)}H${f2(x + w)}Z`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Pie / donut (SectorMark)

export interface Sector {
  index: number;
  value: number;
  /** Radians, clockwise from 12 o'clock. */
  start: number;
  end: number;
}

/** Sector angles in data order, clockwise from 12 o'clock (SectorMark order). Non-positive values get no sector. */
export function pieAngles(values: readonly number[]): Sector[] {
  const total = values.reduce((s, v) => s + (Number.isFinite(v) && v > 0 ? v : 0), 0);
  let a = 0;
  return values.map((v, index) => {
    const value = Number.isFinite(v) && v > 0 ? v : 0;
    const span = total > 0 ? (value / total) * Math.PI * 2 : 0;
    const s = { index, value, start: a, end: a + span };
    a += span;
    return s;
  });
}

function polar(cx: number, cy: number, r: number, a: number): Point {
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/**
 * Annular sector path. `inset` (pt, SectorMark `angularInset`) is applied as a constant-width gap on each side, so
 * the gap edges stay parallel (each radius gets its own angular offset asin(inset / r)).
 */
export function sectorPath(cx: number, cy: number, inner: number, outer: number, start: number, end: number, inset = 0): string {
  if (end - start <= 0 || outer <= 0) return '';
  const full = end - start >= Math.PI * 2 - 1e-9 && inset === 0;
  if (full) {
    const o = f2(outer);
    let d = `M${pt(polar(cx, cy, outer, 0))}A${o} ${o} 0 1 1 ${pt(polar(cx, cy, outer, Math.PI))}A${o} ${o} 0 1 1 ${pt(polar(cx, cy, outer, 0))}Z`;
    if (inner > 0) {
      const i = f2(inner);
      d += `M${pt(polar(cx, cy, inner, 0))}A${i} ${i} 0 1 0 ${pt(polar(cx, cy, inner, Math.PI))}A${i} ${i} 0 1 0 ${pt(polar(cx, cy, inner, 0))}Z`;
    }
    return d;
  }
  const off = (r: number) => (r > 0 && inset > 0 ? Math.asin(Math.min(1, inset / 2 / r)) : 0);
  const oo = off(outer);
  const os = start + oo;
  const oe = end - oo;
  if (oe <= os) return '';
  const large = (a: number) => (a > Math.PI ? 1 : 0);
  const o = f2(outer);
  let d = `M${pt(polar(cx, cy, outer, os))}A${o} ${o} 0 ${large(oe - os)} 1 ${pt(polar(cx, cy, outer, oe))}`;
  const io = off(inner);
  if (inner > 0 && end - start - 2 * io > 0) {
    const i = f2(inner);
    d += `L${pt(polar(cx, cy, inner, end - io))}A${i} ${i} 0 ${large(end - start - 2 * io)} 0 ${pt(polar(cx, cy, inner, start + io))}Z`;
  } else {
    // The gap edges meet before the centre: end at the point where they intersect.
    const mid = (start + end) / 2;
    const half = (end - start) / 2;
    const apex = inset > 0 && half > 0 ? inset / 2 / Math.sin(half) : 0;
    d += `L${pt(polar(cx, cy, apex, mid))}Z`;
  }
  return d;
}

// ---------------------------------------------------------------------------------------------------------------------
// Formatting

export interface FormatOptions {
  /** ISO currency code for `currency` (default USD). */
  currency?: string;
  /** BCP 47 locale (default: the runtime's). */
  locale?: string;
  /** Maximum fraction digits (default: 2 for number/currency, 1 for compact/percent). */
  maximumFractionDigits?: number;
}

const fmtCache = new Map<string, Intl.NumberFormat>();

function getFormatter(format: AxisFormat, o: FormatOptions): Intl.NumberFormat {
  const key = `${format}|${o.currency ?? ''}|${o.locale ?? ''}|${o.maximumFractionDigits ?? ''}`;
  let f = fmtCache.get(key);
  if (!f) {
    const opts: Intl.NumberFormatOptions =
      format === 'percent'
        ? { style: 'percent', maximumFractionDigits: o.maximumFractionDigits ?? 1 }
        : format === 'currency'
          ? { style: 'currency', currency: o.currency ?? 'USD', maximumFractionDigits: o.maximumFractionDigits ?? 2, minimumFractionDigits: 0 }
          : format === 'compact'
            ? { notation: 'compact', maximumFractionDigits: o.maximumFractionDigits ?? 1 }
            : { maximumFractionDigits: o.maximumFractionDigits ?? 2 };
    f = new Intl.NumberFormat(o.locale, opts);
    fmtCache.set(key, f);
  }
  return f;
}

/**
 * Format a value. `percent` takes fractions (0.25 → 25%), like `.formatted(.percent)` on a fraction; `compact`
 * abbreviates (12 300 → 12.3K).
 */
export function formatValue(v: number, format: AxisFormat = 'number', o: FormatOptions = {}): string {
  if (!Number.isFinite(v)) return '–';
  // Avoid "-0".
  const n = Object.is(v, -0) || Math.abs(v) < 1e-12 ? 0 : v;
  return getFormatter(format, o).format(n);
}

// ---------------------------------------------------------------------------------------------------------------------
// Accessibility

/** One-sentence summary for `aria-label` (Swift Charts builds an Audio Graph summary; this is the text analogue). */
export function summarize(kind: string, table: SeriesTable, format: AxisFormat = 'number', o: FormatOptions = {}): string {
  const n = table.categories.length;
  if (n === 0) return `${kind}, no data`;
  const parts: string[] = [];
  table.series.forEach((name, s) => {
    const row = table.values[s]!;
    let lo = Infinity;
    let hi = -Infinity;
    let loI = 0;
    let hiI = 0;
    row.forEach((v, i) => {
      if (!Number.isFinite(v)) return;
      if (v < lo) {
        lo = v;
        loI = i;
      }
      if (v > hi) {
        hi = v;
        hiI = i;
      }
    });
    if (lo === Infinity) return;
    const label = name ? `${name}: ` : '';
    parts.push(
      `${label}minimum ${formatValue(lo, format, o)} at ${table.categories[loI]}, maximum ${formatValue(hi, format, o)} at ${table.categories[hiI]}`,
    );
  });
  const range = n > 1 ? `from ${table.categories[0]} to ${table.categories[n - 1]}` : `for ${table.categories[0]}`;
  const sc = table.series.length > 1 ? `, ${table.series.length} series` : '';
  return `${kind}, ${n} ${n === 1 ? 'point' : 'points'} ${range}${sc}. ${parts.join('; ')}.`;
}

/** Interpolate two equally-shaped numeric tables (animation tween). Missing (NaN) entries snap to the target. */
export function lerpTable(from: readonly (readonly number[])[] | null, to: readonly (readonly number[])[], t: number): number[][] {
  return to.map((row, s) =>
    row.map((v, c) => {
      const a = from?.[s]?.[c];
      if (a === undefined || !Number.isFinite(a) || !Number.isFinite(v)) return v;
      return a + (v - a) * t;
    }),
  );
}
