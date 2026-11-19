/**
 * Shared chart plumbing: palette, sizing, the data-change tween, scrub interaction, legend, annotation, the hidden
 * data table and the axis types.
 *
 * Swift Charts is not in the uikit-internals extraction; every visual default here emulates Swift Charts' documented
 * look (system colour cycle, light gridlines, caption-sized secondary axis labels, trailing y axis, bottom-leading
 * legend). // TODO(unknown): Swift Charts not extracted
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { colors as tokenColors } from '@liquid-gpu/core';
import { cssVarName, useLiquidOptional, createSpring, type SpringHandle } from '../root';
import { formatValue, type AxisFormat, type Datum } from './scale';

// ---------------------------------------------------------------------------------------------------------------------
// Types shared by every chart

export interface ChartAxis {
  hidden?: boolean;
  format?: AxisFormat;
  /** ISO currency for `format: 'currency'` (default USD). */
  currency?: string;
  /** Approximate number of tick intervals (default 4 for y, automatic for x). */
  ticks?: number;
  /** Fixed value domain [min, max] (value axis only). */
  domain?: [number, number];
  /** Include zero in the automatic domain (value axis; bars and areas always do). Default true (Swift Charts). */
  includeZero?: boolean;
  /** Gridlines (default: on for the value axis). */
  grid?: boolean;
  /** Axis title, shown small next to the axis. */
  label?: string;
}

/** RuleMark threshold line on the value axis. */
export interface ChartRule {
  value: number;
  label?: string;
  /** CSS colour or system colour name ('red', 'systemRed'). Default secondaryLabel. */
  color?: string;
  /** Default true. */
  dashed?: boolean;
}

