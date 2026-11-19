/**
 * BarChart, LineChart and AreaChart: hand-written SVG emulating Swift Charts' BarMark / LineMark / AreaMark +
 * RuleMark, with chartXSelection-like scrubbing.
 *
 * Swift Charts is not in the uikit-internals extraction, so layout and styling are design decisions that follow
 * its documented defaults: value axis on the trailing edge with gridlines in `separator`, caption2 tick labels in
 * `secondaryLabel`, plain (square) bars, 2 pt lines, series colours cycling the system palette, a bottom-leading
 * legend. // TODO(unknown): Swift Charts not extracted
 */
import { useId, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  areaPath,
  bandScale,
  barPath,
  extent,
  extractSeries,
  formatValue,
  linePath,
  linearScale,
  nearestIndex,
  niceTicks,
  pointScale,
  stack,
  stackExtent,
  summarize,
  type Interpolation,
  type Point,
} from './scale';
import {
  Annotation,
  DataTable,
  Legend,
  LiveRegion,
  caption2,
  keyNav,
  labelWidth,
  rulesOf,
  resolveColor,
  seriesColor,
  tokenVar,
  useScrub,
  useSelection,
  useTweenedTable,
  useWidth,
  type ChartBaseProps,
} from './shared';

export interface BarChartProps extends ChartBaseProps {
  /** Default 'vertical'. */
  orientation?: 'vertical' | 'horizontal';
  /** Several series per category: 'stacked' (Swift Charts default) or 'grouped' (`.position(by:)`). */
  stacking?: 'stacked' | 'grouped';
  /** Bar end radius, pt (default 0: Swift Charts bars are square). */
  cornerRadius?: number;
}

export interface LineChartProps extends ChartBaseProps {
  /** Default 'linear' (Swift Charts default). */
  interpolation?: Interpolation;
  /** Draw a point at every value (PointMark). Default false. */
  showPoints?: boolean;
  /** Stroke width, pt (default 2). */
  lineWidth?: number;
}

export interface AreaChartProps extends ChartBaseProps {
  /** Stack series (Swift Charts default for AreaMark with a series). Default true. */
  stacked?: boolean;
  interpolation?: Interpolation;
  /** Draw the top edge as a line. Default false. */
  showLine?: boolean;
  /** Fill opacity (default 1 stacked, 0.35 unstacked). */
  opacity?: number;
}

type Kind = 'bar' | 'line' | 'area';

export function BarChart(props: BarChartProps) {
  return <CartesianChart kind="bar" {...props} />;
}

export function LineChart(props: LineChartProps) {
  return <CartesianChart kind="line" {...props} />;
}

export function AreaChart(props: AreaChartProps) {
  return <CartesianChart kind="area" {...props} />;
}

type AllProps = ChartBaseProps &
  Partial<Omit<BarChartProps, keyof ChartBaseProps>> &
  Partial<Omit<LineChartProps, keyof ChartBaseProps>> &
  Partial<Omit<AreaChartProps, keyof ChartBaseProps>> & { kind: Kind };

const KIND_NAME: Record<Kind, string> = { bar: 'Bar chart', line: 'Line chart', area: 'Area chart' };
const X_LABEL_H = 18; // caption2 13.1 + 5 gap
const AXIS_GAP = 6;

