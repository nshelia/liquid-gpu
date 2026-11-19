/**
 * PieChart / donut: Swift Charts SectorMark emulation (clockwise from 12 o'clock in data order, `innerRadius` as a
 * ratio, `angularInset` in pt). Selection (chartAngleSelection-like): hover / tap / arrow keys pick a sector; the
 * others dim. // TODO(unknown): Swift Charts not extracted (dim opacity, legend layout are design choices)
 */
import { useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { extractSeries, formatValue, pieAngles, sectorPath, summarize, type AxisFormat, type Datum } from './scale';
import { DataTable, Legend, LiveRegion, keyNav, roundedFont, seriesColor, tokenVar, useScrub, useTweenedTable, useWidth, caption2 } from './shared';

export interface PieChartProps {
  data: Datum[];
  /** Category (sector name) key. */
  x: string;
  /** Value key (SectorMark `angle`). */
  y: string;
  /** Diameter, pt (default 200; shrinks to the available width). */
  height?: number;
  /** Inner radius as a fraction of the outer radius (0 = pie, 0.6 ≈ Swift Charts donut samples). Default 0. */
  innerRadius?: number;
  /** Gap between sectors, pt (SectorMark `angularInset`). Default 1 for donuts, 0 for pies. */
  angularInset?: number;
  colors?: string[];
  /** Default true. */
  showLegend?: boolean;
  format?: AxisFormat;
  currency?: string;
  /** Donut centre: 'total', 'selection' (the selected value, else the total; default for donuts) or 'none'. */
  center?: 'total' | 'selection' | 'none';
  /** Small caption under the centre value (e.g. "Total"). */
  centerLabel?: string;
  title?: string;
  selectable?: boolean;
  selection?: string | null;
  onSelectionChange?: (x: string | null) => void;
  animate?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function PieChart(p: PieChartProps) {
  const {
    data,
    x,
    y,
    height = 200,
    innerRadius = 0,
    colors,
    showLegend = true,
    format = 'number',
    currency,
    title,
    selectable = true,
    animate = true,
    className,
    style,
  } = p;
  const inset = p.angularInset ?? (innerRadius > 0 ? 1 : 0);
  const id = useId();
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const overlayRef = useRef<HTMLDivElement>(null);
  const table = useMemo(() => extractSeries(data, x, y), [data, x, y]);
  const cats = table.categories;
  const raw = table.values[0] ?? [];
  const keys = useMemo(() => [cats], [cats]);
  const shown = useTweenedTable(keys, [raw], animate, 0)[0] ?? [];
  const sectors = pieAngles(shown);
  const total = raw.reduce((s, v) => s + (Number.isFinite(v) && v > 0 ? v : 0), 0);

  const [inner, setInner] = useState<string | null>(null);
  const cur = p.selection !== undefined ? p.selection : inner;
  const sel = cur === null ? -1 : cats.indexOf(cur);
  const setSel = (i: number | null) => {
    const v = i === null || i < 0 ? null : (cats[i] ?? null);
    if (v === cur) return;
    if (p.selection === undefined) setInner(v);
    p.onSelectionChange?.(v);
  };

  const size = Math.max(40, Math.min(height, width));
  const c = size / 2;
  const outer = c - 2;
  const r0 = Math.max(0, Math.min(0.95, innerRadius)) * outer;

  useScrub(overlayRef, {
    enabled: selectable && cats.length > 0,
    pick: ({ x: lx, y: ly }) => {
      const dx = lx - c;
      const dy = ly - c;
      const r = Math.hypot(dx, dy);
      if (r > outer + 4 || r < r0 - 4) return -1;
      let a = Math.atan2(dx, -dy);
      if (a < 0) a += Math.PI * 2;
      return sectors.findIndex((s) => s.end > s.start && a >= s.start && a < s.end);
    },
    onSelect: setSel,
  });

  const centerMode = p.center ?? (innerRadius > 0 ? 'selection' : 'none');
  const centerValue = centerMode === 'selection' && sel >= 0 ? raw[sel]! : total;
  const centerCaption = centerMode === 'selection' && sel >= 0 ? cats[sel] : p.centerLabel;
  const liveText = sel >= 0 ? `${cats[sel]}: ${formatValue(raw[sel]!, format, { currency })}, ${formatValue(total > 0 ? raw[sel]! / total : 0, 'percent')}` : '';
  const tableId = `${id}-data`;

  return (
    <div ref={wrapRef} className={className} style={{ position: 'relative', width: '100%', ...style }}>
      <div
        role="img"
        aria-label={(title ? title + '. ' : '') + summarize('Pie chart', table, format, { currency })}
        aria-describedby={tableId}
        tabIndex={selectable ? 0 : undefined}
        onKeyDown={selectable ? (e) => keyNav(e, sel, cats.length, setSel) : undefined}
        onBlur={() => p.selection === undefined && setSel(null)}
        style={{ position: 'relative', width: size, height: size, margin: '0 auto', borderRadius: '50%' }}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }} aria-hidden>
          {sectors.map((s) => (
            <path
              key={cats[s.index]}
              d={sectorPath(c, c, r0, outer, s.start, s.end, inset)}
              fill={seriesColor(s.index, colors)}
              opacity={sel >= 0 && sel !== s.index ? 0.3 : 1}
              style={{ transition: 'opacity 0.2s' }}
            />
          ))}
        </svg>
        {r0 > 24 && centerMode !== 'none' && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
              textAlign: 'center',
            }}
          >
            <div style={{ fontFamily: roundedFont, fontSize: Math.min(28, r0 * 0.45), fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: tokenVar('label') }}>
              {formatValue(centerValue, format, { currency })}
            </div>
            {centerCaption && <div style={{ ...caption2, fontSize: 12, color: tokenVar('secondaryLabel'), maxWidth: r0 * 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{centerCaption}</div>}
          </div>
        )}
        {selectable && <div ref={overlayRef} style={{ position: 'absolute', inset: 0, borderRadius: '50%', touchAction: 'pan-y' }} />}
      </div>
      {showLegend && <Legend items={cats.map((name, i) => ({ name, color: seriesColor(i, colors) }))} />}
      <DataTable id={tableId} caption={title ?? 'Pie chart'} xLabel={x} series={[y]} categories={cats} values={[raw]} format={format} currency={currency} />
      <LiveRegion text={liveText} />
    </div>
  );
}