export interface ChartBaseProps {
  data: Datum[];
  /** Category / x key. */
  x: string;
  /** Value / y key. */
  y: string;
  /** Series key: rows with the same value form one series (Swift Charts `foregroundStyle(by:)`). */
  series?: string;
  /** Height of the plot including axis labels, pt (legend extra). Default 200. */
  height?: number;
  /** Series colours in order: CSS colours or system colour names ('blue', 'systemGreen'). */
  colors?: string[];
  /** Default: true when there is more than one series. */
  showLegend?: boolean;
  xAxis?: ChartAxis;
  yAxis?: ChartAxis;
  rule?: ChartRule | ChartRule[];
  /** Accessible title (prefixed to the generated summary). */
  title?: string;
  /** chartXSelection-like scrubbing (default true). */
  selectable?: boolean;
  /** Controlled selection (an x value as string). */
  selection?: string | null;
  onSelectionChange?: (x: string | null) => void;
  /** Animate value changes (default true). */
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

// ---------------------------------------------------------------------------------------------------------------------
// Colour

/** Swift Charts default categorical cycle. // TODO(unknown): Swift Charts not extracted (order from its documented palette) */
export const chartPalette = [
  'systemBlue',
  'systemGreen',
  'systemOrange',
  'systemPurple',
  'systemRed',
  'systemCyan',
  'systemYellow',
  'systemIndigo',
  'systemPink',
  'systemTeal',
  'systemBrown',
  'systemMint',
] as const;

/** A token as `var(--lq-x, <light value>)` so charts also render outside a LiquidRoot. */
export function tokenVar(token: string): string {
  const fb = tokenColors.light[token];
  return fb ? `var(${cssVarName(token)}, ${fb})` : `var(${cssVarName(token)})`;
}

/** Resolve a user colour: token names ('systemBlue'), short names ('blue', 'gray'), or any CSS colour. */
export function resolveColor(c: string): string {
  if (tokenColors.light[c]) return tokenVar(c);
  const sys = 'system' + c.charAt(0).toUpperCase() + c.slice(1);
  if (/^[a-z]+\d?$/.test(c) && tokenColors.light[sys]) return tokenVar(sys);
  return c;
}

export function seriesColor(i: number, colors?: readonly string[]): string {
  const c = colors?.[i];
  if (c) return resolveColor(c);
  return tokenVar(chartPalette[i % chartPalette.length]!);
}

// ---------------------------------------------------------------------------------------------------------------------
// Sizing

/** Element width via ResizeObserver (responsive charts). */
export function useWidth<T extends HTMLElement>(initial = 320): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = (v: number) => setW((p) => (Math.abs(p - v) < 0.5 || v <= 0 ? p : v));
    set(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => set(entries[0]!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// ---------------------------------------------------------------------------------------------------------------------
// Data-change tween: a 0→1 progress driven by the root spring (SwiftUI `.smooth`), or a short eased rAF outside a root.

/**
 * Returns the values to draw. When `values` change, each cell animates from what was on screen; `keys[s][c]` names a
 * cell across renders (series + category). New cells start at `enter` (0 grows bars; NaN snaps).
 */
export function useTweenedTable(keys: string[][], values: number[][], animate: boolean, enter: 0 | 'target' = 'target'): number[][] {
  const ctx = useLiquidOptional();
  const [t, setT] = useState(1);
  const shown = useRef(new Map<string, number>());
  const from = useRef<Map<string, number> | null>(null);
  const sig = JSON.stringify(values) + JSON.stringify(keys);
  const lastSig = useRef<string | null>(null);
  const spring = useRef<SpringHandle | null>(null);
  const raf = useRef(0);
  const reduced = ctx?.reducedMotion ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);

  useLayoutEffect(() => {
    if (lastSig.current === null) {
      lastSig.current = sig;
      return;
    }
    if (lastSig.current === sig) return;
    lastSig.current = sig;
    if (!animate || reduced) {
      from.current = null;
      setT(1);
      return;
    }
    from.current = new Map(shown.current);
    if (ctx) {
      if (!spring.current) {
        spring.current = createSpring(ctx, 1, 'smooth');
        spring.current.subscribe((v) => setT(Math.min(1.5, Math.max(0, v))));
      }
      spring.current.snap(0);
      spring.current.set(1);
    } else if (typeof requestAnimationFrame !== 'undefined') {
      cancelAnimationFrame(raf.current);
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / 400);
        setT(1 - Math.pow(1 - p, 3));
        if (p < 1) raf.current = requestAnimationFrame(step);
      };
      setT(0);
      raf.current = requestAnimationFrame(step);
    }
  }, [sig, animate, reduced, ctx]);

  useEffect(
    () => () => {
      spring.current?.dispose();
      spring.current = null;
      cancelAnimationFrame(raf.current);
    },
    [],
  );

