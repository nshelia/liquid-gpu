import { createContext, useContext, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { parseColor, type Appearance, type GlassGroup, type GlassShape, type GlassStyle, type Rect, type RGBA } from '@liquid-gpu/gpu';
import { LayoutShiftContext, ScrollContext, useLayerContext, useLiquid, type LayerContextValue } from './context';
import { affineScale, IDENTITY, intersectRects, measureInLayer, rectsEqual, transformRect, type Affine } from './geometry';

export interface GlassOptions {
  /** Shapes in the same group fuse with the smooth-min union (k = spacing). Default: a private group. */
  group?: string;
  /** `regular` (default), `clear`, or `lens` (tab selection). */
  style?: GlassStyle;
  /** `UIGlassEffect.tintColor`: CSS colour or RGBA. */
  tint?: RGBA | string | null;
  /** Interactive glass draws the flex glow layers. */
  interactive?: boolean;
  /** `UIGlassContainerEffect.spacing` (smooth-union k) of the group. */
  spacing?: number;
  /** Draw order. Default: enclosing layer z + 1. */
  z?: number;
  /** Corner radius in pt (local, before the layer's scale). Default: capsule (min(w, h)/2). */
  radius?: number;
  visible?: boolean;
  /**
   * 0…1 opacity of the glass (multiplies the glass and its shadow), e.g. to fade with its content. Applied when it
   * changes; leave it undefined to drive `shape.opacity` yourself (write it, then `requestFrame()`).
   */
  opacity?: number;
}

/** Geometry of a tracked glass, refreshed right before every frame. */
export interface GlassGeometry {
  /** Rect in the enclosing layer's coordinates (layout). */
  local: Rect;
  /** Enclosing layer transform (identity when not inside a layer). */
  matrix: Affine;
  /** Rect in canvas coordinates (before flex). */
  rect: Rect;
  /** Clip for nested content (scroll viewport), canvas coordinates. */
  clip: Rect | undefined;
  visible: boolean;
}

export function toRGBA(t: RGBA | string | null | undefined): RGBA | null {
  if (!t) return null;
  return typeof t === 'string' ? parseColor(t) : t;
}

const isRect = (t: unknown): t is Rect =>
  !!t && typeof (t as Rect).width === 'number' && typeof (t as Rect).x === 'number';

/**
 * Track an element's rect inside its layer: on mount, on resize (ResizeObserver on the element and the layer),
 * on window resize, and on every scroll of an enclosing ScrollView.
 */
export function useLocalRect(
  ref: RefObject<HTMLElement | null> | null,
  layerCtx: LayerContextValue,
  onChange: () => void,
): RefObject<Rect | null> {
  const box = useRef<Rect | null>(null);
  const scroll = useContext(ScrollContext);
  const shift = useContext(LayoutShiftContext);
  const cb = useRef(onChange);
  cb.current = onChange;
  const layerEl = layerCtx.element;
  useLayoutEffect(() => {
    const el = ref?.current;
    if (!el) return;
    const measure = () => {
      const r = measureInLayer(el, layerEl);
      if (!rectsEqual(r, box.current ?? undefined)) {
        box.current = r;
        cb.current();
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (layerEl) ro.observe(layerEl);
    addEventListener('resize', measure);
    const unsub = scroll?.subscribe(measure);
    const unshift = shift?.subscribe(measure);
    return () => {
      ro.disconnect();
      removeEventListener('resize', measure);
      unsub?.();
      unshift?.();
    };
  }, [ref, layerEl, scroll, shift]);
  return box;
}

/**
 * Internal: glass shape + per-frame geometry. `onGeometry` runs inside the frame after the shape was placed.
 */
/**
 * Appearance override for every glass shape below (UIKit `overrideUserInterfaceStyle` on a bar): e.g. Photos'
 * header turns its glass dark while photos are scrolled under it, whatever the app appearance.
 */
export const GlassAppearanceContext = createContext<Appearance | undefined>(undefined);

export function useGlassCore(
  target: RefObject<HTMLElement | null> | Rect | null,
  opts: GlassOptions,
  onGeometry?: (g: GlassGeometry, shape: GlassShape) => void,
): { shape: GlassShape | null; geometry: RefObject<GlassGeometry | null> } {
  const ctx = useLiquid();
  const layerCtx = useLayerContext();
  const scroll = useContext(ScrollContext);
  const appearanceOverride = useContext(GlassAppearanceContext);
  const [shape, setShape] = useState<GlassShape | null>(null);
  const geometry = useRef<GlassGeometry | null>(null);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const geoCb = useRef(onGeometry);
  geoCb.current = onGeometry;
  const rectTarget = isRect(target) ? target : null;
  const refTarget = isRect(target) ? null : target;
  const local = useLocalRect(refTarget, layerCtx, ctx.requestFrame);
  const z = opts.z ?? layerCtx.z + 1;
  const { renderer } = ctx;
  const group = opts.group;
  const tintKey = typeof opts.tint === 'string' ? opts.tint : JSON.stringify(opts.tint ?? null);

  useLayoutEffect(() => {
    const o = optsRef.current;
    const init: GlassGroup = {
      group,
      rect: rectTarget ?? { x: 0, y: 0, width: 0, height: 0 },
      radius: o.radius,
      style: o.style ?? 'regular',
      tint: toRGBA(o.tint),
      interactive: o.interactive ?? false,
      spacing: o.spacing,
      z,
      opacity: o.opacity,
    };
    // Through the root's registry: removals are batched per frame (streamed trees mount/unmount quickly).
    const s = ctx.registry ? ctx.registry.acquireGlass(init) : renderer.addGlass(init);
    s.visible = false;
    setShape(s);
    ctx.requestFrame();
    return () => {
      if (ctx.registry) ctx.registry.releaseGlass(s);
      else s.remove();
      setShape(null);
      ctx.requestFrame();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, group]);

  useLayoutEffect(() => {
    if (!shape) return;
    renderer.configureGroup(shape.group, { style: opts.style ?? 'regular', spacing: opts.spacing, z });
    shape.interactive = opts.interactive ?? false;
    shape.tint = ctx.reducedTransparency
      ? toRGBA(ctx.appearance === 'dark' ? '#1C1C1E' : '#F2F2F7')
      : toRGBA(opts.tint);
    ctx.requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, opts.style, opts.spacing, z, opts.interactive, tintKey, ctx.reducedTransparency, ctx.appearance]);

  useLayoutEffect(() => {
    if (!shape) return;
    shape.appearance = appearanceOverride;
    ctx.requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, appearanceOverride]);

  useLayoutEffect(() => {
    if (!shape || opts.opacity === undefined) return;
    shape.opacity = opts.opacity;
    ctx.requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, opts.opacity]);

  useLayoutEffect(() => {
    if (!shape) return;
    const update = () => {
      const o = optsRef.current;
      let rect: Rect;
      let m: Affine = IDENTITY;
      let loc: Rect;
      if (rectTarget) {
        rect = rectTarget;
        loc = rectTarget;
      } else {
        const l = local.current;
        if (!l) {
          shape.visible = false;
          return;
        }
        loc = l;
        const lt = layerCtx.layer?.transform;
        if (lt) m = { a: lt.a, b: lt.b, c: lt.c, d: lt.d, e: lt.e, f: lt.f };
        rect = transformRect(m, l);
      }
      const layerClip = layerCtx.clip();
      const vp = scroll?.viewportRect();
      let clip = layerClip;
      if (vp) clip = clip ? intersectRects(clip, vp) : vp;
      const inClip = !clip || intersectRects(clip, rect).height > 0.5;
      const visible = (o.visible ?? true) && layerCtx.visible && rect.width > 0 && rect.height > 0 && inClip;
      shape.rect = rect;
      const base = o.radius ?? Math.min(loc.width, loc.height) / 2;
      shape.radius = base * affineScale(m);
      shape.visible = visible;
      const g: GlassGeometry = { local: loc, matrix: m, rect, clip, visible };
      geometry.current = g;
      geoCb.current?.(g, shape);
    };
    update();
    const off = ctx.onBeforeFrame(update);
    ctx.requestFrame();
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shape, rectTarget?.x, rectTarget?.y, rectTarget?.width, rectTarget?.height, layerCtx.layer, layerCtx.visible, scroll]);

  return { shape, geometry };
}

/**
 * `useGlass(ref | rect, opts)`: a Liquid Glass shape behind an element (tracked through its layer, ResizeObserver
 * and layout) or at a fixed canvas rect. Returns the `GlassShape` (null until created); mutate `flex`, `pressed`,
 * `glow…` on it and call `requestFrame()`.
 */
export function useGlass(target: RefObject<HTMLElement | null> | Rect | null, opts: GlassOptions = {}): GlassShape | null {
  return useGlassCore(target, opts).shape;
}
