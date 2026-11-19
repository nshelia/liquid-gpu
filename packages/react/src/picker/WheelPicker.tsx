/**
 * `WheelPicker`: UIPickerView (TO = components/text_overlays.md §6; SC = deep/swiftui-components/spec.md §3 `.wheel`).
 *
 * - 216 pt tall, stretched to the proposed width (SC §3: 400 × 216); 32 pt rows on a cylinder of R 97.26 (θ 18.85° per
 *   row), orthographic (TO §6.5).
 * - Selection band: capsule 34 tall, 9 pt side inset, #747480@0.08 (TO §6.2).
 * - Magnifier: rows outside the band 21 pt @0.447, inside it 23.5 pt @1 (TO §6.3), the outer rows under the
 *   alpha 0/.71/.80/.80/.71/0 fade mask (TO §6.4).
 * - Motion: core `ScrollPhysics` per column (rubber band 0.55, deceleration, release target snapped to the nearest row,
 *   the `scrollViewWillEndDragging` hook); `selectRow(animated:)` = 0.3 s `scrollTo` (TO §6.6).
 * - Haptic: one selection tick per row crossing the band while tracking or decelerating, throttled to 0.04 s (HF §4).
 * - Input: drag (gesture arena, 10 pt pan hysteresis), tap a row to scroll it to the band, wheel/trackpad, keyboard
 *   (listbox: ↑/↓, PageUp/PageDown, Home/End, ←/→ between columns).
 */
