/**
 * Interactive glass press / drag stretch and glow (`_UIFlexInteraction`), driven by core springs.
 *
 * - Press lift + drag stretch: core `flexTransform` [deep/glass-drag/findings.md §3–4], targets retargeted on every
 *   move with the size-resolved tracking spring, then the release spring [GD §6] (`resolveFlexSpec`).
 * - Glow [GD §7]: shows at the touch point with (1.0, 0.1), follows the clamped finger with (1.0, 0.15),
 *   dissipates beyond `littleGlowDissipationDistance` (scale 2, opacity ½, spring (1, 0.5)), and on release scales
 *   to 4 while fading out with (1, 0.5).
 * - Chromatic aberration only while pressed [glass-render §3]: `pressed` + `pressAmount` (glow-show spring).
 */
import { useMemo, useRef } from 'react';
import { flexGlow, flexTransform, resolveFlexSpec, springs, type FlexVariant, type Pt } from '@liquid-gpu/core';
import type { GlassShape, Rect } from '@liquid-gpu/gpu';
import { useLiquid } from './context';
import type { GestureRecognizer } from './gestures';
import { createSpring, type SpringHandle } from './useSpring';

export interface FlexState {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
  pressed: boolean;
  pressAmount: number;
  glow: Pt | undefined;
  glowOpacity: number;
  glowScale: number;
}

export interface FlexController {
  /** Start a press. `rect` is the glass rect in canvas coordinates at touch-down. Returns the arena recognizer. */
  begin(e: PointerEvent, rect: Rect): void;
  /** Update with the current finger (client coordinates). */
  move(clientX: number, clientY: number): void;
  release(): void;
  readonly active: boolean;
  /** Current values (read inside the frame). */
  state(): FlexState;
  /** Write the state into a glass shape. */
  apply(shape: GlassShape): void;
  /** Transform for content drawn on top of the glass, about the rect centre. */
  contentMatrix(rect: Rect): DOMMatrix;
  /** A recognizer for the gesture arena: claims a drag (stretch) unless `yieldToScroll`, then fails on movement. */
  recognizer(opts?: { yieldToScroll?: boolean; isInside?: (x: number, y: number) => boolean }): GestureRecognizer;
  dispose(): void;
}

export interface UseFlexOptions {
  variant?: FlexVariant;
}

