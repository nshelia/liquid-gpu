import {
  createElement,
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { GlassShape, GlassStyle, Layer, Rect, RGBA } from '@liquid-gpu/gpu';
import { LayerContext, ScrollContext, useLayerContext, useLiquid, type LayerContextValue } from './context';
import { multiply, toDOMMatrix, translation } from './geometry';
import { useLayer } from './Layer';
import { useFlex } from './useFlex';
import { useGlassCore, type GlassGeometry } from './useGlass';
import type { FlexVariant } from '@liquid-gpu/core';

export interface GlassProps extends Omit<HTMLAttributes<HTMLElement>, 'style' | 'children'> {
  /** Tag of the content element (the interactive one, e.g. `button`). Default `div`. */
  as?: string;
  /** Glass style: `regular` (default) or `clear` (`lens` for the tab selection). */
  style?: GlassStyle;
  /** Shapes in one group fuse (smooth union, k = `spacing`). */
  group?: string;
  spacing?: number;
  tint?: RGBA | string | null;
  /** Press/drag stretch, glow and pressed aberration. */
  interactive?: boolean;
  /** Flex variant for `interactive` (default automatic by size). */
  flexVariant?: FlexVariant;
  /** Corner radius (pt). Default capsule. */
  radius?: number;
  /**
   * `content` (default): the box takes the content's size. `container`: the content is stretched to the box,
   * which you size with `className` / `boxStyle`.
   */
  fit?: 'content' | 'container';
  /** CSS for the in-flow box (placeholder) that reserves the glass's space in the parent layout. */
  boxStyle?: CSSProperties;
  /** Class of the in-flow box. (`className` also goes there.) */
  className?: string;
  contentStyle?: CSSProperties;
  contentClassName?: string;
  /** Hide the glass and its content. */
  hidden?: boolean;
  /**
   * 0…1 opacity of the glass and its content layer (fade in/out). Default 1. Omit it to drive
   * `handle.shape.opacity` / `handle.layer.opacity` yourself.
   */
  opacity?: number;
  /** Draw order of the glass (content is z + 1). Default: enclosing layer z + 1. */
  z?: number;
  /** For `as="button"`. */
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  children?: ReactNode;
}

export interface GlassHandle {
  shape: GlassShape | null;
  layer: Layer | null;
  content: HTMLElement | null;
  geometry(): GlassGeometry | null;
}

/**
 * `<Glass>`: an in-flow box with a Liquid Glass shape behind it and its content drawn as its own layer on top
 * (so labels stay crisp above the glass). With `interactive`, pointer press and drag apply the flex stretch, glow and
 * pressed aberration from core.
 */
export const Glass = forwardRef<GlassHandle, GlassProps>(function Glass(
  {
    as = 'div',
    style: glassStyle,
    group,
    spacing,
    tint,
    interactive = false,
    flexVariant,
    radius,
    fit = 'content',
    boxStyle,
    className,
    contentStyle,
    contentClassName,
    hidden,
    opacity,
    z: zProp,
    children,
    ...rest
  },
  ref,
) {
  const ctx = useLiquid();
  const parent = useLayerContext();
  const scroll = useContext(ScrollContext);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const z = zProp ?? parent.z + 1;
  const flex = useFlex({ variant: flexVariant });
  const layerRef = useRef<Layer | null>(null);
  const fitRef = useRef(fit);
  fitRef.current = fit;

  const onGeometry = (g: GlassGeometry, shape: GlassShape) => {
    if (interactive) flex.apply(shape);
    const layer = layerRef.current;
    if (!layer) return;
    const base = multiply(g.matrix, translation(g.local.x, g.local.y));
    const m = interactive ? flex.contentMatrix(g.rect).multiply(toDOMMatrix(base)) : toDOMMatrix(base);
    layer.transform = m;
    layer.clip = g.clip;
    layer.visible = g.visible;
  };
  const { shape, geometry } = useGlassCore(
    boxRef,
    { group, style: glassStyle, tint, interactive, spacing, z, radius, visible: !hidden, opacity },
    onGeometry,
  );

  const layer = useLayer(contentRef, { z: z + 1, visible: !hidden && parent.visible, opacity });
  layerRef.current = layer;
  useEffect(() => () => flex.dispose(), [flex]);

  // Size coupling between the in-flow box and the content layer.
  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    // Fractional sizes: offsetWidth/Height round to whole pixels (a 34.33 pt button became 34), so the
    // ResizeObserver border-box size is used; the initial sync falls back to offset sizes until it fires.
    const sync = (size?: { w: number; h: number }) => {
      if (fitRef.current === 'content') {
        const w = size?.w ?? content.offsetWidth;
        const h = size?.h ?? content.offsetHeight;
        if (box.style.width !== `${w}px`) box.style.width = `${w}px`;
        if (box.style.height !== `${h}px`) box.style.height = `${h}px`;
      } else {
        const w = size?.w ?? box.offsetWidth;
        const h = size?.h ?? box.offsetHeight;
        content.style.width = `${w}px`;
        content.style.height = `${h}px`;
      }
    };
    sync();
    const ro = new ResizeObserver((entries) => {
      const b = entries[entries.length - 1]?.borderBoxSize?.[0];
      sync(b ? { w: b.inlineSize, h: b.blockSize } : undefined);
    });
    ro.observe(fit === 'content' ? content : box);
    return () => ro.disconnect();
  }, [fit, layer]);

  // Interactive press: the arena decides between a drag stretch (or yielding to an enclosing scroll) and a tap.
  useEffect(() => {
    const el = contentRef.current;
    if (!el || !interactive) return;
    const onDown = (e: PointerEvent) => {
      const g = geometry.current;
      if (!g || (e.pointerType === 'mouse' && e.button !== 0)) return;
      flex.begin(e, g.rect);
      const r = g.rect;
      ctx.gestures.track(
        e,
        flex.recognizer({
          yieldToScroll: !!scroll,
          isInside: (x, y) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height,
        }),
      );
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [interactive, flex, ctx.gestures, geometry, scroll, layer]);

  useImperativeHandle(
    ref,
    () => ({ shape, layer, content: contentRef.current, geometry: () => geometry.current }),
    [shape, layer, geometry],
  );

  const childCtx = useMemo<LayerContextValue>(
    () => ({ layer, element: contentRef.current, z: z + 1, visible: !hidden && parent.visible, clip: () => geometry.current?.clip }),
    [layer, z, hidden, parent.visible, geometry],
  );

  const contentProps: Record<string, unknown> = {
    ...rest,
    ref: contentRef,
    className: ['lq-glass-content', contentClassName].filter(Boolean).join(' '),
    style: { borderRadius: radius ?? 9999, ...contentStyle },
  };
  if (as === 'button' && contentProps.type === undefined) contentProps.type = 'button';
  const content = createElement(as, contentProps, <LayerContext.Provider value={childCtx}>{children}</LayerContext.Provider>);

  return (
    <>
      <div ref={boxRef} className={['lq-placeholder', className].filter(Boolean).join(' ')} style={boxStyle} aria-hidden="true" />
      {createPortal(content, ctx.host)}
    </>
  );
});
