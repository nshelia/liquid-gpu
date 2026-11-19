import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Animator, reducedMotionSpring, type Appearance, type SpringParams } from '@liquid-gpu/core';
import { createRenderer, type Layer, type Renderer, type RGBA } from '@liquid-gpu/gpu';
import {
  LiquidContext,
  type LiquidContextValue,
  type LiquidRootMode,
  type OverlayPlacement,
  type RendererMode,
  type SafeAreaInsets,
} from './context';
import { GestureArena } from './gestures';
import { injectTheme, resolveTheme, themeKey, themeVars, type ThemeOverrides } from './theme';
import { SceneRegistry } from './registry';
import { createFrameScheduler } from './frameScheduler';
import { LayerView } from './Layer';
import { zBands } from './zBands';

export type AppearanceSetting = 'system' | 'light' | 'dark';

export interface LiquidRootProps {
  /** `system` follows `prefers-color-scheme`. Default `system`. */
  appearance?: AppearanceSetting;
  /** Force the CSS renderer (also `?fallback` in the URL when `fallbackFromQuery` is true). */
  fallback?: boolean;
  /** Read `?fallback` from the URL. Default true. */
  fallbackFromQuery?: boolean;
  /** Override safe-area insets (default: `env(safe-area-inset-*)`). */
  safeArea?: Partial<SafeAreaInsets>;
  /** Canvas clear colour. Default: transparent (the root's CSS background shows through). */
  clearColor?: RGBA;
  /** Render children into a full-viewport base layer (z 0). Default true. Turn off when every child portals its own layers. */
  baseLayer?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Called once the renderer exists. */
  onReady?(ctx: LiquidContextValue): void;
  /**
   * `fullscreen` (default): the root covers the viewport. `inline`: the root sizes to its container (give the
   * container a height, or use `autoHeight`), safe area zero, rendering pauses while scrolled out of view; use it
   * for UI embedded in a page or chat message (several inline roots may coexist).
   */
  mode?: 'fullscreen' | 'inline';
  /** Inline only: the root takes its height from its content (base layer), e.g. a card in a chat transcript. */
  autoHeight?: boolean;
  /**
   * Inline only: where overlays wrapped in `OverlayPortal` (Alert, Toast, Popover) are drawn. `page` (default): a
   * transparent page-level root above everything (CSS renderer, so its glass blurs the real page). `contained`:
   * inside this root, clipped to it. Menus, context menus and sheets are always contained.
   */
  overlays?: OverlayPlacement;
  /**
   * Inline only: at most this many inline/overlay roots on the page use WebGPU canvases (they all share one
   * GPUDevice); further roots use the CSS renderer. Default 4. Fullscreen roots are not capped.
   */
  maxGpuRoots?: number;
  /** Inline only: pause drawing while the root is scrolled out of view (IntersectionObserver). Default true. */
  pauseOffscreen?: boolean;
  /** Theme overrides applied as CSS variables scoped to this root (see `ThemeOverrides`). */
  theme?: ThemeOverrides;
  children?: ReactNode;
}

/** Internal props: `mode="overlay"` is used by `OverlayPortal`. */
type InternalProps = Omit<LiquidRootProps, 'mode'> & { mode?: LiquidRootMode };

function readEnvInsets(): SafeAreaInsets {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const v = {
    top: parseFloat(cs.paddingTop) || 0,
    right: parseFloat(cs.paddingRight) || 0,
    bottom: parseFloat(cs.paddingBottom) || 0,
    left: parseFloat(cs.paddingLeft) || 0,
  };
  probe.remove();
  return v;
}

function useMedia(query: string): boolean {
  const get = () => typeof matchMedia !== 'undefined' && matchMedia(query).matches;
  const [v, setV] = useState(get);
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return;
    const mq = matchMedia(query);
    const on = () => setV(mq.matches);
    mq.addEventListener('change', on);
    on();
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return v;
}

