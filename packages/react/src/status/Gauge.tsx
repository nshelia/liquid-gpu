/**
 * SwiftUI `Gauge` on iPhone (deep/swiftui-components/spec.md §3; layer dumps out/raw/gauge.*, shape paths from the
 * StatusLab probe, uikit-internals/deep/demo-audit/status/raw/paths.console.txt).
 *
 * - `automatic` / `linearCapacity` (400 × 78.33 / 47): label 17 pt centred; 10.67 below it a row of min label · 8 ·
 *   capsule track 16 tall r 8 (#787880@0.12, dark #767680@0.24) · 8 · max label; the tint fill is the track capsule
 *   slid left by (1 − v)·w and clipped to the track. Current value label 6.67 below the row, centred.
 * - `accessoryLinear` (frame 8 tall; labels overflow it): leading label (17 pt Semibold: box 22.33, track at 30.33)
 *   · 8 · 8 pt track r 4 in the label colour with a
 *   16 pt hole and an 8 pt dot at 4 + v·(w − 8).
 * - `accessoryLinearCapacity`: label 17 pt, 4 below it the 4 pt UIProgressView (ProgressView).
 * - `accessoryCircular` (58 × 58): 270° ring open at the bottom, centre-line r 26.24, stroke 5.52, round caps, label
 *   colour; the value dot (Ø 5.52) sits in a 13.45 r 5 hole rotated to the ring; value text centred, label below.
 * - `accessoryCircularCapacity` (58 × 58): full track ring label@0.35, value arc clockwise from 12 o'clock, round caps.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import { cssVar, useLiquid } from '../root';
import { ProgressView } from '../controls/Progress';
import { arcPath, circularIndicatorAngle, gaugeFraction, ring, ringPoint } from './logic';

export type GaugeStyle =
  | 'automatic'
  | 'linearCapacity'
  | 'accessoryLinear'
  | 'accessoryLinearCapacity'
  | 'accessoryCircular'
  | 'accessoryCircularCapacity';

export interface GaugeProps {
  value: number;
  min?: number;
  max?: number;
  gaugeStyle?: GaugeStyle;
  label?: ReactNode;
  currentValueLabel?: ReactNode;
  minimumValueLabel?: ReactNode;
  maximumValueLabel?: ReactNode;
  /** Fill colour (SwiftUI `.tint`). Linear styles default to the accent; accessory styles to the label colour. */
  tint?: string;
  className?: string;
  style?: CSSProperties;
}

/** SUI gauge.automatic: track colours. */
const trackFill = { light: 'rgba(120,120,128,0.12)', dark: 'rgba(118,118,128,0.24)' } as const;
const text17: CSSProperties = { fontSize: 17, lineHeight: '20.3333px', whiteSpace: 'nowrap' };

export function Gauge(props: GaugeProps) {
  const { value, min = 0, max = 1, gaugeStyle = 'automatic', label, className, style } = props;
  const f = gaugeFraction(value, min, max);
  const aria = {
    role: 'meter',
    'aria-valuemin': min,
    'aria-valuemax': max,
    'aria-valuenow': value,
    'aria-valuetext': `${Math.round(f * 100)}%`,
    'aria-label': typeof label === 'string' ? label : undefined,
    className,
  };
  switch (gaugeStyle) {
    case 'accessoryLinear':
      return <AccessoryLinear {...props} f={f} aria={aria} style={style} />;
    case 'accessoryLinearCapacity':
      return (
        <div {...aria} style={{ display: 'flex', flexDirection: 'column', gap: 4, ...style }}>
          {label && <div style={text17}>{label}</div>}
          <ProgressView value={f} tint={props.tint} animated={false} aria-label={undefined} />
        </div>
      );
    case 'accessoryCircular':
    case 'accessoryCircularCapacity':
      return <Circular {...props} f={f} aria={aria} style={style} capacity={gaugeStyle === 'accessoryCircularCapacity'} />;
    default:
      return <LinearCapacity {...props} f={f} aria={aria} style={style} />;
  }
}

type Inner = GaugeProps & { f: number; aria: Record<string, unknown> };

