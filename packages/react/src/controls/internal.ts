/**
 * Shared internals for controls: controllable state, latest-ref, and the liquid lens (`_UILiquidLensView`) used by
 * the switch knob, slider thumb and segmented selection.
 *
 * Lens model (components/controls.md §12.3, deep/motion §1): a rest-size opaque thumb (DOM) that, while lifted,
 * hands over to a `lens` glass shape of the lifted size. Lift spring (ζ 0.625, 0.27) with a width kick of ≈390 pt/s,
 * un-lift spring (ζ 0.7, 0.5), hang time 0.22 s. Reduce Motion disables the animated lift (MO §1).
 */
import { createMotion } from './motion';
import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { springs } from '@liquid-gpu/core';
import type { GlassShape } from '@liquid-gpu/gpu';
import { affineScale, transformRect, useGlassCore, useLiquid, type GlassGeometry, type SpringHandle } from '../root';

export function useLatest<T>(v: T): RefObject<T> {
  const r = useRef(v);
  r.current = v;
  return r;
}

/** Controlled when `value` is defined, otherwise internal state seeded by `defaultValue`. */
export function useControllable<T>(value: T | undefined, defaultValue: T, onChange?: (v: T) => void): [T, (v: T) => void] {
  const [inner, setInner] = useState(defaultValue);
  const controlled = value !== undefined;
  const current = controlled ? value : inner;
  const cb = useLatest(onChange);
  const set = useCallback(
    (v: T) => {
      if (!controlled) setInner(v);
      cb.current?.(v);
    },
    [controlled, cb],
  );
  return [current, set];
}

export interface LensRect {
  /** Centre and size in the control's local coordinates (pt). */
  cx: number;
  cy: number;
  w: number;
  h: number;
  /** 0…1: how much of the lens glass is shown (the lift amount). */
  amount: number;
  /** Velocity squash (area preserving): sx = 1 + k, sy = 1/(1 + k). */
  squash?: number;
}

/**
 * A `lens` glass shape positioned in the local coordinates of `rootRef` (the control element, inside its layer).
 * `getRect` is read every frame; return `amount` 0 to hide the lens.
 */
/** Per-control lens glass: the slider thumb has no colour fringing and refracts −11.1 pt. */
export interface LensGlass {
  aberration?: number;
  innerRefraction?: number;
}

export function useLens(rootRef: RefObject<HTMLElement | null>, getRect: () => LensRect, glass: LensGlass = {}): GlassShape | null {
  const get = useLatest(getRect);
  const onGeometry = (g: GlassGeometry, shape: GlassShape) => {
    const r = get.current();
    const k = r.squash ?? 0;
    const w = r.w * (1 + k);
    const h = r.h / (1 + k);
    const local = { x: g.local.x + r.cx - w / 2, y: g.local.y + r.cy - h / 2, width: w, height: h };
    shape.rect = transformRect(g.matrix, local);
    shape.radius = (Math.min(w, h) / 2) * affineScale(g.matrix);
    shape.visible = g.visible && r.amount > 0.02;
    // The lifted liquid lens refracts (gpu `lens` style draws the refracting lens while pressed).
    shape.pressed = r.amount > 0.02;
    shape.pressAmount = Math.min(1, Math.max(0, r.amount));
    shape.aberration = glass.aberration;
    shape.innerRefraction = glass.innerRefraction;
  };
  return useGlassCore(rootRef, { style: 'lens' }, onGeometry).shape;
}

/** Lift controller: a spring 0 (rest) … 1 (lifted) with the lens lift/un-lift springs and the 0.22 s hang time. */
export function useLift(onChange: (v: number) => void) {
  const ctx = useLiquid();
  const cb = useLatest(onChange);
  const state = useRef({ value: 0, liftedAt: 0, timer: 0 as ReturnType<typeof setTimeout> | 0 });
  const spring = useRef<SpringHandle | null>(null);
  // Lazily created so the hook works with the root's spring factory.
  const handle = () => {
    if (!spring.current) {
      spring.current = createLiftSpring(ctx, (v) => {
        state.current.value = v;
        cb.current(v);
      });
    }
    return spring.current;
  };
  useLayoutEffect(
    () => () => {
      spring.current?.dispose();
      spring.current = null;
      if (state.current.timer) clearTimeout(state.current.timer);
    },
    [],
  );
  const lift = useCallback(
    (widthVelocity = 0) => {
      if (state.current.timer) clearTimeout(state.current.timer);
      state.current.timer = 0;
      state.current.liftedAt = performance.now();
      if (ctx.reducedMotion) {
        handle().snap(0);
        return;
      }
      // MO §1: the lift needs a starting velocity (≈390 pt/s on a 21 pt width change → normalised).
      handle().set(1, { params: springs.lensLift, velocity: widthVelocity });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ctx.reducedMotion],
  );
  const unlift = useCallback((hang = true) => {
    if (state.current.timer) clearTimeout(state.current.timer);
    const wait = hang ? Math.max(0, 220 - (performance.now() - state.current.liftedAt)) : 0; // CT §2.3 lensHangTime
    const go = () => {
      state.current.timer = 0;
      handle().set(0, { params: springs.lensUnlift });
    };
    if (wait > 0) state.current.timer = setTimeout(go, wait);
    else go();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return { lift, unlift, value: () => state.current.value };
}

function createLiftSpring(ctx: ReturnType<typeof useLiquid>, onChange: (v: number) => void): SpringHandle {
  const s = createMotion(ctx, 0, springs.lensLift);
  s.subscribe(onChange);
  return s;
}

/** Track a value's velocity from successive samples (pt/s), for the lens squash. */
export function squashFromVelocity(v: number, k = 0.00004, max = 0.12): number {
  // CT §5.2 squash up to sx 1.12 / sy 0.86 at peak velocity (~3000 pt/s); TODO(unknown): exact law.
  return Math.max(-max, Math.min(max, Math.abs(v) * k));
}

/** CT §2.3 `_UILiquidLensViewSmallVariantSpec` tracking spring (response 0.15, ζ 0.86): a dragged lens follows. */
export const LENS_TRACKING = { dampingRatio: 0.86, response: 0.15 };
