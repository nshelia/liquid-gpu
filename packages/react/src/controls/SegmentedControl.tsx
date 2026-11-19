/**
 * `SegmentedControl` (UISegmentedControl glass style, components/controls.md §5).
 *
 * - 32 pt capsule (radius 16), background segmentedBackground; 65 pt per segment by default.
 * - Selection: a liquid lens 61×28 (segment − 2·2 inset), radius 14, opaque thumb at rest.
 * - Touch-down on an unselected segment dims its label (0.47 s, (0.25, 0.1, 0.25, 1)). The selection changes at
 *   touch-up: the lens lifts (×1.38) and travels to the new segment with a velocity squash, then lands and un-lifts.
 * - The selection thumb can also be dragged (it stays lifted and follows the finger).
 * - Labels 13 pt, selected Medium (510), not scaled by Dynamic Type. No haptic on iPhone (haptics-framerate §4).
 */
import { useMotion } from './motion';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { springs } from '@liquid-gpu/core';
import { cssVar, useLiquid } from '../root';
import { segmentAt, segmentedGeometry as G } from './logic';
import { LENS_TRACKING, squashFromVelocity, useControllable, useLatest, useLens, useLift } from './internal';

export interface SegmentedControlProps<T extends string | number> {
  segments: readonly { value: T; label: ReactNode; 'aria-label'?: string }[];
  selection?: T;
  defaultSelection?: T;
  onChange?: (value: T) => void;
  /** Total width (CSS px). Default 65 pt per segment. */
  width?: number;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

export function SegmentedControl<T extends string | number>({
  segments,
  selection,
  defaultSelection,
  onChange,
  width,
  disabled,
  className,
  style,
  ...aria
}: SegmentedControlProps<T>) {
  const ctx = useLiquid();
  const [sel, setSel] = useControllable<T>(selection, defaultSelection ?? segments[0]!.value, onChange);
  const n = segments.length;
  const W = width ?? G.segmentWidth * n;
  const segW = W / n;
  const index = Math.max(0, segments.findIndex((s) => s.value === sel));
  const indexRef = useLatest(index);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const liftV = useRef(0);
  const [pressedIdx, setPressedIdx] = useState(-1);

  const centreOf = (i: number) => segW * i + segW / 2;
  const render = () => {
    const t = thumbRef.current;
    if (!t) return;
    const l = Math.max(0, liftV.current);
    const tw = (segW - 2 * G.inset) * (1 + (G.liftScale - 1) * l);
    const th = (G.height - 2 * G.inset) * (1 + (G.liftScale - 1) * l);
    t.style.width = `${tw}px`;
    t.style.height = `${th}px`;
    t.style.transform = `translate(${x.value - tw / 2}px, ${G.height / 2 - th / 2}px)`;
    t.style.opacity = String(Math.max(0, 1 - 1.6 * l));
  };
  const x = useMotion(centreOf(index), springs.tabLensMove, render); // TODO(unknown): CT §5.2 move spring; tab lens move (0.85, 0.4)
  const lift = useLift((v) => {
    liftV.current = v;
    render();
  });
  useLens(rootRef, () => {
    const l = Math.max(0, liftV.current);
    return {
      cx: x.value,
      cy: G.height / 2,
      w: (segW - 2 * G.inset) * (1 + (G.liftScale - 1) * l),
      h: (G.height - 2 * G.inset) * (1 + (G.liftScale - 1) * l),
      amount: l,
      squash: squashFromVelocity(x.velocity, 0.0003, 0.12), // CT §5.2 up to sx 1.12 / sy 0.86
    };
  });

  const dragging = useRef(false);
  useEffect(() => {
    if (dragging.current) return;
    const target = centreOf(index);
    if (Math.abs(x.target - target) < 0.5) {
      render();
      return;
    }
    // Tap at touch-up: lift, travel, land and un-lift (CT §5.2 un-lifted by ≈0.47 s).
    lift.lift(390 / 20);
    x.set(target);
    lift.unlift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, segW]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el || disabled) return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const r = el.getBoundingClientRect();
      const local = (cx: number) => ((cx - r.left) / r.width) * W;
      const i0 = segmentAt(local(e.clientX), W, n);
      const onThumb = i0 === indexRef.current;
      if (onThumb) lift.lift(390 / 20);
      else setPressedIdx(i0);
      ctx.gestures.track(e, {
        decide: ({ dx, dy }) => {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return 'fail';
          return onThumb && Math.abs(dx) > 4 ? 'claim' : 'wait';
        },
        onBegin: () => {
          dragging.current = true;
        },
        onMove: (s) => {
          const lx = Math.min(W - segW / 2, Math.max(segW / 2, local(s.event.clientX)));
          x.set(lx, { params: LENS_TRACKING });
        },
        onEnd: (s) => {
          dragging.current = false;
          const i = segmentAt(local(s.event.clientX), W, n);
          x.set(centreOf(i));
          lift.unlift();
          if (i !== indexRef.current) setSel(segments[i]!.value);
        },
        onCancel: () => {
          dragging.current = false;
          setPressedIdx(-1);
          lift.unlift();
          x.set(centreOf(indexRef.current));
        },
        onTap: (s) => {
          setPressedIdx(-1);
          const i = segmentAt(local(s.event.clientX), W, n);
          if (onThumb) lift.unlift();
          if (i !== indexRef.current) setSel(segments[i]!.value);
        },
      });
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, ctx.gestures, W, n, segW, segments]);

  const onKey = (e: React.KeyboardEvent) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const i = Math.min(n - 1, Math.max(0, index + d));
    setSel(segments[i]!.value);
    (rootRef.current?.querySelectorAll('[role=radio]')[i] as HTMLElement | undefined)?.focus();
  };

  return (
    <div
      ref={rootRef}
      role="radiogroup"
      onKeyDown={onKey}
      className={className}
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: W,
        height: G.height,
        borderRadius: G.radius,
        background: cssVar('segmentedBackground'),
        opacity: disabled ? 0.5 : 1,
        verticalAlign: 'middle',
        touchAction: 'pan-y',
        flex: 'none',
        ...style,
      }}
      {...aria}
    >
      <div
        ref={thumbRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: segW - 2 * G.inset,
          height: G.height - 2 * G.inset,
          borderRadius: G.thumbRadius,
          // CT §5.1 model fill #FFFFFF (light). TODO(unknown): dark thumb colour not pixel-verified; systemGray3-ish.
          background: ctx.appearance === 'dark' ? 'rgba(235,235,245,0.3)' : cssVar('segmentedThumb'), // CT §5.1 JSON: dark #EBEBF5@0.30
          // No shadow: the iOS 27 reference render has none.
          transform: `translate(${centreOf(index) - (segW - 2 * G.inset) / 2}px, ${G.inset}px)`,
          pointerEvents: 'none',
        }}
      />
      {segments.map((s, i) => (
        <button
          key={String(s.value)}
          type="button"
          role="radio"
          aria-checked={i === index}
          aria-label={s['aria-label']}
          tabIndex={i === index ? 0 : -1}
          disabled={disabled}
          style={{
            position: 'relative',
            flex: '1 1 0',
            minWidth: 0,
            height: '100%',
            border: 'none',
            background: 'transparent',
            padding: '0 6px',
            fontFamily: 'inherit',
            fontSize: 13, // CT §5.1 13 pt
            fontWeight: i === index ? 510 : 400, // selected Medium, others Regular
            letterSpacing: 0, // SF tracking is already applied by the system font in Chrome (size audit: widths match iOS at 0)
            color: cssVar('label'),
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            cursor: disabled ? 'default' : 'pointer',
            opacity: pressedIdx === i ? 0.4 : 1, // TODO(unknown): dim amount; CT §5.2 gives only the 0.47 s curve
            transition: 'opacity 0.47s cubic-bezier(0.25,0.1,0.25,1), font-weight 0.2s',
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
