/**
 * Metric (KPI tile) and Sparkline.
 *
 * Metric: label in footnote / secondaryLabel, value large in the rounded face with monospaced digits, a delta with an
 * arrow in systemGreen / systemRed, optional sparkline and icon. Not a UIKit/SwiftUI component (Health / Stocks
 * summary tiles were the visual reference). // TODO(unknown): Swift Charts not extracted, tile metrics are design choices
 */
import { useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { areaPath, extent, formatValue, linePath, linearScale, toNumber, type AxisFormat, type Datum, type Interpolation, type Point } from './scale';
import { footnote, resolveColor, roundedFont, tokenVar, useTweenedTable, useWidth } from './shared';

export interface SparklineProps {
  /** Numbers, or rows with a `y` key. */
  data: number[] | Datum[];
  /** Value key when `data` holds rows (default 'value'). */
  y?: string;
  /** Height, pt (default 32). Width fills the container unless `width` is set. */
  height?: number;
  width?: number;
  /** CSS colour or system colour name. Default systemBlue. */
  color?: string;
  /** Default 'monotone'. */
  interpolation?: Interpolation;
  lineWidth?: number;
  /** Gradient fill under the line. Default false. */
  fill?: boolean;
  /** Dot at the last value. Default false. */
  showEndPoint?: boolean;
  /** Accessible label; without it the sparkline is decorative (aria-hidden). */
  'aria-label'?: string;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Sparkline(p: SparklineProps) {
  const { data, y = 'value', height = 32, color = 'systemBlue', interpolation = 'monotone', lineWidth = 2, fill = false, showEndPoint = false, animate = true } = p;
  const gid = useId();
  const [ref, measured] = useWidth<HTMLDivElement>(p.width ?? 100);
  const w = p.width ?? measured;
  const raw = useMemo(() => (data as unknown[]).map((d) => (typeof d === 'number' ? d : toNumber((d as Datum)[y]))), [data, y]);
  const keys = useMemo(() => [raw.map((_, i) => String(i))], [raw.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const vals = useTweenedTable(keys, [raw], animate)[0] ?? raw;
  const [lo, hi] = extent([raw], false);
  const pad = lineWidth / 2 + (showEndPoint ? 2 : 0);
  const sy = linearScale(lo === hi ? [lo - 1, hi + 1] : [lo, hi], [height - pad, pad]);
  const sx = linearScale([0, Math.max(1, raw.length - 1)], [pad, w - pad]);
  const pts: Point[] = vals.map((v, i) => [sx(i), Number.isFinite(v) ? sy(v) : NaN]);
  const c = resolveColor(color);
  const last = [...pts].reverse().find((q) => Number.isFinite(q[1]));
  const label = p['aria-label'];
  return (
    <div ref={ref} className={p.className} style={{ width: p.width ?? '100%', height, ...p.style }} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
        {fill && (
          <>
            <defs>
              <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={c} stopOpacity={0.3} />
                <stop offset="1" stopColor={c} stopOpacity={0} />
              </linearGradient>
            </defs>
            <path d={areaPath(pts, pts.map(([px]) => [px, height] as Point), interpolation)} fill={`url(#${CSS.escape(gid)})`} />
          </>
        )}
        <path d={linePath(pts, interpolation)} fill="none" stroke={c} strokeWidth={lineWidth} strokeLinecap="round" strokeLinejoin="round" />
        {showEndPoint && last && <circle cx={last[0]} cy={last[1]} r={lineWidth + 1} fill={c} />}
      </svg>
    </div>
  );
}

export interface MetricProps {
  label: string;
  value: number | string;
  /** Format for a numeric `value` (default 'number'). */
  format?: AxisFormat;
  currency?: string;
  /** Change since the previous period, in `deltaFormat` units (default 'percent': 0.12 → +12%). */
  delta?: number;
  deltaFormat?: AxisFormat;
  /** Text after the delta (e.g. "vs last week"). */
  deltaLabel?: string;
  /** A decrease is good (costs, latency): swaps green/red. */
  invertDelta?: boolean;
  /** Sparkline values (numbers or rows with `sparklineKey`). */
  sparkline?: number[] | Datum[];
  sparklineKey?: string;
  /** Sparkline / icon tint (CSS colour or system colour name). Default: follows the delta colour, else systemBlue. */
  tint?: string;
  icon?: ReactNode;
  /** 'regular' (28 pt value) or 'large' (34 pt). */
  size?: 'regular' | 'large';
  /** Card background (secondarySystemGroupedBackground, radius 26). Default true. */
  card?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Metric(p: MetricProps) {
  const { label, value, format = 'number', currency, delta, deltaFormat = 'percent', deltaLabel, invertDelta, sparkline, sparklineKey, icon, size = 'regular', card = true } = p;
  const text = typeof value === 'number' ? formatValue(value, format, { currency }) : value;
  const dir = delta === undefined || !Number.isFinite(delta) || delta === 0 ? 0 : delta > 0 ? 1 : -1;
  const good = invertDelta ? dir < 0 : dir > 0;
  const deltaColor = dir === 0 ? tokenVar('secondaryLabel') : good ? tokenVar('systemGreen') : tokenVar('systemRed');
  const tint = p.tint ? resolveColor(p.tint) : dir !== 0 ? deltaColor : tokenVar('systemBlue');
  const deltaText = delta === undefined ? '' : (dir > 0 ? '+' : '') + formatValue(delta, deltaFormat, { currency });
  const aria = `${label}: ${text}${delta !== undefined ? `, ${dir > 0 ? 'up' : dir < 0 ? 'down' : 'unchanged'} ${formatValue(Math.abs(delta), deltaFormat, { currency })}${deltaLabel ? ' ' + deltaLabel : ''}` : ''}`;
  return (
    <div
      role="group"
      aria-label={aria}
      className={p.className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: card ? 16 : 0,
        borderRadius: card ? 26 : 0,
        background: card ? tokenVar('secondarySystemGroupedBackground') : undefined,
        color: tokenVar('label'),
        minWidth: 0,
        ...p.style,
      }}
    >
      <div aria-hidden style={{ display: 'flex', alignItems: 'center', gap: 6, ...footnote, color: tokenVar('secondaryLabel') }}>
        {icon && <span style={{ display: 'inline-flex', color: tint, flex: 'none' }}>{icon}</span>}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      </div>
      <div aria-hidden style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '4px 12px', justifyContent: 'space-between' }}>
        {/* The value keeps its width (up to the tile's); a sparkline that no longer fits beside it wraps below. */}
        <div style={{ minWidth: 0, flexShrink: 0, maxWidth: '100%' }}>
          <div
            style={{
              fontFamily: roundedFont,
              fontSize: size === 'large' ? 34 : 28,
              lineHeight: size === 'large' ? '40.574px' : '33.414px',
              fontWeight: 700,
              fontVariantNumeric: 'tabular-nums',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {text}
          </div>
          {delta !== undefined && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 3, ...footnote, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: deltaColor, whiteSpace: 'nowrap' }}>
              {dir !== 0 && <Arrow up={dir > 0} />}
              {deltaText}
              {deltaLabel && <span style={{ fontWeight: 400, color: tokenVar('secondaryLabel') }}>{deltaLabel}</span>}
            </div>
          )}
        </div>
        {sparkline && sparkline.length > 1 && (
          <Sparkline data={sparkline} y={sparklineKey} color={p.tint ?? (dir === 0 ? 'systemBlue' : good ? 'systemGreen' : 'systemRed')} height={36} fill style={{ flex: '1 0 48px', maxWidth: 120, marginLeft: 'auto' }} />
        )}
      </div>
    </div>
  );
}

/** arrow.up / arrow.down-like glyph (SF Symbols not available as data). */
function Arrow({ up }: { up: boolean }) {
  return (
    <svg width={9} height={11} viewBox="0 0 9 11" aria-hidden style={{ transform: up ? undefined : 'rotate(180deg)', flex: 'none' }}>
      <path d="M4.5 10V1.4M1 4.8 4.5 1.3 8 4.8" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