import { useEffect, useId, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { HAPTIC_SELECTION_MIN_INTERVAL, ScrollPhysics, VelocityTracker, gestureThresholds, playHaptic } from '@liquid-gpu/core';
import { useLiquid } from '../root';
import { classifyWheel, wheelDeltaPixels } from '../logic/scroll';
import {
  clampIndex,
  indexAtPoint,
  indexForOffset,
  keyboardTarget,
  maskGradient,
  nearestEnabled,
  optionIndex,
  outerMaskStops,
  snapOffset,
  visibleRowRange,
  wheelMetrics as W,
  wheelRowMatrix,
  wheelRowTransform,
} from './logic';
import type { PickerOption, PickerValue } from './types';

export interface WheelColumn<T extends PickerValue = PickerValue> {
  options: readonly PickerOption<T>[];
  selection?: T;
  defaultSelection?: T;
  onChange?: (value: T) => void;
  /** Column width in pt; columns without a width share the rest equally. */
  width?: number;
  /** Text alignment inside the column (UIPickerView centres labels, TO §6.3). */
  align?: 'center' | 'left' | 'right';
  'aria-label'?: string;
}

export interface WheelPickerProps {
  columns: readonly WheelColumn<any>[];
  disabled?: boolean;
  /** Total width (CSS length or pt). Default: the container's width (SC §3 stretches to the proposed width). */
  width?: number | string;
  'aria-label'?: string;
  /** Renders `option.icon` names (e.g. an SF Symbol registry). Icons are omitted without it. */
  renderIcon?: (name: string) => ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** Multi-column wheel (UIPickerView with components). One shared selection band across all columns. */
export function WheelPicker({ columns, disabled, width, renderIcon, className, style, ...aria }: WheelPickerProps) {
  const ctx = useLiquid();
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const focusColumn = (i: number) => colRefs.current[clampIndex(i, columns.length)]?.focus();
  return (
    <div
      role="group"
      aria-label={aria['aria-label']}
      aria-disabled={disabled || undefined}
      className={['lq-wheel-picker', className].filter(Boolean).join(' ')}
      style={{
        position: 'relative',
        height: W.height,
        width: width ?? '100%',
        boxSizing: 'border-box',
        padding: `0 ${W.sideInset}px`,
        display: 'flex',
        gap: columns.length > 1 ? W.columnGap : 0,
        // TODO(unknown): SwiftUI `.disabled` on a wheel; dimmed like disabled controls.
        opacity: disabled ? 0.5 : 1,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        ...style,
      }}
    >
      {/* TO §6.2 selection band, behind the rows. */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: W.sideInset,
          right: W.sideInset,
          top: W.height / 2 - W.bandHeight / 2,
          height: W.bandHeight,
          borderRadius: W.bandRadius,
          background: ctx.appearance === 'dark' ? W.bandFillDark : W.bandFillLight,
          pointerEvents: 'none',
        }}
      />
      {columns.map((c, i) => (
        <WheelColumnView
          key={i}
          column={c}
          disabled={!!disabled}
          renderIcon={renderIcon}
          colRef={(el) => (colRefs.current[i] = el)}
          onSideKey={(dir) => focusColumn(i + dir)}
        />
      ))}
    </div>
  );
}

interface ColumnViewProps {
  column: WheelColumn<any>;
  disabled: boolean;
  renderIcon?: (name: string) => ReactNode;
  colRef: (el: HTMLDivElement | null) => void;
  onSideKey: (dir: 1 | -1) => void;
}

function WheelColumnView({ column, disabled, renderIcon, colRef, onSideKey }: ColumnViewProps) {
  const ctx = useLiquid();
  const { options, selection, defaultSelection, onChange, width, align = 'center' } = column;
  const n = options.length;
  const H = W.rowHeight;
  const id = useId();
  const enabled = useMemo(() => options.map((o) => !o.disabled), [options]);

  // Selection state (controlled when `selection` is defined).
  const controlled = selection !== undefined;
  const inner = useRef<PickerValue | undefined>(defaultSelection ?? options[0]?.value);
  const current = controlled ? selection : inner.current;
  const selIndex = Math.max(0, optionIndex(options, current));

  const latest = useRef({ options, onChange, controlled, enabled, n, disabled });
  latest.current = { options, onChange, controlled, enabled, n, disabled };

  const physics = useMemo(
    () =>
      new ScrollPhysics({
        decelerationRate: W.decelerationRate,
        rubberBand: W.rubberBand,
        viewportSize: W.height, // rubber-band range = the scroll view's height along the axis (SMG §3)
        offset: selIndex * H,
        bounds: { min: 0, max: Math.max(0, n - 1) * H },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  physics.bounds = { min: 0, max: Math.max(0, n - 1) * H };

  const rootRef = useRef<HTMLDivElement | null>(null);
  const outerRows = useRef<(HTMLDivElement | null)[]>([]);
  const midRows = useRef<(HTMLDivElement | null)[]>([]);
  const st = useRef({ committed: selIndex, bandRow: selIndex, lastTick: -1, user: false, wheelTimer: 0 as ReturnType<typeof setTimeout> | 0 });

  const render = () => {
    const o = physics.offset;
    const [a, b] = visibleRowRange(o, n);
    for (let i = 0; i < n; i++) {
      const r1 = outerRows.current[i];
      const r2 = midRows.current[i];
      if (!r1 || !r2) continue;
      if (i < a || i > b) {
        r1.style.visibility = r2.style.visibility = 'hidden';
        continue;
      }
      const t = wheelRowTransform(i, o);
      r1.style.visibility = r2.style.visibility = t.visible ? 'visible' : 'hidden';
      r1.style.transform = r2.style.transform = wheelRowMatrix(t);
    }
    // HF §4: a click per row crossing the band while tracking or decelerating (not for programmatic selectRow).
    const row = indexForOffset(o, n);
    const s = st.current;
    if (row !== s.bandRow) {
      const now = performance.now() / 1000;
      if (s.user && now - s.lastTick >= HAPTIC_SELECTION_MIN_INTERVAL) {
        // TODO(unknown): no `picker` haptic token in core (HF §4: WheelsOfTime I 0.4–0.5 by speed); the selection
        // tick (I 0.4, S 0.2609) is used.
        playHaptic('sliderTick');
        s.lastTick = now;
      }
      s.bandRow = row;
    }
  };
  const renderRef = useRef(render);
  renderRef.current = render;

  const commit = (i: number) => {
    const L = latest.current;
    const s = st.current;
    s.committed = i;
    const opt = L.options[i];
    if (!opt) return;
    if (!L.controlled) inner.current = opt.value;
    rootRef.current?.setAttribute('aria-activedescendant', `${id}-o${i}`);
    for (let k = 0; k < outerRows.current.length; k++) outerRows.current[k]?.setAttribute('aria-selected', String(k === i));
    L.onChange?.(opt.value);
  };

  // Settle → commit the row at the band (UIPickerView didSelectRow fires when the wheel stops).
  useEffect(
    () =>
      ctx.animator.add(physics, () => {
        renderRef.current();
        ctx.requestFrame();
        if (physics.settled && !physics.tracking && st.current.user) {
          st.current.user = false;
          const L = latest.current;
          let i = indexForOffset(physics.offset, L.n);
          const e = nearestEnabled(i, L.enabled);
          if (e >= 0 && e !== i) {
            i = e;
            physics.scrollTo(i * H);
            ctx.animator.wake();
          }
          if (i !== st.current.committed) commit(i);
        }
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.animator, physics],
  );

  const select = (i: number, animated = true) => {
    const L = latest.current;
    const e = nearestEnabled(i, L.enabled, i >= st.current.committed ? 1 : -1);
    if (e < 0) return;
    st.current.user = false;
    physics.scrollTo(e * H, animated && !ctx.reducedMotion);
    ctx.animator.wake();
    renderRef.current();
    ctx.requestFrame();
    if (e !== st.current.committed) commit(e);
  };

  // External selection changes (controlled) → selectRow(animated:).
  useLayoutEffect(() => {
    if (physics.tracking || st.current.user) return;
    if (selIndex !== st.current.committed || Math.abs(physics.offset - selIndex * H) > 0.5) {
      st.current.committed = selIndex;
      physics.scrollTo(selIndex * H, !ctx.reducedMotion);
      ctx.animator.wake();
    }
    renderRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selIndex, n]);

  // Pointer drag + tap through the gesture arena.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const tracker = new VelocityTracker();
    let lastMoveT = -1;
    let startPos = 0;
    let startOffset = 0;
    const track = (e: PointerEvent) => {
      if (e.timeStamp === lastMoveT) return;
      if (lastMoveT >= 0) physics.observeFrame((e.timeStamp - lastMoveT) / 1000);
      lastMoveT = e.timeStamp;
      tracker.add(e.timeStamp, e.clientY);
    };
    const snap = (p: number) => snapOffset(p, latest.current.n);
    const recognizer = {
      decide(s: { dx: number; dy: number; event: PointerEvent }) {
        track(s.event);
        const h = gestureThresholds.panHysteresis; // SMG §7: 10 pt (the picker's table is a UIScrollView)
        if (Math.abs(s.dy) >= h && Math.abs(s.dy) >= Math.abs(s.dx)) return 'claim' as const;
        if (Math.abs(s.dx) >= h && Math.abs(s.dx) > Math.abs(s.dy)) return 'fail' as const;
        return 'wait' as const;
      },
      onBegin(s: { dy: number; startY: number }) {
        st.current.user = true;
        physics.dragBegin();
        startOffset = physics.unbandedOffset;
        startPos = s.startY + Math.sign(s.dy) * Math.min(Math.abs(s.dy), gestureThresholds.panHysteresis);
      },
      onMove(s: { event: PointerEvent }) {
        track(s.event);
        physics.dragMove(startOffset - (s.event.clientY - startPos));
        renderRef.current();
        ctx.requestFrame();
      },
      onEnd(s: { event: PointerEvent }, cancelled: boolean) {
        const outside = physics.offset < physics.bounds.min || physics.offset > physics.bounds.max;
        const v = cancelled ? 0 : -tracker.releaseVelocity(outside);
        physics.dragEnd(v, snap, (s.event.timeStamp - lastMoveT) / 1000);
        ctx.animator.wake();
      },
      onCancel() {
        if (physics.tracking) {
          physics.dragEnd(0, snap);
          ctx.animator.wake();
        }
      },
      onTap(s: { event: PointerEvent }) {
        if (latest.current.disabled) return;
        const r = el.getBoundingClientRect();
        const i = indexAtPoint(s.event.clientY - (r.top + r.height / 2), physics.offset, latest.current.n);
        if (i !== null) select(i);
        el.focus({ preventScroll: true });
      },
    };
    const onDown = (e: PointerEvent) => {
      if (latest.current.disabled) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      tracker.reset();
      lastMoveT = -1;
      track(e);
      ctx.gestures.track(e, recognizer);
      // A touch on a spinning wheel catches it (UIScrollView).
      if (physics.active && Math.abs(physics.velocity) > 50) {
        physics.stop();
        ctx.gestures.claim(e, recognizer);
      }
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, physics]);

  // Wheel / trackpad: pixel deltas track the content with a rubber band, then snap; mouse notches step one row.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (latest.current.disabled) return;
      e.preventDefault();
      e.stopPropagation();
      const s = st.current;
      if (classifyWheel(e.deltaMode, e.deltaY) === 'discrete') {
        // TODO(unknown): web-only; one row per mouse-wheel notch.
        select(clampIndex(s.committed + Math.sign(e.deltaY), latest.current.n));
        return;
      }
      const d = wheelDeltaPixels(e.deltaMode, e.deltaY, W.height);
      if (!physics.tracking) {
        physics.dragBegin();
        s.user = true;
      }
      physics.dragMove(physics.unbandedOffset + d);
      renderRef.current();
      ctx.requestFrame();
      if (s.wheelTimer) clearTimeout(s.wheelTimer);
      // TODO(unknown): wheel-gesture end detection is web-only; 90 ms of silence ends it (as ScrollView).
      s.wheelTimer = setTimeout(() => {
        s.wheelTimer = 0;
        physics.dragEnd(0, (p) => snapOffset(p, latest.current.n));
        ctx.animator.wake();
      }, 90);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, physics]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      onSideKey(e.key === 'ArrowLeft' ? -1 : 1);
      e.preventDefault();
      return;
    }
    const t = keyboardTarget(e.key, st.current.committed, n);
    if (t === null) return;
    e.preventDefault();
    select(t);
  };

  const rowStyle = (size: number, alpha: number): CSSProperties => ({
    position: 'absolute',
    left: 0,
    right: 0,
    top: W.height / 2 - H / 2,
    height: H,
    lineHeight: `${H}px`,
    fontSize: size,
    fontWeight: 400, // TO §6.3 `.SFUI-Regular`
    color: 'var(--lq-label)', // TO §6.3 labelColor
    opacity: alpha,
    textAlign: align,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    padding: '0 8px', // TODO(unknown): label inset inside a column
    boxSizing: 'border-box',
    transformOrigin: '50% 50%',
    willChange: 'transform',
    display: 'flex',
    alignItems: 'center',
    justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center',
    gap: 6,
  });
  const label = (o: PickerOption<any>) => (
    <>
      {o.icon && renderIcon ? <span aria-hidden style={{ display: 'inline-flex' }}>{renderIcon(o.icon)}</span> : null}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{o.label}</span>
    </>
  );
  const outerMask = maskGradient(outerMaskStops());
  const b0 = W.height / 2 - W.bandHeight / 2;

  return (
    <div
      ref={(el) => {
        rootRef.current = el;
        colRef(el);
      }}
      role="listbox"
      tabIndex={disabled ? -1 : 0}
      aria-label={column['aria-label']}
      aria-disabled={disabled || undefined}
      aria-activedescendant={n ? `${id}-o${selIndex}` : undefined}
      onKeyDown={onKeyDown}
      className="lq-wheel-column"
      style={{
        position: 'relative',
        flex: width ? `0 0 ${width}px` : '1 1 0',
        minWidth: 0,
        height: W.height,
        overflow: 'hidden',
        touchAction: 'none',
        cursor: disabled ? 'default' : 'grab',
        outlineOffset: -2,
        borderRadius: W.bandRadius,
      }}
    >
      {/* Top and bottom (TO §6.3: 21 pt @0.447) under the fade mask (TO §6.4), band cut out. */}
      <div aria-hidden={false} style={{ position: 'absolute', inset: 0, WebkitMaskImage: outerMask, maskImage: outerMask }}>
        {options.map((o, i) => (
          <div
            key={i}
            id={`${id}-o${i}`}
            role="option"
            aria-selected={i === selIndex}
            aria-disabled={o.disabled || undefined}
            ref={(el) => {
              outerRows.current[i] = el;
            }}
            style={{ ...rowStyle(W.fontSize, W.outerAlpha * (o.disabled ? 0.5 : 1)), transform: wheelRowMatrix(wheelRowTransform(i, physics.offset)) }}
          >
            {label(o)}
          </div>
        ))}
      </div>
      {/* Middle (TO §6.3: magnified 23.5 pt @1), clipped to the band. */}
      <div aria-hidden style={{ position: 'absolute', inset: 0, clipPath: `inset(${b0}px 0 ${b0}px 0)` }}>
        {options.map((o, i) => (
          <div
            key={i}
            ref={(el) => {
              midRows.current[i] = el;
            }}
            style={{ ...rowStyle(W.magnifiedFontSize, o.disabled ? 0.447 : 1), transform: wheelRowMatrix(wheelRowTransform(i, physics.offset)) }}
          >
            {label(o)}
          </div>
        ))}
      </div>
    </div>
  );
}
