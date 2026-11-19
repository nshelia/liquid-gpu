/**
 * Scope bar of `.searchable` + `.searchScopes` (SL scopes): shown while search is presented, under the status bar
 * (the navigation bar is hidden). `UISegmentedControl` (20, safeTop, W − 40, 36) on its own regular glass; selection
 * thumb 28 tall inset 4 (r 14), flat at rest (SL composite ≈ #767680@0.165 light, #000@0.69 dark over the glass);
 * labels 15 pt Regular. A tap lifts the liquid lens (h 28 → 39, ×1.38) and moves it like UISegmentedControl.
 */
import { useEffect, useRef, type ReactNode, type Ref } from 'react';
import { springs } from '@liquid-gpu/core';
import { Glass, type GlassHandle } from '../root/Glass';
import { useLiquid } from '../root/context';
import { cssVar } from '../root/theme';
import { useMotion } from '../controls/motion';
import { LENS_TRACKING, squashFromVelocity, useLatest, useLens, useLift } from '../controls/internal';
import { SCOPE, scopeIndexAt } from './logic';

export interface ScopeOption<T> {
  value: T;
  label: ReactNode;
}

export interface ScopeBarProps<T> {
  scopes: readonly ScopeOption<T>[];
  selection: T;
  onChange(value: T): void;
  width: number;
  /** Hidden while search is not presented. */
  hidden?: boolean;
  glassRef?: Ref<GlassHandle>;
}

const LIFT_SCALE = 1.38;

export function ScopeBar<T>({ scopes, selection, onChange, width, hidden, glassRef }: ScopeBarProps<T>) {
  const ctx = useLiquid();
  const n = scopes.length;
  const segW = width / n;
  const index = Math.max(0, scopes.findIndex((s) => s.value === selection));
  const indexRef = useLatest(index);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const thumbRef = useRef<HTMLDivElement | null>(null);
  const liftV = useRef(0);
  const thumbH = SCOPE.height - 2 * SCOPE.inset;
  const centreOf = (i: number) => segW * i + segW / 2;
  const size = (l: number) => ({ w: (segW - 2 * SCOPE.inset) * (1 + (LIFT_SCALE - 1) * l), h: thumbH * (1 + (LIFT_SCALE - 1) * l) });
  const render = () => {
    const t = thumbRef.current;
    if (!t) return;
    const l = Math.max(0, liftV.current);
    const { w, h } = size(l);
    t.style.width = `${w}px`;
    t.style.height = `${h}px`;
    t.style.transform = `translate(${x.value - w / 2}px, ${SCOPE.height / 2 - h / 2}px)`;
    t.style.opacity = String(Math.max(0, 1 - 1.6 * l));
  };
  const x = useMotion(centreOf(index), springs.tabLensMove, render);
  const lift = useLift((v) => {
    liftV.current = v;
    render();
  });
  useLens(rootRef, () => {
    const l = Math.max(0, liftV.current);
    return { cx: x.value, cy: SCOPE.height / 2, ...size(l), amount: l, squash: squashFromVelocity(x.velocity, 0.0003, 0.12) };
  });

  useEffect(() => {
    const target = centreOf(index);
    if (Math.abs(x.target - target) < 0.5) {
      x.snap(target);
      return;
    }
    lift.lift(390 / 20);
    x.set(target);
    lift.unlift();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, segW]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const r = el.getBoundingClientRect();
      const local = (cx: number) => ((cx - r.left) / r.width) * width;
      const onThumb = scopeIndexAt(local(e.clientX), width, n) === indexRef.current;
      if (onThumb) lift.lift(390 / 20);
      ctx.gestures.track(e, {
        decide: ({ dx, dy }) => (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) ? 'fail' : onThumb && Math.abs(dx) > 4 ? 'claim' : 'wait'),
        onMove: (s) => x.set(Math.min(width - segW / 2, Math.max(segW / 2, local(s.event.clientX))), { params: LENS_TRACKING }),
        onEnd: (s) => {
          const i = scopeIndexAt(local(s.event.clientX), width, n);
          x.set(centreOf(i));
          lift.unlift();
          if (i !== indexRef.current) onChange(scopes[i]!.value);
        },
        onCancel: () => {
          lift.unlift();
          x.set(centreOf(indexRef.current));
        },
        onTap: (s) => {
          const i = scopeIndexAt(local(s.event.clientX), width, n);
          if (onThumb) lift.unlift();
          if (i !== indexRef.current) onChange(scopes[i]!.value);
        },
      });
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.gestures, width, n, segW, scopes, onChange]);

  const dark = ctx.appearance === 'dark';
  return (
    <Glass ref={glassRef} hidden={hidden} fit="container" boxStyle={{ width, height: SCOPE.height }} contentStyle={{ pointerEvents: 'auto' }}>
      <div ref={rootRef} role="radiogroup" aria-label="Search scope" style={{ position: 'relative', display: 'flex', width, height: SCOPE.height, touchAction: 'pan-y' }}>
        <div
          ref={thumbRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: segW - 2 * SCOPE.inset,
            height: thumbH,
            borderRadius: thumbH / 2,
            background: dark ? 'rgba(0,0,0,0.69)' : 'rgba(118,118,128,0.165)',
            transform: `translate(${centreOf(index) - (segW - 2 * SCOPE.inset) / 2}px, ${SCOPE.inset}px)`,
            pointerEvents: 'none',
          }}
        />
        {scopes.map((s, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={i === index}
            tabIndex={i === index ? 0 : -1}
            onKeyDown={(e) => {
              const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const j = Math.min(n - 1, Math.max(0, index + d));
              onChange(scopes[j]!.value);
              (rootRef.current?.querySelectorAll('[role=radio]')[j] as HTMLElement | undefined)?.focus();
            }}
            style={{
              position: 'relative',
              flex: '1 1 0',
              minWidth: 0,
              height: '100%',
              border: 'none',
              background: 'transparent',
              padding: '0 6px',
              fontFamily: 'inherit',
              fontSize: SCOPE.fontSize,
              fontWeight: 400,
              color: cssVar('label'),
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              cursor: 'pointer',
            }}
          >
            {s.label}
          </button>
        ))}
      </div>
    </Glass>
  );
}