interface Core {
  renderer: Renderer;
  animator: Animator;
  host: HTMLElement;
  mode: RendererMode;
  gestures: GestureArena;
  requestFrame(): void;
  onBeforeFrame(cb: () => void): () => void;
  registerHitLayer(layer: Layer): () => void;
  invalidateHitOrder(): void;
  registry: SceneRegistry;
  /** Pause drawing (scrolled out of view); a resume redraws once. */
  setPaused(p: boolean): void;
  destroy(): void;
}

/**
 * Frame scheduling:
 * - css: one `renderer.frame()` in the Animator's frame callback when something changed.
 * - webgpu: the same rAF draw, plus a redraw from the canvas `paint` event when it re-captured layers (content
 *   changes arrive there, after rAF). So a frame draws once, or twice when both springs and DOM content changed.
 *   `requestPaint()` is never called from rAF: in Chrome 157 that re-runs rAF callbacks inside the same rendering
 *   update and can loop forever (observed: dt = 0 ticks, main thread stuck).
 */
function startCore(renderer: Renderer, host: HTMLElement): Core {
  const animator = new Animator(createFrameScheduler());
  const before = new Set<() => void>();
  let dirty = true;
  // Hit-test order (webgpu): Chrome 157 hit-tests overlapping drawable children by the order of their latest
  // geometry update (the last `updateElementGeometry` wins), not by z-index or DOM order. The renderer updates the
  // geometry of every layer that moved, so after such a frame the root re-issues the geometry of the layers above the
  // lowest moved one, in ascending z.
  const hitLayers = new Set<Layer>();
  // Layers added or reordered whose geometry has not been sent since their first capture. A geometry update sent
  // before a drawable's first paint can be lost, which left new identity-transform layers (never "moved", so never
  // re-sent) un-hit-testable. They force a re-send (theirs and everything above, in z order) on each draw until sent
  // once after capture (bounded, for layers that never get a capture, e.g. zero-size).
  const freshHits = new Map<Layer, number>();
  const FRESH_MAX_DRAWS = 120;
  let hitDirty = false;
  let hitRepeat = 0;
  const geo = host as HTMLCanvasElement & {
    updateElementGeometry?: (el: Element, o: { canvasTransform: DOMMatrix }) => void;
  };
  const offscreen = new DOMMatrix().translate(-1e5, -1e5);
  const snap = new WeakMap<Layer, string>();
  const keyOf = (l: Layer) => {
    const m = l.transform;
    return l.visible ? `${m.a},${m.b},${m.c},${m.d},${m.e},${m.f}` : 'hidden';
  };
  const reorderHits = () => {
    if (renderer.kind !== 'webgpu' || !geo.updateElementGeometry) {
      // No hit geometry to send (CSS renderer): clear the request, or `draw` keeps re-arming a frame forever and the
      // root never idles (measured: renderer.frame() every vsync on iPhone / Safari / Firefox).
      hitDirty = false;
      hitRepeat = 0;
      freshHits.clear();
      return;
    }
    const list = [...hitLayers].filter((l) => l.element.isConnected);
    let minChanged = Infinity;
    for (const l of list) {
      const k = keyOf(l);
      if (snap.get(l) !== k) {
        snap.set(l, k);
        minChanged = Math.min(minChanged, l.z);
      }
    }
    for (const [l, n] of freshHits) {
      if (!l.element.isConnected) {
        freshHits.delete(l);
        continue;
      }
      minChanged = Math.min(minChanged, l.z);
      // Sent below; done once the element has a capture (`captured` is undefined outside the webgpu renderer).
      if (l.captured !== false || n >= FRESH_MAX_DRAWS) freshHits.delete(l);
      else freshHits.set(l, n + 1);
    }
    if (hitDirty) {
      minChanged = -Infinity;
      if (hitRepeat > 0) hitRepeat--;
      else hitDirty = false;
    }
    if (minChanged === Infinity) return;
    list.sort((a, b) => a.z - b.z || (a.element.compareDocumentPosition(b.element) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    for (const l of list) {
      if (l.z < minChanged) continue;
      geo.updateElementGeometry(l.element, { canvasTransform: l.visible ? l.transform : offscreen });
    }
  };
  let paused = false;
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  const registry = new SceneRegistry(renderer, () => {
    core.requestFrame();
    // Paused roots do not draw: still release removed layers/glass soon.
    if (paused && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        registry.flush();
      }, 100);
    }
  });
  const draw = () => {
    if (paused) return;
    dirty = false;
    registry.flush();
    for (const cb of before) cb();
    renderer.frame();
    reorderHits();
    if (hitDirty) setTimeout(() => core.requestFrame(), 0);
  };
  let offFrame: () => void;
  const canvas = host as HTMLCanvasElement & { onpaint?: ((e: Event) => void) | null };
  let restorePaint: (() => void) | null = null;
  if (renderer.kind === 'webgpu') {
    // The paint event (after layout/paint, once per rendering update) captures changed layers; redraw then so the
    // new textures show this frame. Draw from rAF otherwise. Never request a paint from rAF: in Chrome 157 that
    // re-dispatches paint and re-runs rAF callbacks inside the same update (an endless dt = 0 loop).
    const orig = canvas.onpaint ?? null;
    canvas.onpaint = (ev: Event) => {
      orig?.call(canvas, ev);
      const changed = (ev as Event & { changedElements?: ReadonlyArray<Element> }).changedElements;
      if (!changed || changed.length > 0 || dirty) {
        draw();
      }
    };
    restorePaint = () => {
      canvas.onpaint = orig;
    };
  }
  offFrame = animator.onFrame(() => {
    if (!dirty) return;
    draw();
  });
  const gestures = new GestureArena();
  const core: Core = {
    renderer,
    animator,
    host,
    mode: renderer.kind,
    gestures,
    requestFrame() {
      dirty = true;
      animator.wake();
    },
    onBeforeFrame(cb) {
      before.add(cb);
      return () => {
        before.delete(cb);
      };
    },
    registerHitLayer(layer) {
      hitLayers.add(layer);
      freshHits.set(layer, 0);
      hitDirty = true;
      hitRepeat = 3;
      core.requestFrame();
      return () => {
        hitLayers.delete(layer);
        freshHits.delete(layer);
      };
    },
    invalidateHitOrder() {
      for (const l of hitLayers) if (l.captured === false && !freshHits.has(l)) freshHits.set(l, 0);
      hitDirty = true;
      hitRepeat = 3;
      core.requestFrame();
    },
    registry,
    setPaused(p) {
      if (p === paused) return;
      paused = p;
      if (!p) core.requestFrame();
    },
    destroy() {
      if (flushTimer) clearTimeout(flushTimer);
      registry.destroy();
      offFrame();
      restorePaint?.();
      animator.stop();
      gestures.destroy();
      before.clear();
      renderer.destroy();
    },
  };
  animator.wake();
  return core;
}