function CartesianChart(p: AllProps) {
  const {
    kind,
    data,
    x,
    y,
    series,
    height = 200,
    colors,
    xAxis = {},
    yAxis = {},
    title,
    selectable = true,
    animate = true,
    className,
    style,
  } = p;
  const horizontal = kind === 'bar' && p.orientation === 'horizontal';
  const stacked = kind === 'bar' ? (p.stacking ?? 'stacked') === 'stacked' : kind === 'area' ? (p.stacked ?? true) : false;
  const interpolation = p.interpolation ?? 'linear';
  const id = useId();
  const [wrapRef, width] = useWidth<HTMLDivElement>();
  const overlayRef = useRef<HTMLDivElement>(null);

  const table = useMemo(() => extractSeries(data, x, y, series), [data, x, y, series]);
  const { categories, series: names } = table;
  const numericX = kind !== 'bar' ? table.numericX : null;
  const keys = useMemo(() => names.map((s) => categories.map((c) => s + '\u0001' + c)), [names, categories]);
  const values = useTweenedTable(keys, table.values, animate, kind === 'bar' ? 0 : 'target');
  const cells = useMemo(() => (stacked ? stack(values) : null), [stacked, values]);
  const rules = rulesOf(p.rule);
  const fmt = yAxis.format ?? 'number';
  const fopts = { currency: yAxis.currency };
  const xfmt = xAxis.format;
  const xLabel = (c: string, i: number) => (xfmt && numericX ? formatValue(numericX[i]!, xfmt, { currency: xAxis.currency }) : c);
  const [selIndex, setSel] = useSelection(categories, p.selection, p.onSelectionChange);

  // Value domain (from target values so the axis does not wobble while marks animate).
  const nt = useMemo(() => {
    let [lo, hi] = stacked ? stackExtent(stack(table.values)) : extent(table.values, kind !== 'line' || (yAxis.includeZero ?? true));
    for (const r of rules) {
      lo = Math.min(lo, r.value);
      hi = Math.max(hi, r.value);
    }
    if (yAxis.domain) {
      const [a, b] = yAxis.domain;
      const t = niceTicks(a, b, yAxis.ticks ?? 4);
      return { min: a, max: b, ticks: t.ticks.filter((v) => v >= Math.min(a, b) - 1e-9 && v <= Math.max(a, b) + 1e-9) };
    }
    return niceTicks(lo, hi, yAxis.ticks ?? 4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, stacked, kind, yAxis.domain?.[0], yAxis.domain?.[1], yAxis.ticks, yAxis.includeZero, JSON.stringify(rules)]);

  const tickLabels = nt.ticks.map((v) => formatValue(v, fmt, fopts));
  const valueLabelsW = yAxis.hidden ? 0 : Math.max(0, ...tickLabels.map((s) => labelWidth(s))) + AXIS_GAP;
  const catLabelsW = horizontal && !xAxis.hidden ? Math.min(width * 0.35, Math.max(0, ...categories.map((c) => labelWidth(c)))) + AXIS_GAP : 0;

  // Plot rectangle.
  const top = 6;
  const W = Math.max(40, width);
  const plot = horizontal
    ? { left: catLabelsW, right: W - 4, top, bottom: height - (yAxis.hidden ? 4 : X_LABEL_H) }
    : { left: 0, right: W - valueLabelsW, top, bottom: height - (xAxis.hidden ? 4 : X_LABEL_H) };
  const pw = plot.right - plot.left;
  const ph = plot.bottom - plot.top;

  // Value scale (vertical: y; horizontal: x).
  const vs = horizontal ? linearScale([nt.min, nt.max], [plot.left, plot.right]) : linearScale([nt.min, nt.max], [plot.bottom, plot.top]);
  // Category positions along the other axis.
  const n = categories.length;
  const band = horizontal
    ? bandScale(n, [plot.top, plot.bottom], 0.2, 0.1)
    : kind === 'bar'
      ? bandScale(n, [plot.left, plot.right], 0.2, 0.1)
      : bandScale(n, [plot.left, plot.right], 0, 0);
  const xNum = numericX ? niceTicks(Math.min(...numericX), Math.max(...numericX), Math.max(2, Math.min(6, Math.floor(pw / 90)))) : null;
  const xs = numericX
    ? (() => {
        const lo = Math.min(...numericX);
        const hi = Math.max(...numericX);
        const s = linearScale([lo, hi], [plot.left, plot.right]);
        return numericX.map((v) => s(v));
      })()
    : kind === 'bar'
      ? categories.map((_, i) => band.center(i))
      : categories.map((_, i) => pointScale(n, [plot.left, plot.right], Math.min(16, pw / Math.max(2, n) / 2))(i));
  const xNumScale = numericX ? linearScale([Math.min(...numericX), Math.max(...numericX)], [plot.left, plot.right]) : null;

  const color = (s: number) => seriesColor(s, colors);
  const showLegend = p.showLegend ?? names.length > 1;
  const sel = selIndex >= 0 && selIndex < n ? selIndex : -1;

  // ---- marks
  const marks: ReactNode[] = [];
  if (kind === 'bar') {
    const r = p.cornerRadius ?? 0;
    const grouped = !stacked && names.length > 1;
    names.forEach((_, s) => {
      const d: string[] = [];
      const dDim: string[] = [];
      categories.forEach((__, c) => {
        let v0: number;
        let v1: number;
        if (cells) {
          v0 = cells[s]![c]!.y0;
          v1 = cells[s]![c]!.y1;
        } else {
          v0 = 0;
          v1 = values[s]![c]!;
        }
        if (!Number.isFinite(v1) || v0 === v1) return;
        const a = vs(Math.max(nt.min, Math.min(nt.max, v0)));
        const b = vs(Math.max(nt.min, Math.min(nt.max, v1)));
        const neg = v1 < v0;
        const sub = grouped ? band.bandwidth / names.length : band.bandwidth;
        const off = band(c) + (grouped ? s * sub : 0);
        // Only the outermost stacked segment gets the corner radius.
        const outer = !cells || isOuter(cells, s, c);
        const rr = outer ? r : 0;
        const path = horizontal
          ? barPath(Math.min(a, b), off, Math.abs(b - a), sub, rr, 'horizontal', neg)
          : barPath(off, Math.min(a, b), sub, Math.abs(b - a), rr, 'vertical', neg);
        (sel >= 0 && c !== sel ? dDim : d).push(path);
      });
      marks.push(<path key={`b${s}`} d={d.join('')} fill={color(s)} />);
      if (dDim.length) marks.push(<path key={`bd${s}`} d={dDim.join('')} fill={color(s)} opacity={0.3} />);
    });
  } else {
    const lw = p.lineWidth ?? 2;
    const pts = (row: number[]): Point[] => row.map((v, c) => [xs[c]!, Number.isFinite(v) ? vs(v) : NaN]);
    // Area: draw in reverse so the first series sits on top when unstacked.
    if (kind === 'area') {
      const op = p.opacity ?? (stacked ? 1 : 0.35);
      names.forEach((_, s) => {
        const topPts: Point[] = categories.map((__, c) => [xs[c]!, cells ? vs(cells[s]![c]!.y1) : Number.isFinite(values[s]![c]!) ? vs(values[s]![c]!) : NaN]);
        const botPts: Point[] = categories.map((__, c) => [xs[c]!, cells ? vs(cells[s]![c]!.y0) : vs(Math.max(nt.min, Math.min(nt.max, 0)))]);
        marks.push(<path key={`a${s}`} d={areaPath(topPts, botPts, interpolation)} fill={color(s)} fillOpacity={op} />);
        if (p.showLine || !stacked)
          marks.push(<path key={`al${s}`} d={linePath(topPts, interpolation)} fill="none" stroke={color(s)} strokeWidth={lw} strokeLinejoin="round" strokeLinecap="round" />);
      });
    } else {
      names.forEach((_, s) => {
        const ps = pts(values[s]!);
        marks.push(<path key={`l${s}`} d={linePath(ps, interpolation)} fill="none" stroke={color(s)} strokeWidth={lw} strokeLinejoin="round" strokeLinecap="round" />);
        if (p.showPoints)
          ps.forEach(([px, py], c) => {
            if (Number.isFinite(py)) marks.push(<circle key={`p${s}.${c}`} cx={px} cy={py} r={lw * 1.5 + 0.5} fill={color(s)} />);
          });
      });
    }
  }

  // ---- axes and grid
  const grid: ReactNode[] = [];
  const axisText: ReactNode[] = [];
  const labelStyle: CSSProperties = { ...caption2, fontVariantNumeric: 'tabular-nums' };
  const textFill = tokenVar('secondaryLabel');
  const gridStroke = tokenVar('separator');
  nt.ticks.forEach((v, i) => {
    const pos = vs(v);
    if (yAxis.grid !== false)
      grid.push(
        horizontal ? (
          <line key={`g${i}`} x1={pos} x2={pos} y1={plot.top} y2={plot.bottom} stroke={gridStroke} strokeWidth={1} />
        ) : (
          <line key={`g${i}`} x1={plot.left} x2={plot.right} y1={pos} y2={pos} stroke={gridStroke} strokeWidth={1} />
        ),
      );
    if (!yAxis.hidden)
      axisText.push(
        horizontal ? (
          <text key={`t${i}`} x={pos} y={plot.bottom + 13} textAnchor={i === 0 ? 'start' : i === nt.ticks.length - 1 ? 'end' : 'middle'} fill={textFill} style={labelStyle}>
            {tickLabels[i]}
          </text>
        ) : (
          <text key={`t${i}`} x={plot.right + AXIS_GAP} y={pos} dominantBaseline="central" fill={textFill} style={labelStyle}>
            {tickLabels[i]}
          </text>
        ),
      );
  });
  if (!xAxis.hidden) {
    if (horizontal) {
      categories.forEach((c, i) =>
        axisText.push(
          <text key={`c${i}`} x={plot.left - AXIS_GAP} y={band.center(i)} textAnchor="end" dominantBaseline="central" fill={textFill} style={labelStyle}>
            {truncate(c, catLabelsW - AXIS_GAP)}
          </text>,
        ),
      );
    } else if (xNum && xNumScale) {
      xNum.ticks.forEach((v, i) => {
        if (v < xNumScale.domain[0] - 1e-9 || v > xNumScale.domain[1] + 1e-9) return;
        const px = xNumScale(v);
        if (xAxis.grid !== false) grid.push(<line key={`xg${i}`} x1={px} x2={px} y1={plot.top} y2={plot.bottom} stroke={gridStroke} strokeWidth={1} />);
        axisText.push(
          <text key={`x${i}`} x={px} y={plot.bottom + 13} textAnchor="middle" fill={textFill} style={labelStyle}>
            {xfmt ? formatValue(v, xfmt, { currency: xAxis.currency }) : String(v)}
          </text>,
        );
      });
    } else {
      // Thin labels so they do not collide.
      const widest = Math.max(1, ...categories.map((c) => labelWidth(c)));
      const every = Math.max(1, Math.ceil((widest + 8) / Math.max(1, n > 1 ? xs[1]! - xs[0]! : pw)));
      categories.forEach((c, i) => {
        if (i % every) return;
        axisText.push(
          <text key={`x${i}`} x={xs[i]} y={plot.bottom + 13} textAnchor="middle" fill={textFill} style={labelStyle}>
            {c}
          </text>,
        );
      });
    }
  }

  // ---- RuleMarks
  const ruleEls = rules.map((r, i) => {
    const pos = vs(r.value);
    const c = r.color ? resolveColor(r.color) : tokenVar('secondaryLabel');
    const dash = r.dashed === false ? undefined : '4 3';
    return (
      <g key={`r${i}`}>
        {horizontal ? (
          <line x1={pos} x2={pos} y1={plot.top} y2={plot.bottom} stroke={c} strokeWidth={1.5} strokeDasharray={dash} />
        ) : (
          <line x1={plot.left} x2={plot.right} y1={pos} y2={pos} stroke={c} strokeWidth={1.5} strokeDasharray={dash} />
        )}
        {r.label && (
          <text
            x={horizontal ? pos + 4 : plot.left + 2}
            y={horizontal ? plot.top + 10 : pos - 4}
            fill={c}
            style={{ ...caption2, fontWeight: 600 }}
          >
            {r.label}
          </text>
        )}
      </g>
    );
  });

  // ---- selection (rule + points + annotation)
  let selectionEls: ReactNode = null;
  let annotation: ReactNode = null;
  let liveText = '';
  if (sel >= 0) {
    const rows = names.map((name, s) => ({ name: name || y, color: color(s), value: formatValue(table.values[s]![sel]!, fmt, fopts) }));
    liveText = `${xLabel(categories[sel]!, sel)}: ${rows.map((r) => (names.length > 1 ? `${r.name} ${r.value}` : r.value)).join(', ')}`;
    if (kind !== 'bar') {
      const px = xs[sel]!;
      selectionEls = (
        <g>
          <line x1={px} x2={px} y1={plot.top} y2={plot.bottom} stroke={tokenVar('secondaryLabel')} strokeWidth={1} />
          {names.map((_, s) => {
            const v = cells ? cells[s]![sel]!.y1 : values[s]![sel]!;
            if (!Number.isFinite(v)) return null;
            return <circle key={s} cx={px} cy={vs(v)} r={4.5} fill={color(s)} stroke={tokenVar('systemBackground')} strokeWidth={2} />;
          })}
        </g>
      );
    }
    const at = horizontal ? W / 2 : xs[sel]!;
    annotation = <Annotation at={at} width={W} title={xLabel(categories[sel]!, sel)} rows={rows} top={horizontal ? Math.max(0, band(sel) - 54) : 0} />;
  }

  useScrub(overlayRef, {
    enabled: selectable && n > 0,
    axis: horizontal ? 'y' : 'x',
    pick: ({ x: lx, y: ly }) => (horizontal ? band.index(ly + plot.top) : nearestIndex(xs, lx + plot.left)),
    onSelect: setSel,
  });

  const summary = (title ? title + '. ' : '') + summarize(KIND_NAME[kind], table, fmt, fopts);
  const tableId = `${id}-data`;
  return (
    <div ref={wrapRef} className={className} style={{ position: 'relative', width: '100%', ...style }}>
      <div
        role="img"
        aria-label={summary}
        aria-describedby={tableId}
        tabIndex={selectable ? 0 : undefined}
        onKeyDown={selectable ? (e) => keyNav(e, sel, n, setSel, horizontal) : undefined}
        onBlur={() => p.selection === undefined && setSel(null)}
        style={{ position: 'relative', height, borderRadius: 4 }}
      >
        <svg width={W} height={height} viewBox={`0 0 ${W} ${height}`} style={{ display: 'block', overflow: 'visible', fontFamily: 'inherit' }} aria-hidden>
          {grid}
          {marks}
          {ruleEls}
          {selectionEls}
          {axisText}
        </svg>
        {selectable && (
          <div
            ref={overlayRef}
            style={{
              position: 'absolute',
              left: plot.left,
              top: plot.top,
              width: Math.max(0, pw),
              height: Math.max(0, ph),
              touchAction: horizontal ? 'pan-x' : 'pan-y',
            }}
          />
        )}
        {annotation}
      </div>
      {showLegend && <Legend items={names.map((name, s) => ({ name: name || y, color: color(s) }))} />}
      <DataTable id={tableId} caption={title ?? KIND_NAME[kind]} xLabel={x} series={names.map((s) => s || y)} categories={categories} values={table.values} format={fmt} currency={yAxis.currency} />
      <LiveRegion text={liveText} />
    </div>
  );
}

/** True when no later series stacks further out in the same direction at this category. */
function isOuter(cells: { y0: number; y1: number }[][], s: number, c: number): boolean {
  const me = cells[s]![c]!;
  const up = me.y1 >= me.y0;
  for (let k = s + 1; k < cells.length; k++) {
    const o = cells[k]![c]!;
    if (o.y1 === o.y0) continue;
    if (o.y1 >= o.y0 === up) return false;
  }
  return true;
}

function truncate(s: string, maxW: number): string {
  if (labelWidth(s) <= maxW) return s;
  const n = Math.max(1, Math.floor(maxW / (11 * 0.6)) - 1);
  return s.slice(0, n) + '…';
}