  const f = from.current;
  const out = values.map((row, s) =>
    row.map((v, c) => {
      if (!f || t >= 1 || !Number.isFinite(v)) return v;
      const k = keys[s]?.[c] ?? '';
      const a = f.has(k) ? f.get(k)! : enter === 0 ? 0 : v;
      return Number.isFinite(a) ? a + (v - a) * t : v;
    }),
  );
  const m = new Map<string, number>();
  out.forEach((row, s) => row.forEach((v, c) => m.set(keys[s]?.[c] ?? '', v)));
  shown.current = m;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Scrub interaction (chartXSelection-like)

/** 10 pt slop like the Slider (CT §3.2). */
const SLOP = 10;

export interface ScrubOptions {
  /** Map an overlay-local position (along the scrub axis) to an index, or -1. */
  pick: (local: { x: number; y: number }) => number;
  onSelect: (i: number | null) => void;
  enabled: boolean;
  /** 'x' (vertical rule) or 'y' (horizontal bars). Decides which drag direction claims the touch. */
  axis?: 'x' | 'y';
}

/**
 * Pointer handling on an overlay element. Mouse: hover selects, leaving clears. Touch / pen: a drag along the scrub
 * axis claims the pointer through the root gesture arena (a cross-axis drag fails, so a surrounding ScrollView keeps
 * scrolling); a tap selects, a tap on the same point clears. Outside a LiquidRoot, pointer capture is used.
 *
 * Positions come from `offsetX/Y` on the overlay plus arena deltas: in webgpu mode layer boxes sit at the canvas
 * origin, so client rects cannot be compared with client coordinates (root/README.md → Layers).
 */
export function useScrub(overlay: React.RefObject<HTMLElement | null>, opts: ScrubOptions): void {
  const ctx = useLiquidOptional();
  const o = useRef(opts);
  o.current = opts;
  useEffect(() => {
    const el = overlay.current;
    if (!el || !opts.enabled) return;
    const axis = opts.axis ?? 'x';
    const sel = (x: number, y: number) => {
      const i = o.current.pick({ x, y });
      o.current.onSelect(i < 0 ? null : i);
    };
    let dragging = false;
    const onHover = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && !dragging) return;
      if (e.pointerType === 'mouse' || !ctx) sel(e.offsetX, e.offsetY);
    };
    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') o.current.onSelect(null);
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        e.stopPropagation(); // a mouse press on a chart never drags the scroll view
        sel(e.offsetX, e.offsetY);
        return;
      }
      const x0 = e.offsetX;
      const y0 = e.offsetY;
      if (!ctx) {
        dragging = true;
        el.setPointerCapture?.(e.pointerId);
        sel(x0, y0);
        return;
      }
      ctx.gestures.track(e, {
        decide: ({ dx, dy }) => {
          const along = axis === 'x' ? dx : dy;
          const across = axis === 'x' ? dy : dx;
          if (Math.abs(across) > SLOP && Math.abs(across) > Math.abs(along)) return 'fail';
          return Math.abs(along) > SLOP ? 'claim' : 'wait';
        },
        onMove: ({ dx, dy }) => sel(x0 + dx, y0 + dy),
        onEnd: () => o.current.onSelect(null),
        onTap: () => sel(x0, y0),
      });
    };
    const onUp = () => {
      if (dragging) {
        dragging = false;
        o.current.onSelect(null);
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onHover);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onHover);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [overlay, opts.enabled, opts.axis, ctx]);
}

/** Controlled/uncontrolled selection index keyed by category string. */
export function useSelection(categories: string[], selection: string | null | undefined, onChange?: (x: string | null) => void) {
  const [inner, setInner] = useState<string | null>(null);
  const cur = selection !== undefined ? selection : inner;
  const index = cur === null ? -1 : categories.indexOf(cur);
  const set = (i: number | null) => {
    const v = i === null || i < 0 ? null : (categories[i] ?? null);
    if (v === cur) return;
    if (selection === undefined) setInner(v);
    onChange?.(v);
  };
  return [index, set] as const;
}

/** Arrow keys / Home / End / Escape move the selection (`count` positions). */
export function keyNav(e: React.KeyboardEvent, index: number, count: number, set: (i: number | null) => void, vertical = false): void {
  const next = vertical ? ['ArrowDown', 'ArrowRight'] : ['ArrowRight', 'ArrowUp'];
  const prev = vertical ? ['ArrowUp', 'ArrowLeft'] : ['ArrowLeft', 'ArrowDown'];
  let i: number | null | undefined;
  if (next.includes(e.key)) i = index < 0 ? 0 : Math.min(count - 1, index + 1);
  else if (prev.includes(e.key)) i = index < 0 ? count - 1 : Math.max(0, index - 1);
  else if (e.key === 'Home') i = 0;
  else if (e.key === 'End') i = count - 1;
  else if (e.key === 'Escape') i = null;
  if (i === undefined || count === 0) return;
  e.preventDefault();
  set(i);
}

// ---------------------------------------------------------------------------------------------------------------------
// Pieces

export const visuallyHidden: CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