/**
 * The root of a liquid-gpu UI. Owns one full-viewport `<canvas content="drawable" layoutsubtree>` (or the CSS
 * fallback `<div>`), the renderer, one core `Animator`, the gesture arena and the theme variables.
 */
export function LiquidRoot(props: LiquidRootProps) {
  return <LiquidRootImpl {...props} />;
}

const ZERO_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
const DEFAULT_MAX_GPU_ROOTS = 4;

/** @internal LiquidRoot with the internal `overlay` mode (OverlayPortal). */
export function LiquidRootImpl({
  mode = 'fullscreen',
  autoHeight = false,
  overlays = 'page',
  maxGpuRoots = DEFAULT_MAX_GPU_ROOTS,
  pauseOffscreen = true,
  theme,
  appearance: appearanceSetting = 'system',
  fallback,
  fallbackFromQuery = true,
  safeArea: safeAreaOverride,
  clearColor,
  baseLayer = true,
  className,
  style,
  onReady,
  children,
}: InternalProps) {
  const inline = mode === 'inline';
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [core, setCore] = useState<Core | null>(null);
  const prefersDark = useMedia('(prefers-color-scheme: dark)');
  const reducedMotion = useMedia('(prefers-reduced-motion: reduce)');
  const reducedTransparency = useMedia('(prefers-reduced-transparency: reduce)');
  const appearance: Appearance = appearanceSetting === 'system' ? (prefersDark ? 'dark' : 'light') : appearanceSetting;
  const appearanceRef = useRef(appearance);
  appearanceRef.current = appearance;

  const [viewport, setViewport] = useState(() => ({
    width: typeof innerWidth === 'number' ? innerWidth : 440,
    height: typeof innerHeight === 'number' ? innerHeight : 956,
  }));
  const [envInsets, setEnvInsets] = useState<SafeAreaInsets>({ top: 0, right: 0, bottom: 0, left: 0 });

  useLayoutEffect(() => injectTheme(), []);

  useLayoutEffect(() => {
    if (inline) {
      // Inline: the viewport is the container's box (ResizeObserver), the safe area is zero.
      const el = containerRef.current;
      if (!el) return;
      const set = (w: number, h: number) =>
        setViewport((v) => (v.width === w && v.height === h ? v : { width: w, height: h }));
      const r = el.getBoundingClientRect();
      set(r.width, r.height);
      const ro = new ResizeObserver((entries) => {
        const b = entries[entries.length - 1]?.contentBoxSize?.[0];
        if (b) set(b.inlineSize, b.blockSize);
        else set(el.clientWidth, el.clientHeight);
      });
      ro.observe(el);
      return () => ro.disconnect();
    }
    const onResize = () => {
      setViewport({ width: innerWidth, height: innerHeight });
      setEnvInsets(readEnvInsets());
    };
    onResize();
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, [inline]);

  const forceFallback =
    mode === 'overlay' ||
    (fallback ?? (fallbackFromQuery && typeof location !== 'undefined' && new URLSearchParams(location.search).has('fallback')));
  const maxGpuRenderers = mode === 'fullscreen' ? undefined : maxGpuRoots;

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    let made: Core | null = null;
    const canvas = document.createElement('canvas');
    canvas.className = 'lq-host';
    canvas.setAttribute('content', 'drawable');
    canvas.setAttribute('layoutsubtree', '');
    container.appendChild(canvas);
    // Start in a microtask: a mount that is torn down at once (StrictMode's mount → unmount → mount) never creates a
    // renderer. Otherwise its pending WebGPU creation would still count against `maxGpuRenderers` when the remount
    // asks, and every capped inline root would fall back to CSS.
    Promise.resolve()
      .then(() =>
        cancelled
          ? null
          : createRenderer(canvas, { appearance: appearanceRef.current, forceFallback, autoFrameOnPaint: false, clearColor, maxGpuRenderers }),
      )
      .then((renderer) => {
        if (!renderer) return;
        const host = canvas.isConnected
          ? (canvas as HTMLElement)
          : (container.querySelector(':scope > [data-liquid-fallback]') as HTMLElement | null);
        if (cancelled || !host) {
          renderer.destroy();
          host?.remove();
          return;
        }
        host.classList.add('lq-host');
        container.dataset.renderer = renderer.kind;
        made = startCore(renderer, host);
        setCore(made);
      })
      .catch((e) => {
        console.error('[liquid-gpu] renderer creation failed', e);
      });
    return () => {
      cancelled = true;
      if (made) {
        made.destroy();
        made.host.remove();
      } else canvas.remove();
      setCore(null);
    };
    // The renderer is created once per mount (and when the fallback choice changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceFallback]);

  useLayoutEffect(() => {
    if (!core) return;
    core.renderer.setAppearance(appearance);
    core.requestFrame();
  }, [core, appearance]);

  const safeArea = useMemo<SafeAreaInsets>(
    () => ({ ...(inline ? ZERO_INSETS : envInsets), ...safeAreaOverride }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inline, envInsets, safeAreaOverride?.top, safeAreaOverride?.right, safeAreaOverride?.bottom, safeAreaOverride?.left],
  );

  // Inline: pause drawing while scrolled out of view.
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const el = containerRef.current;
    if (!inline || !pauseOffscreen || !el || typeof IntersectionObserver === 'undefined') {
      setOnScreen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        const e = entries[entries.length - 1];
        if (e) setOnScreen(e.isIntersecting);
      },
      { rootMargin: '100px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [inline, pauseOffscreen]);
  useEffect(() => {
    core?.setPaused(!onScreen);
  }, [core, onScreen]);

  const tKey = themeKey(theme);
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const resolvedTheme = useMemo(
    () => resolveTheme(themeRef.current, appearance),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tKey, appearance],
  );
  const scopedVars = useMemo(
    () => themeVars(themeRef.current, appearance),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tKey, appearance],
  );
  const clientOrigin = useMemo(() => {
    if (!inline) return () => ({ x: 0, y: 0 });
    return () => {
      const r = (core?.host ?? containerRef.current)?.getBoundingClientRect();
      return r ? { x: r.left, y: r.top } : { x: 0, y: 0 };
    };
  }, [inline, core]);

  // Inline autoHeight: the root's height follows the base layer's content height.
  const [autoH, setAutoH] = useState<number | null>(null);
  const [baseLayer_, setBaseLayer_] = useState<Layer | null>(null);
  const useAuto = inline && autoHeight;
  const baseRef = useCallback((l: Layer | null) => setBaseLayer_(l), []);
  useLayoutEffect(() => {
    const el = baseLayer_?.element;
    if (!useAuto || !el) return;
    const set = (h: number) => setAutoH((p) => (p !== null && Math.abs(p - h) < 0.5 ? p : h));
    set(el.offsetHeight);
    const ro = new ResizeObserver((entries) => {
      const b = entries[entries.length - 1]?.borderBoxSize?.[0];
      set(b ? b.blockSize : el.offsetHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [useAuto, baseLayer_]);

  const ctx = useMemo<LiquidContextValue | null>(() => {
    if (!core) return null;
    return {
      renderer: core.renderer,
      animator: core.animator,
      appearance,
      mode: core.mode,
      safeArea,
      viewport,
      host: core.host,
      requestFrame: core.requestFrame,
      onBeforeFrame: core.onBeforeFrame,
      registerHitLayer: core.registerHitLayer,
      invalidateHitOrder: core.invalidateHitOrder,
      gestures: core.gestures,
      reducedMotion,
      reducedTransparency,
      spring: (p: SpringParams) => (reducedMotion ? reducedMotionSpring(p) : p),
      rootMode: mode,
      clientOrigin,
      registry: core.registry,
      theme: resolvedTheme,
      themeOverrides: themeRef.current,
      overlays,
      onScreen,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [core, appearance, safeArea, viewport, reducedMotion, reducedTransparency, mode, clientOrigin, resolvedTheme, overlays, onScreen]);

  const readyFired = useRef(false);
  useEffect(() => {
    if (ctx && !readyFired.current) {
      readyFired.current = true;
      onReady?.(ctx);
    }
  }, [ctx, onReady]);

  useEffect(() => {
    if (ctx) ctx.requestFrame();
  }, [ctx]);

  const rootStyle: CSSProperties = {
    ['--lq-dpr' as string]: typeof devicePixelRatio === 'number' ? devicePixelRatio : 1,
    ...scopedVars,
    ...(useAuto ? { height: autoH ?? 1 } : null),
    ...style,
  };
  return (
    <div
      ref={containerRef}
      className={['lq-root', className].filter(Boolean).join(' ')}
      data-appearance={appearance}
      data-mode={mode}
      style={rootStyle}
    >
      {ctx && (
        <LiquidContext.Provider value={ctx}>
          {baseLayer ? (
            <LayerView
              ref={baseRef}
              z={zBands.base}
              aria-label={undefined}
              height={useAuto ? 'auto' : undefined}
            >
              {children}
            </LayerView>
          ) : (
            children
          )}
        </LiquidContext.Provider>
      )}
    </div>
  );
}
