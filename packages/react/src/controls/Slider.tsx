/**
 * `Slider` (UISlider glass visual element, components/controls.md §3).
 *
 * - 34 pt tall; track 6 pt at y 14, radius 3, colour sliderTrack; fill in the tint.
 * - Thumb 37×24 at y 5, x = v·(W − 37); a liquid lens lifted ×1.55 (57.35×37.2) while touched (CT §3.2).
 * - Only the thumb is a touch target (a tap on the track does nothing). Tracking is relative: after a 10 pt slop,
 *   Δvalue = Δx / W.
 * - Past the ends: the track stretches (+7.6 pt), squishes (6 → 2.54) and the thumb rubber-bands (+12 pt), springing
 *   back after release.
 * - Ticks (`ticks` ≥ 2): 3×3 dots 11.5 pt below the track centre on the thumb-centre positions.
 * - Haptics (haptics-framerate §4): one edge haptic when the value reaches an end; with ticks, one tick haptic per
 *   tick crossed. None while dragging a continuous slider.
 * - Keyboard: arrow keys / Home / End (role="slider").
 */
import { useMotion } from './motion';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { playHaptic, springs } from '@liquid-gpu/core';
import { cssVar, useLiquid } from '../root';
import {
  hitsEdge,
  sliderGeometry as G,
  sliderOvershoot,
  sliderQuantize,
  sliderThumbX,
  sliderTickCentres,
  sliderTrack,
  ticksCrossed,
} from './logic';
import { LENS_TRACKING, squashFromVelocity, useControllable, useLatest, useLens, useLift } from './internal';

export interface SliderProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Called once when a drag ends. */
  onChangeEnd?: (value: number) => void;
  min?: number;
  max?: number;
  /** Value step (0 = continuous). */
  step?: number;
  /** Number of tick marks (TrackConfiguration numberOfTicks). */
  ticks?: number;
  /** Snap to the ticks. */
  snapToTicks?: boolean;
  /** CSS width. Default 100 % of the parent. */
  width?: number | string;
  tint?: string;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

/** CT §3.3 programmaticUpdate spring (response 0.4, ζ 0.8) for keyboard / prop changes. */
const PROGRAMMATIC = { dampingRatio: 0.8, response: 0.4 };
/** CT §3.3 pressScale spring (0.8, ζ 0.9) for the end-stretch spring-back. TODO(unknown): spring-back spring not decoded. */
const STRETCH_BACK = { dampingRatio: 0.9, response: 0.8 * 0.6 };