/** Hook form of the flex controller (springs live while the component is mounted). */
export function useFlex(opts: UseFlexOptions = {}): FlexController {
  const ctx = useLiquid();
  const variantRef = useRef(opts.variant ?? 'automatic');
  variantRef.current = opts.variant ?? 'automatic';
  return useMemo(() => createFlexController(ctx, () => variantRef.current), [ctx.animator]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function createFlexController(
  ctx: Parameters<typeof createSpring>[0] & { clientOrigin?: () => { x: number; y: number } },
  variant: () => FlexVariant = () => 'automatic',
): FlexController {
  const sp = (v: number, p = springs.flexTrackingSmall): SpringHandle => createSpring(ctx, v, p);
  const sx = sp(1);
  const sy = sp(1);
  const tx = sp(0);
  const ty = sp(0);
  const press = sp(0, springs.glowShow);
  const gx = sp(0, springs.glowMove);
  const gy = sp(0, springs.glowMove);
  const gOpacity = sp(0, springs.glowShow);
  const gScale = sp(1, springs.glowShow);
  let down: { local: Pt; rect: Rect } | null = null;
  let dissipated = false;
  let origin = { x: 0, y: 0 };

  const spec = () => (down ? resolveFlexSpec({ w: down.rect.width, h: down.rect.height }, variant()) : resolveFlexSpec({ w: 44, h: 44 }, variant()));

  const pressTo = (finger: Pt) => {
    if (!down) return;
    const s = spec();
    const f = flexTransform({ w: down.rect.width, h: down.rect.height }, down.local, finger, true, s);
    sx.set(f.sx, { params: s.tracking });
    sy.set(f.sy, { params: s.tracking });
    tx.set(f.tx, { params: s.tracking });
    ty.set(f.ty, { params: s.tracking });
  };

  const ctl: FlexController = {
    get active() {
      return !!down;
    },
    begin(e, rect) {
      // Client → canvas coordinates (non-zero only for an inline root); fixed for the whole press.
      origin = ctx.clientOrigin ? ctx.clientOrigin() : { x: 0, y: 0 };
      const cx = e.clientX - origin.x;
      const cy = e.clientY - origin.y;
      down = { local: { x: cx - rect.x, y: cy - rect.y }, rect };
      dissipated = false;
      pressTo(down.local);
      gx.snap(cx);
      gy.snap(cy);
      gScale.snap(1);
      gOpacity.set(1, { params: springs.glowShow });
      press.set(1, { params: springs.glowShow });
      ctx.requestFrame();
    },
    move(clientX, clientY) {
      if (!down) return;
      const cx = clientX - origin.x;
      const cy = clientY - origin.y;
      const r = down.rect;
      const finger = { x: cx - r.x, y: cy - r.y };
      pressTo(finger);
      gx.set(Math.min(r.x + r.width, Math.max(r.x, cx)), { params: springs.glowMove });
      gy.set(Math.min(r.y + r.height, Math.max(r.y, cy)), { params: springs.glowMove });
      const s = spec();
      if (!dissipated && Math.hypot(finger.x - down.local.x, finger.y - down.local.y) > s.littleGlowDissipationDistance) {
        dissipated = true;
        gScale.set(flexGlow.dissipatedScale, { params: springs.glowDissipate });
        gOpacity.set(flexGlow.dissipatedOpacityFactor, { params: springs.glowDissipate });
      }
    },
    release() {
      if (!down) return;
      const s = spec();
      down = null;
      for (const [h, v] of [[sx, 1], [sy, 1], [tx, 0], [ty, 0]] as const) h.set(v, { params: s.release });
      gScale.set(flexGlow.releaseScale, { params: springs.glowHide });
      gOpacity.set(0, { params: springs.glowHide });
      press.set(0, { params: springs.glowHide });
      ctx.requestFrame();
    },
    state() {
      const go = Math.max(0, gOpacity.value);
      return {
        sx: sx.value,
        sy: sy.value,
        tx: tx.value,
        ty: ty.value,
        pressed: !!down,
        pressAmount: Math.max(0, Math.min(1, press.value)),
        glow: go > 0.002 ? { x: gx.value, y: gy.value } : undefined,
        glowOpacity: go,
        glowScale: gScale.value,
      };
    },
    apply(shape) {
      const st = ctl.state();
      shape.flex = { sx: st.sx, sy: st.sy, tx: st.tx, ty: st.ty };
      shape.pressed = st.pressed;
      shape.pressAmount = st.pressAmount;
      shape.glow = st.glow;
      shape.glowOpacity = st.glowOpacity;
      shape.glowScale = st.glowScale;
    },
    contentMatrix(rect) {
      const cx = rect.x + rect.width / 2;
      const cy = rect.y + rect.height / 2;
      return new DOMMatrix()
        .translate(cx + tx.value, cy + ty.value)
        .scale(sx.value, sy.value)
        .translate(-cx, -cy);
    },
    recognizer({ yieldToScroll = false, isInside } = {}) {
      return {
        decide(s) {
          ctl.move(s.event.clientX, s.event.clientY);
          if (Math.hypot(s.dx, s.dy) < 10) return 'wait'; // SMG §7 pan hysteresis 10
          return yieldToScroll ? 'fail' : 'claim';
        },
        onMove(s) {
          ctl.move(s.event.clientX, s.event.clientY);
        },
        onEnd() {
          ctl.release();
        },
        onCancel() {
          ctl.release();
        },
        onTap() {
          ctl.release();
        },
        keepClick(s) {
          return isInside ? isInside(s.event.clientX - origin.x, s.event.clientY - origin.y) : false;
        },
      };
    },
    dispose() {
      for (const h of [sx, sy, tx, ty, press, gx, gy, gOpacity, gScale]) h.dispose();
    },
  };
  return ctl;
}
