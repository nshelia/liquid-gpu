import {
  createElement,
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import type { Layer, Rect } from '@liquid-gpu/gpu';
import { LayerContext, useLayerContext, useLiquid, type LayerContextValue } from './context';

export interface UseLayerOptions {
  /** Draw order (see `zBands`). */
  z: number;
  /** Initial placement in canvas px (the transform is yours to animate afterwards). Default 0, 0. */
  x?: number;
  y?: number;
  /** Hidden layers are not drawn, not hit-testable and `inert`. ANDed with the enclosing layer's visibility. */
  visible?: boolean;
  cornerRadius?: number;
  opacity?: number;
}

/** Keep layer elements in z order in the DOM, so focus and screen-reader order match the drawing order. */
function placeByZ(host: HTMLElement, el: HTMLElement, z: number): void {
  let before: Element | null = null;
  for (const c of Array.from(host.children)) {
    if (c === el || !c.classList.contains('lq-layer')) continue;
    const cz = Number((c as HTMLElement).dataset.lqZ ?? 0);
    if (cz > z) {
      before = c;
      break;
    }
  }
  if (before) {
    if (el.nextElementSibling !== before) host.insertBefore(el, before);
  }
}

/**
 * Register `ref.current` (a direct child of the root host, e.g. rendered with `createPortal(…, useLiquid().host)`)
 * as a drawable layer. Returns the `Layer` handle once registered (null on the first render).
 *
 * The element is absolutely placed at the canvas origin; position it by writing `layer.transform` (then call
 * `requestFrame()`). The renderer re-captures it whenever its rendering changes and follows its size.
 */
export function useLayer(ref: RefObject<HTMLElement | null>, opts: UseLayerOptions): Layer | null {
  const ctx = useLiquid();
  const parent = useLayerContext();
  const [layer, setLayer] = useState<Layer | null>(null);
  const { renderer, host, requestFrame } = ctx;
  const visible = (opts.visible ?? true) && parent.visible;
  const applied = useRef({ visible, cornerRadius: opts.cornerRadius, opacity: opts.opacity });
  applied.current = { visible, cornerRadius: opts.cornerRadius, opacity: opts.opacity };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.classList.add('lq-layer');
    el.dataset.lqZ = String(opts.z);
    el.style.zIndex = String(Math.round(opts.z));
    if (el.parentElement !== host) host.appendChild(el);
    placeByZ(host, el, opts.z);
    // Through the root's registry: removals are batched per frame and a remount of the same element (StrictMode,
    // streamed trees) revives its layer instead of re-allocating it.
    const l = ctx.registry ? ctx.registry.acquireLayer(el, opts.z) : renderer.addLayer(el, opts.z);
    l.transform = new DOMMatrix().translate(opts.x ?? 0, opts.y ?? 0);
    const a = applied.current;
    l.visible = a.visible;
    el.inert = !a.visible;
    if (a.cornerRadius !== undefined) l.cornerRadius = a.cornerRadius;
    if (a.opacity !== undefined) l.opacity = a.opacity;
    const unhit = ctx.registerHitLayer(l);
    setLayer(l);
    requestFrame();
    return () => {
      unhit();
      if (ctx.registry) ctx.registry.releaseLayer(l);
      else l.remove();
      setLayer(null);
      requestFrame();
    };
    // Registration depends only on the element and renderer; the rest is applied below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, host]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!layer || !el) return;
    if (layer.z !== opts.z) ctx.invalidateHitOrder();
    layer.z = opts.z;
    el.dataset.lqZ = String(opts.z);
    el.style.zIndex = String(Math.round(opts.z));
    layer.visible = visible;
    el.inert = !visible;
    if (opts.cornerRadius !== undefined) layer.cornerRadius = opts.cornerRadius;
    if (opts.opacity !== undefined) layer.opacity = opts.opacity;
    requestFrame();
  }, [layer, opts.z, visible, opts.cornerRadius, opts.opacity, requestFrame, ref, ctx]);

  return layer;
}

export interface LayerProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  z: number;
  x?: number;
  y?: number;
  /** CSS width/height of the layer element. Default: the viewport. */
  width?: number | string;
  height?: number | string;
  visible?: boolean;
  cornerRadius?: number;
  opacity?: number;
  /** Element tag. Default `div`. */
  as?: string;
  /** Clip (canvas coordinates) applied to the layer and reported to nested glass. */
  clip?: Rect;
  children?: ReactNode;
}

/**
 * A drawable layer: portals its element into the root host, registers it with the renderer and provides
 * `LayerContext` to its children (nested `<Glass>` follows this layer's transform). The forwarded ref is the
 * `Layer` handle; animate it imperatively.
 */
export const LayerView = forwardRef<Layer | null, LayerProps>(function LayerView(
  { z, x, y, width, height, visible, cornerRadius, opacity, as = 'div', clip, style, children, ...rest },
  ref,
) {
  const ctx = useLiquid();
  const parent = useLayerContext();
  const elRef = useRef<HTMLElement | null>(null);
  const layer = useLayer(elRef, { z, x, y, visible, cornerRadius, opacity });
  useImperativeHandle(ref, () => layer as Layer, [layer]);
  const clipRef = useRef<Rect | undefined>(clip);
  clipRef.current = clip;
  useLayoutEffect(() => {
    if (!layer) return;
    layer.clip = clip;
    ctx.requestFrame();
  }, [layer, clip, ctx]);
  const isVisible = (visible ?? true) && parent.visible;
  const getClip = useCallback(() => clipRef.current, []);
  const value = useMemo<LayerContextValue>(
    () => ({ layer, element: elRef.current, z, visible: isVisible, clip: getClip }),
    [layer, z, isVisible, getClip],
  );
  const s: CSSProperties = {
    width: width ?? ctx.viewport.width,
    height: height ?? ctx.viewport.height,
    ...style,
  };
  const node = createElement(
    as,
    { ...rest, ref: elRef, className: ['lq-layer', rest.className].filter(Boolean).join(' '), style: s },
    <LayerContext.Provider value={value}>{children}</LayerContext.Provider>,
  );
  return createPortal(node, ctx.host);
});
