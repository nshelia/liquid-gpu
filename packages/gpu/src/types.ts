/**
 * Public types shared by the WebGPU renderer and the CSS fallback.
 *
 * Units: every length is in CSS pixels, which this library treats as iOS points (pt).
 * The canvas is sized to the viewport in CSS px; textures are allocated in device pixels.
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Straight (not premultiplied) sRGB colour, components 0…1. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export type Appearance = 'light' | 'dark';

/**
 * - `regular`: the default `UIGlassEffect()` recipe.
 * - `clear`: `UIGlassEffect(style: .clear)`.
 * - `lens`: the tab bar selection "liquid lens" (`_UILiquidLensView`, findings/liquid-glass.md §10):
 *   a lightly blurred, colour-matrixed backdrop at rest and a refracting lens while pressed.
 */
export type GlassStyle = 'regular' | 'clear' | 'lens';

/**
 * Additive flex transform from `_UIFlexInteraction` (deep/glass-drag/findings.md §4).
 * Scale is applied about the shape centre; `tx`/`ty` are the resulting translation (m41/m42) in pt.
 */
export interface Flex {
  sx: number;
  sy: number;
  tx: number;
  ty: number;
}

/**
 * Content seen through a lifted lens (robinWongM/liquid-glass `fsContentLens`): each pixel samples the layer at
 * p + amount·n·w(depth), first with a band `height` deep (plain normals), then with a band `rimHeight` deep (normals
 * half-ovalized). w = 1 − √(1 − (1 − depth/band)²). The CSS fallback only clips to the capsule.
 */
export interface LayerLens {
  /** Unflexed capsule in canvas CSS px. */
  rect: Rect;
  flex?: Flex;
  /** Displacement along the outward normal in pt (negative pulls content in from deeper inside). */
  amount: number;
  height: number;
  rimHeight: number;
}

/**
 * A drawable child of the canvas, composited as one textured quad.
 * Write the fields directly (no setters needed); the next `frame()` picks them up.
 */
export interface Layer {
  readonly element: HTMLElement;
  /** Draw order. Layers and glass groups are drawn in ascending z. */
  z: number;
  /** Maps the element's own box (0,0)-(w,h) in CSS px to canvas CSS px. 2D affine part is used. */
  transform: DOMMatrix;
  opacity: number;
  /** Continuous-corner (squircle) radius in pt, in the element's own coordinate space. */
  cornerRadius: number;
  /** Clip rectangle in canvas CSS px. */
  clip?: Rect;
  /** 0…1, darkens toward black (used for the navigation parallax dimming). */
  dim?: number;
  /** Hidden layers are neither drawn nor hit-testable. */
  visible: boolean;
  /** Draw the layer only inside a capsule lens, warped at its rim (tab bar selection). */
  lens?: LayerLens;
  /** Capsule (canvas CSS px) punched out of the layer. */
  cutout?: Rect;
  /**
   * WebGPU: true once the element has been captured into a texture at least once (its hit geometry is reliable only
   * from then on). Undefined in the CSS fallback.
   */
  readonly captured?: boolean;
  /** Force a re-capture of the element on the next paint. */
  invalidate(): void;
  remove(): void;
}

export interface GlassShapeInit {
  /** Shapes with the same group key are fused with the smooth-min SDF union (k = group spacing). */
  group?: string;
  /** Rect in canvas CSS px (pt), before the flex transform. */
  rect: Rect;
  /** Corner radius in pt. Defaults to a capsule (min(w,h)/2). Continuous corners. */
  radius?: number;
  style?: GlassStyle;
  /** Glass tint (`UIGlassEffect.tintColor`); null for untinted. */
  tint?: RGBA | null;
  /** `isInteractive`: enables the flex glow layers. Press/drag motion itself is driven by the caller. */
  interactive?: boolean;
  /** `UIGlassContainerEffect.spacing` of the group (smooth-union k). Default 0 (hard union). */
  spacing?: number;
  /** Draw order of the group (first shape's value wins). Default 100. */
  z?: number;
  /** Initial `GlassShape.opacity` (0…1). Default 1. */
  opacity?: number;
}

/**
 * Same shape as `GlassShapeInit`; the architecture contract names the argument of `addGlass` a `GlassGroup`.
 */
export type GlassGroup = GlassShapeInit;

export interface GlassShape {
  rect: Rect;
  /**
   * Per-shape appearance override (UIKit `overrideUserInterfaceStyle` on the glass's view), e.g. a bar that turns
   * dark over photos. The group uses the first shape that sets it. Default: the renderer's appearance.
   */
  appearance?: Appearance;
  radius: number;
  /** Bottom corner radius when it differs from `radius` (e.g. a medium sheet). */
  bottomRadius?: number;
  /** Lifted lens: chromatic aberration multiplier (default 1; the slider thumb uses 0). */
  aberration?: number;
  /** Lifted lens: inner refraction amount in pt (default 10.5 × height / 70); band height = 0.6 × amount. */
  innerRefraction?: number;
  flex: Flex;
  /** Pressed state: turns on chromatic aberration (only while pressed, glass-render §3). */
  pressed: boolean;
  /** Optional 0…1 override of the pressed amount, for a spring-animated press. */
  pressAmount?: number;
  /** Touch point in canvas CSS px for the LittleGlow; undefined hides the glow. */
  glow?: Pt;
  /** 0…1 glow opacity multiplier (spring-driven by the caller). Default 1 when `glow` is set. */
  glowOpacity?: number;
  /** LittleGlow scale multiplier: 1 at press, 2 when dissipated, 4 on release (glass-drag §7). */
  glowScale?: number;
  /**
   * 0…1 opacity of the whole glass (backdrop, rim, glows and shadows), e.g. an alert or toast fading in.
   * Default 1; 0 draws nothing (like `visible = false`). Optional so other implementations stay compatible.
   */
  opacity?: number;
  tint: RGBA | null;
  interactive: boolean;
  visible: boolean;
  readonly group: string;
  remove(): void;
}

/** The surface shared by `LiquidRenderer` (WebGPU) and `CssRenderer` (DOM fallback). */
export interface Renderer {
  readonly kind: 'webgpu' | 'css';
  addLayer(el: HTMLElement, z: number): Layer;
  addGlass(group: GlassGroup): GlassShape;
  /** Set group-level properties (spacing, style, z) of an existing group. */
  configureGroup(group: string, opts: { spacing?: number; style?: GlassStyle; z?: number }): void;
  frame(): void;
  setAppearance(a: Appearance): void;
  readonly appearance: Appearance;
  destroy(): void;
}