export function Slider({
  value,
  defaultValue,
  onChange,
  onChangeEnd,
  min = 0,
  max = 1,
  step = 0,
  ticks = 0,
  snapToTicks = false,
  width = '100%',
  tint,
  disabled,
  className,
  style,
  ...aria
}: SliderProps) {
  const ctx = useLiquid();
  const span = max - min || 1;
  const [val, setVal] = useControllable(value, defaultValue ?? min, onChange);
  const valRef = useLatest(val);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const fillRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const [w, setW] = useState(300);
  const wRef = useLatest(w);
  const liftV = useRef(0);
  const dragging = useRef(false);

  const toFraction = (v: number) => (v - min) / span;
  const fromFraction = (f: number) => {
    const q = sliderQuantize(f, { ticks, snapToTicks, steps: step > 0 ? Math.round(span / step) : 0 });
    return min + q * span;
  };

  const render = () => {
    const W = wRef.current;
    const f = frac.value; // unclamped while dragging past the ends
    const over = f > 1 ? (f - 1) * W : f < 0 ? -f * W : 0;
    const o = sliderOvershoot(over);
    const dir = f > 1 ? 1 : f < 0 ? -1 : 0;
    const stretch = stretchS.value * o.stretch;
    const squish = 1 - stretchS.value * (1 - o.squish);
    const tr = trackRef.current;
    if (tr) {
      // Stretch toward the finger (CT §3.2: +7.6 pt wider, +8 pt toward the finger).
      tr.style.transform = `translateX(${dir * stretch}px) scaleX(${(W + stretch) / W}) scaleY(${squish})`;
    }
    const cf = Math.min(1, Math.max(0, f));
    const fl = fillRef.current;
    if (fl) fl.style.width = `${cf * 100}%`;
    const l = Math.max(0, liftV.current);
    const tw = G.thumbW * (1 + (G.liftScale - 1) * l);
    const th = G.thumbH * (1 + (G.liftScale - 1) * l);
    const cx = sliderThumbX(cf, W) + G.thumbW / 2 + dir * stretchS.value * o.thumb;
    const t = thumbRef.current;
    if (t) {
      t.style.width = `${tw}px`;
      t.style.height = `${th}px`;
      t.style.transform = `translate(${cx - tw / 2}px, ${G.thumbY + G.thumbH / 2 - th / 2}px)`;
      t.style.opacity = String(Math.max(0, 1 - 1.6 * l));
    }
    thumbCx.current = cx;
  };
  const thumbCx = useRef(0);
  const frac = useMotion(toFraction(val), PROGRAMMATIC, render);
  const stretchS = useMotion(0, STRETCH_BACK, render);
  const lift = useLift((v) => {
    liftV.current = v;
    render();
  });

  useLens(rootRef, () => {
    const l = Math.max(0, liftV.current);
    return {
      cx: thumbCx.current,
      cy: G.thumbY + G.thumbH / 2,
      w: G.thumbW * (1 + (G.liftScale - 1) * l),
      h: G.thumbH * (1 + (G.liftScale - 1) * l),
      amount: l,
      squash: squashFromVelocity(frac.velocity * wRef.current, 0.00002, 0.06), // CT §3.2 ±2 % (±6 % fast)
    };
  }, { aberration: 0, innerRefraction: 11.1 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setW(el.offsetWidth || 300);
    });
    ro.observe(el);
    setW(el.offsetWidth || 300);
    return () => ro.disconnect();
  }, []);
  useEffect(() => render()); // re-layout after width / value renders

  // External value → thumb (programmatic update spring), unless dragging.
  useEffect(() => {
    if (!dragging.current) frac.set(toFraction(val));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [val, min, max]);

  const emit = (f: number, prevF: number) => {
    const next = fromFraction(f);
    const edge = hitsEdge(Math.min(1, Math.max(0, prevF)), Math.min(1, Math.max(0, f)));
    if (edge) playHaptic('sliderEdge');
    else if (ticks >= 2 && ticksCrossed(Math.min(1, Math.max(0, prevF)), Math.min(1, Math.max(0, f)), ticks).length)
      playHaptic('sliderTick');
    if (next !== valRef.current) setVal(next);
  };

  useEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb || disabled) return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.stopPropagation();
      lift.lift(390 / 20); // same lens spec as the switch (CT §3.3)
      const start = toFraction(valRef.current);
      let last = start;
      ctx.gestures.track(e, {
        decide: ({ dx, dy }) => {
          if (Math.abs(dy) > G.slop && Math.abs(dy) > Math.abs(dx)) return 'fail';
          return Math.abs(dx) > G.slop ? 'claim' : 'wait';
        },
        onBegin: () => {
          dragging.current = true;
          stretchS.snap(1);
        },
        onMove: ({ dx }) => {
          // Relative tracking after the slop (CT §3.2): Δvalue = (Δx − slop) / W.
          const adj = dx - Math.sign(dx) * G.slop;
          const f = sliderTrack(start, adj, wRef.current, true);
          frac.set(f, { params: LENS_TRACKING });
          emit(f, last);
          last = f;
        },
        onEnd: () => {
          dragging.current = false;
          lift.unlift();
          stretchS.set(0);
          frac.set(toFraction(fromFraction(Math.min(1, Math.max(0, frac.target)))), { params: springs.interactive });
          onChangeEnd?.(valRef.current);
        },
        onCancel: () => {
          dragging.current = false;
          lift.unlift();
          stretchS.set(0);
          frac.set(toFraction(valRef.current));
        },
        onTap: () => lift.unlift(),
      });
    };
    thumb.addEventListener('pointerdown', onDown);
    return () => thumb.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, ctx.gestures, min, max, step, ticks, snapToTicks]);

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const unit = step > 0 ? step / span : ticks >= 2 ? 1 / (ticks - 1) : 0.1;
    const f = toFraction(val);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = f + unit;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = f - unit;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = 1;
    if (next === null) return;
    e.preventDefault();
    emit(Math.min(1, Math.max(0, next)), f);
  };

  const tickXs = ticks >= 2 ? sliderTickCentres(w, ticks) : [];
  return (
    <div
      ref={rootRef}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={val}
      aria-disabled={disabled || undefined}
      onKeyDown={onKey}
      className={className}
      style={{
        position: 'relative',
        width,
        height: G.height,
        opacity: disabled ? G.disabledAlpha : 1,
        touchAction: 'pan-y',
        borderRadius: G.height / 2,
        ...style,
      }}
      {...aria}
    >
      <div
        ref={trackRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: G.trackY,
          height: G.trackHeight,
          borderRadius: G.trackHeight / 2,
          overflow: 'hidden',
          background: cssVar('sliderTrack'),
          transformOrigin: '50% 50%',
        }}
      >
        <div ref={fillRef} style={{ height: '100%', width: `${toFraction(val) * 100}%`, background: tint ?? cssVar('tint'), borderRadius: G.trackHeight / 2 }} />
      </div>
      {tickXs.map((x, i) => (
        <span
          key={i}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: x - G.tickSize / 2,
            top: G.trackY + G.trackHeight / 2 + G.tickOffsetY - G.tickSize / 2,
            width: G.tickSize,
            height: G.tickSize,
            borderRadius: G.tickSize / 2,
            background: cssVar('sliderTick'),
          }}
        />
      ))}
      <div
        ref={thumbRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: G.thumbW,
          height: G.thumbH,
          borderRadius: 999,
          background: ctx.appearance === 'dark' ? '#FFFFFF' : cssVar('sliderThumb'), // dark: reference render is opaque white
          boxShadow: '0 1px 10px rgba(0,0,0,0.14)', // CT §3.1 CA shadow opacity 0.14, radius 5 (CSS blur = 2 × radius), offset (0, 1)
          cursor: disabled ? 'default' : 'grab',
        }}
      />
    </div>
  );
}