/** caption2 / footnote metrics from core textStyles. */
export const caption2: CSSProperties = { fontSize: 11, lineHeight: '13.127px', letterSpacing: 0.064 };
export const footnote: CSSProperties = { fontSize: 13, lineHeight: '15.514px', letterSpacing: -0.076 };
export const roundedFont = 'ui-rounded, "SF Pro Rounded", var(--lq-font, system-ui), system-ui, sans-serif';

export interface LegendItem {
  name: string;
  color: string;
}

/** Bottom-leading legend: a small circle + series name (Swift Charts default). // TODO(unknown): Swift Charts not extracted */
export function Legend({ items }: { items: LegendItem[] }) {
  return (
    <div aria-hidden style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8, ...caption2, fontSize: 12, color: tokenVar('secondaryLabel') }}>
      {items.map((it) => (
        <span key={it.name} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: it.color, flex: 'none' }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}

export interface AnnotationRow {
  name: string;
  color: string;
  value: string;
}

/**
 * Selection annotation: a rounded box clamped inside the chart, centred on `at` along x, at the top of the plot.
 * Styled like Apple's chartXSelection samples (tertiary fill box, caption title, rounded values).
 * // TODO(unknown): Swift Charts not extracted
 */
export function Annotation({ at, width, title, rows, top = 0 }: { at: number; width: number; title: string; rows: AnnotationRow[]; top?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [bw, setBw] = useState(0);
  useLayoutEffect(() => {
    if (ref.current) setBw(ref.current.offsetWidth);
  });
  const left = Math.max(0, Math.min(width - bw, at - bw / 2));
  return (
    <div
      ref={ref}
      aria-hidden
      style={{
        position: 'absolute',
        top,
        left,
        pointerEvents: 'none',
        padding: '6px 10px',
        borderRadius: 10,
        background: tokenVar('secondarySystemBackground'),
        boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
        whiteSpace: 'nowrap',
        zIndex: 1,
      }}
    >
      <div style={{ ...caption2, fontSize: 12, color: tokenVar('secondaryLabel') }}>{title}</div>
      {rows.map((r) => (
        <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: roundedFont, fontSize: 17, fontWeight: 600, lineHeight: '21px', fontVariantNumeric: 'tabular-nums', color: tokenVar('label') }}>
          {rows.length > 1 && <span style={{ width: 8, height: 8, borderRadius: 4, background: r.color }} />}
          {r.value}
          {rows.length > 1 && <span style={{ ...footnote, fontWeight: 400, color: tokenVar('secondaryLabel'), fontFamily: 'inherit' }}>{r.name}</span>}
        </div>
      ))}
    </div>
  );
}

/** The accessible data table (`aria-describedby` target), visually hidden. */
export function DataTable({ id, caption, xLabel, series, categories, values, format, currency }: {
  id: string;
  caption: string;
  xLabel: string;
  series: string[];
  categories: string[];
  values: number[][];
  format: AxisFormat;
  currency?: string;
}) {
  return (
    <table id={id} style={visuallyHidden}>
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">{xLabel}</th>
          {series.map((s) => (
            <th key={s} scope="col">{s || 'Value'}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {categories.map((c, ci) => (
          <tr key={c}>
            <th scope="row">{c}</th>
            {series.map((s, si) => (
              <td key={s}>{formatValue(values[si]![ci]!, format, { currency })}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function LiveRegion({ text }: { text: string }) {
  return (
    <div aria-live="polite" style={visuallyHidden}>
      {text}
    </div>
  );
}

export function rulesOf(rule: ChartRule | ChartRule[] | undefined): ChartRule[] {
  return rule ? (Array.isArray(rule) ? rule : [rule]) : [];
}

/** Approximate caption2 label width (tabular digits ≈ 0.6 em) — avoids DOM measurement. */
export function labelWidth(s: string, size = 11): number {
  return s.length * size * 0.6;
}

export type { ReactNode };
