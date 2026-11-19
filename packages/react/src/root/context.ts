import { createContext, useContext } from 'react';
import type { Animator, Appearance, SpringParams } from '@liquid-gpu/core';
import type { Layer, Rect, Renderer } from '@liquid-gpu/gpu';
import type { GestureArena } from './gestures';
import type { SceneRegistry } from './registry';
import type { ResolvedTheme, ThemeOverrides } from './theme';

export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type RendererMode = 'webgpu' | 'css';

/**
 * - `fullscreen`: the root covers the viewport (position fixed), safe-area insets from `env()`.
 * - `inline`: the root sizes to its container (in flow), safe area zero, canvas coordinates start at its top-left.
 * - `overlay`: internal, a transparent page-level root created by `OverlayPortal` for an inline root's overlays.
 */
export type LiquidRootMode = 'fullscreen' | 'inline' | 'overlay';

/** Where overlays (alerts, toasts, popovers) of an inline root are drawn. */
export type OverlayPlacement = 'page' | 'contained';

export interface LiquidContextValue {
  renderer: Renderer;
  animator: Animator;
  /** Resolved appearance (system → light/dark). */
  appearance: Appearance;
  mode: RendererMode;
  safeArea: SafeAreaInsets;
  /** Viewport (= canvas) size in CSS px. */
  viewport: { width: number; height: number };
  /** Portal target for layers: the drawable canvas (webgpu) or the fallback div (css). */
  host: HTMLElement;
  /** Mark the scene dirty: exactly one `renderer.frame()` runs on the next animation frame. */
  requestFrame(): void;
  /** Called right before each `renderer.frame()`; write layer/glass geometry here. Returns an unsubscribe. */
  onBeforeFrame(cb: () => void): () => void;
  /** Shared pointer-gesture arena. */
  gestures: GestureArena;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  /** Spring params adjusted for `prefers-reduced-motion`. */
  spring(p: SpringParams): SpringParams;
  /**
   * Internal (used by `useLayer`): track a layer for hit-test ordering. Chrome 157 hit-tests drawable children in the
   * order their geometry was first registered, not by z-index or DOM order, so the root re-registers geometry in
   * ascending z whenever the set or a z changes. Returns an unregister.
   */
  registerHitLayer(layer: Layer): () => void;
  /** Internal: a tracked layer's z changed. */
  invalidateHitOrder(): void;
  /** Root mode (see `LiquidRootMode`). */
  rootMode?: LiquidRootMode;
  /**
   * Client (viewport) position of the canvas origin: 0, 0 for a fullscreen root; the root's top-left for an inline
   * root. Canvas coordinates = client coordinates − origin (pointer events, `getBoundingClientRect`).
   */
  clientOrigin?(): { x: number; y: number };
  /** Internal: batched layer/glass registration (see `registry.ts`). */
  registry?: SceneRegistry;
  /** Resolved theme of this root (`useTheme()`). */
  theme?: ResolvedTheme;
  /** Internal: the overrides as passed (forwarded to page-level overlay roots). */
  themeOverrides?: ThemeOverrides;
  /** Inline roots: where `OverlayPortal` content goes. */
  overlays?: OverlayPlacement;
  /** False while the root is scrolled out of view (inline): drawing is paused. */
  onScreen?: boolean;
}

export const LiquidContext = createContext<LiquidContextValue | null>(null);

/** Root services. Throws outside `<LiquidRoot>`. */
export function useLiquid(): LiquidContextValue {
  const v = useContext(LiquidContext);
  if (!v) throw new Error('[liquid-gpu] useLiquid() must be used inside <LiquidRoot>');
  return v;
}

/** Like `useLiquid` but returns null outside a root. */
export function useLiquidOptional(): LiquidContextValue | null {
  return useContext(LiquidContext);
}

/**
 * The drawable layer that encloses a component. Nested glass maps its element's position inside `element`
 * through `layer.transform` to canvas coordinates.
 */
export interface LayerContextValue {
  layer: Layer | null;
  element: HTMLElement | null;
  /** z of the enclosing layer. Nested glass uses z + 1, its content z + 2. */
  z: number;
  /** False when the enclosing layer (or an ancestor) is hidden, e.g. an inactive tab. */
  visible: boolean;
  /** Current clip of the enclosing layer in canvas coordinates, if any. */
  clip(): Rect | undefined;
}

export const LayerContext = createContext<LayerContextValue>({
  layer: null,
  element: null,
  z: 0,
  visible: true,
  clip: () => undefined,
});

export function useLayerContext(): LayerContextValue {
  return useContext(LayerContext);
}

/**
 * Provided by ScrollView so nested glass can follow scrolling: `subscribe` fires after each offset change.
 * `translate(el)` returns any extra translation (rubber band) applied to scrolled content between `el` and the layer.
 */
export interface ScrollContextValue {
  subscribe(fn: () => void): () => void;
  /** Viewport of the scroll view in canvas coordinates (used to clip nested glass content). */
  viewportRect(): Rect | undefined;
}

export const ScrollContext = createContext<ScrollContextValue | null>(null);

/**
 * Provided by surfaces that move their content inside a layer with a CSS translation the layout cannot see (a
 * NavigationStack screen drawn inline in a sheet or cover): `subscribe` fires after each shift, so nested glass
 * re-measures. Unlike `ScrollContext`, it does not make glass behave as if it were in a scroll view.
 */
export interface LayoutShiftContextValue {
  subscribe(fn: () => void): () => void;
}

export const LayoutShiftContext = createContext<LayoutShiftContextValue | null>(null);

/**
 * Base z for screens of a NavigationStack nested in a surface above the root (a sheet): screen i is drawn at
 * base + 10 + 10·i instead of `zBands.screen(i)`. Null at the root.
 */
export const ZBaseContext = createContext<number | null>(null);