function LinearCapacity({ f, aria, style, label, currentValueLabel, minimumValueLabel, maximumValueLabel, tint }: Inner) {
  const ctx = useLiquid();
  return (
    <div {...aria} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', ...style }}>
      {label && <div style={{ ...text17, marginBottom: 10.6667 }}>{label}</div>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        {minimumValueLabel && <div style={text17}>{minimumValueLabel}</div>}
        <div style={{ flex: 1, height: 16, borderRadius: 8, overflow: 'hidden', background: trackFill[ctx.appearance], isolation: 'isolate' }}>
          <div
            style={{
              height: '100%',
              borderRadius: 8,
              background: tint ?? cssVar('tint'),
              transform: `translateX(${(f - 1) * 100}%)`,
            }}
          />
        </div>
        {maximumValueLabel && <div style={text17}>{maximumValueLabel}</div>}
      </div>
      {currentValueLabel && <div style={{ ...text17, marginTop: 6.6667 }}>{currentValueLabel}</div>}
    </div>
  );
}

function AccessoryLinear({ f, aria, style, currentValueLabel, minimumValueLabel, maximumValueLabel, tint }: Inner) {
  const leading = minimumValueLabel ?? currentValueLabel;
  const color = tint ?? cssVar('label');
  // SUI: track x 50.33 w 369.67, v 0.4 → dot centre 199 = 54.33 + 0.4·(w − 8).
  const cx = `calc(4px + ${f} * (100% - 8px))`;
  const hole = `radial-gradient(circle 8px at ${cx} 4px, transparent 7.75px, #000 8.25px)`;
  return (
    <div {...aria} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 8, width: '100%', ...style }}>
      {leading && <div style={{ ...text17, margin: '-6.1667px 0', fontWeight: 600 }}>{leading}</div>}
      <div aria-hidden style={{ position: 'relative', flex: 1, height: 8 }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: color, mask: hole, WebkitMask: hole }} />
        <div style={{ position: 'absolute', top: 0, left: cx, width: 8, height: 8, marginLeft: -4, borderRadius: 4, background: color }} />
      </div>
      {maximumValueLabel && <div style={{ ...text17, margin: '-6.1667px 0', fontWeight: 600 }}>{maximumValueLabel}</div>}
    </div>
  );
}

function Circular({ f, aria, style, label, currentValueLabel, tint, capacity }: Inner & { capacity: boolean }) {
  const id = useId();
  const color = tint ?? cssVar('label');
  const { size, radius, stroke } = ring;
  const c = size / 2;
  let rings: ReactNode;
  if (capacity) {
    const end = f * 360;
    rings = (
      <>
        <circle cx={c} cy={c} r={radius} fill="none" stroke={cssVar('label')} strokeOpacity={0.35} strokeWidth={stroke} />
        {f > 0 && <path d={arcPath(0, end)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" />}
        {/* SUI: the end cap layer casts a black shadow, radius 0.87, over the track. */}
        {f > 0 && <circle cx={ringPoint(end)[0]} cy={ringPoint(end)[1]} r={stroke / 2} fill={color} style={{ filter: 'drop-shadow(0 0 0.87px #000)' }} />}
      </>
    );
  } else {
    // SUI: the dot's hole layer is 13.45 r 5, turned to the ring direction; its cut on the ring measures ±4.9 pt from
    // the dot centre (pixels), so a 9.8 r 3.6 hole is drawn.
    const a = circularIndicatorAngle(f);
    const [x, y] = ringPoint(a);
    const hole = 9.8;
    rings = (
      <>
        <mask id={`${id}h`} maskUnits="userSpaceOnUse" x="-4" y="-4" width={size + 8} height={size + 8}>
          <rect x="-4" y="-4" width={size + 8} height={size + 8} fill="#fff" />
          <rect x={x - hole / 2} y={y - hole / 2} width={hole} height={hole} rx={3.6} fill="#000" transform={`rotate(${a} ${x} ${y})`} />
        </mask>
        <path d={arcPath(-135, 135)} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" mask={`url(#${CSS.escape(id)}h)`} />
        <circle cx={x} cy={y} r={stroke / 2} fill={color} />
      </>
    );
  }
  return (
    <div {...aria} style={{ position: 'relative', width: size, height: size, flex: 'none', ...style }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute', inset: 0, overflow: 'visible' }} aria-hidden>
        {rings}
      </svg>
      {currentValueLabel && <div style={circularValue(capacity)}>{currentValueLabel}</div>}
      {!capacity && label && <div style={circularLabel}>{label}</div>}
    </div>
  );
}

/** SUI: value text box 30.33×30.67 at (14, 13.67) (capacity 30.67×29 at (13.67, 14.67)); digits ink 28 × 17.67. */
const circularValue = (capacity: boolean): CSSProperties => ({
  position: 'absolute',
  left: 0,
  right: 0,
  top: capacity ? 14.3333 : 12.3333, // ink aligned to the native digits (pixels)
  height: capacity ? 29 : 30.6667,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 24,
  fontWeight: 500,
  letterSpacing: 0.4,
  paddingLeft: 0.4,
  whiteSpace: 'nowrap',
});

/** SUI: label box 7.33×15.67 at (25.33, 41.33), ink 7.67 tall (≈ 11 pt). */
const circularLabel: CSSProperties = {
  position: 'absolute',
  left: 0,
  right: 0,
  top: 40.3333,
  height: 15.6667,
  lineHeight: '15.6667px',
  textAlign: 'center',
  fontSize: 11,
  fontWeight: 500,
};
