# liquid-gpu: iOS 27 UI for the web, rendered with WebGPU

A reusable kit that rebuilds the iOS 27 look and feel on the web: Liquid Glass, the system springs, scroll physics, gestures, navigation, sheets, menus and controls.

Every constant comes from the compiled-UIKit extraction in `~/Documents/uikit-internals/`. Never use remembered or "typical" iOS values. If a value isn't in those files, mark it `// TODO(unknown)` and pick something visibly reasonable.

## Sources of truth (read these; cite the file in comments next to each constant)

| Topic | File |
|---|---|
| Scroll physics, rubber band, paging, release velocity, system springs | `uikit-internals/findings/scroll-motion-gestures.md` |
| Transitions (push/pop, sheet, zoom, alert, menu), effective springs | `uikit-internals/findings/transitions.md` |
| Liquid Glass inputs, interactive glass, tab lens | `uikit-internals/findings/liquid-glass.md` |
| Glass shader formulas (SDF union, lens, blur, colour matrix, rim, shadow, aberration), push kick | `uikit-internals/deep/glass-render/findings.md` |
| Glass press and drag stretch (exact formula) | `uikit-internals/deep/glass-drag/findings.md` |
| Glass adaptivity (off on stock iOS: do not implement by default) | `uikit-internals/deep/glass-adaptive/findings.md` |
| Switch, menu morph, minimized tab bar | `uikit-internals/deep/motion/findings.md` |
| Gesture decision rules (pop, sheet, swipe actions, refresh) | `uikit-internals/deep/gestures/findings.md` |
| Sheets: scroll hand-off, glass-at-medium, zoom morph | `uikit-internals/deep/sheets/findings.md` |
| Context-menu preview → full screen commit, Photos-style zoom | `uikit-internals/deep/photos-transition/findings.md` |
| SwiftUI spring engine (Verlet, 1/300 s), presets | `uikit-internals/deep/swiftui-motion/findings.md` |
| Haptics and frame rates | `uikit-internals/deep/haptics-framerate/findings.md` |
| Component metrics, colours per appearance, type | `uikit-internals/components/*.md`, `components/bars-appearances.md`, `uikit-internals/reference-page.html` (Color, Type, Layout sections) |

## Rendering model: HTML-in-Canvas + WebGPU

Chrome 157 (installed here) ships the HTML-in-Canvas API without a flag:
- `<canvas content="drawable">` lays out its children like normal DOM, keeps them focusable and accessible, and does not paint them itself.
- Children opt in with the `drawable` attribute (which implies `isolation: isolate`).
- `canvas.onpaint` fires whenever a drawable element's snapshot would change; `canvas.requestPaint()` forces one.
- In `onpaint`, `device.queue.drawElementImageToTexture({source: el}, {texture, size: {width, height}})` copies the element's rendering into a GPU texture. Use device pixels.
- Hit testing for a 3D context: `canvas.updateElementGeometry(el, {canvasTransform: DOMMatrix})` if present. Otherwise set `el.style.transform` so the DOM box sits where the GPU drew it, as the WICG jelly demo does.
- `queue.copyElementImageToTexture` is the older name (legacy dict shape `{destination:{texture}, width, height}`). Support both.

Prototype confirmed here: a full 440×900 scrolling list with Georgian text was captured at 3× into a texture and post-processed by a fragment shader. Scratch file: `scratchpad/hic/p.html`.

**Layers.** The page is one full-viewport `<canvas content="drawable">` owned by a `LiquidRoot`. Each independently moving surface is its own drawable child, so it becomes its own texture: each navigation screen, each sheet, the bars' content, menus, the alert. The GPU compositor then draws:
1. each layer's texture as a quad, with transform, opacity, corner radius (continuous/squircle mask), clip and dimming, so transitions are GPU-only;
2. glass shapes on top: SDF union per glass group; the glassBackground shader sampling **the composite of the layers below** (render the content composite into an offscreen texture with a mip chain, then the glass reads it);
3. the glass shapes' foreground content (labels and icons) as their own drawable layers on top of the glass.

DOM order matches GPU order, so focus, keyboard and screen readers follow the visual order.

**Fallback** when `HTMLCanvasElement.prototype.requestPaint` or WebGPU is missing (Safari, Firefox, older Chrome): the same component tree renders as plain DOM. Glass becomes CSS (`backdrop-filter: blur() saturate()` plus a border/rim gradient and the same shadow numbers), and transitions use the same spring engine driving CSS transforms. All physics and gestures are identical in both modes; only the drawing differs.

## Packages (npm workspaces, TypeScript, ESM, no runtime deps besides React for `react`)

```
packages/core     @liquid-gpu/core    framework-free: springs, scroll physics, gesture deciders, tokens, haptics map
packages/gpu      @liquid-gpu/gpu     WebGPU device, HTML-in-Canvas capture, layer compositor, glass renderer, CSS fallback
packages/react    @liquid-gpu/react   React 19 components built on core + gpu
apps/demo         Vite demo/showcase of every component (light/dark)
```

### `@liquid-gpu/core` API (stable contract; other packages code against it)

```ts
// springs.ts — UIKit/AnimationKit closed-form spring (§glass-render 1) and SwiftUI fluid spring (§swiftui-motion 3)
export interface SpringParams { dampingRatio: number; response: number; mass?: number; impulse?: number }
export const springs: {
  default: SpringParams            // ζ1, 0.5 (SwiftUI .default)
  smooth: SpringParams; snappy: SpringParams; bouncy: SpringParams
  interactive: SpringParams        // (0.85, 0.15)
  push: SpringParams               // ζ1, 0.30, impulse 0.02 (nav push kick)
  sheet: SpringParams              // ζ1, 0.3441 (curve 7, sheets, detents)
  sheetHighSpeed: SpringParams     // ζ0.8, 0.3441
  menuOpen: SpringParams; menuClose: SpringParams   // (0.75,0.35) / (0.80,0.49)
  switchKnob: SpringParams         // (1.0, 0.3)
  // …add every named spring the components need, each citing its source line
}
export function springFromDurationBounce(duration: number, bounce: number): SpringParams // SwiftUI rule incl. negative bounce
export class Spring {             // 1-D, retargetable, carries velocity; impulse kick on retarget per AnimationKit
  constructor(value: number, params: SpringParams)
  target: number; value: number; velocity: number
  setTarget(t: number, opts?: { params?: SpringParams; velocity?: number }): void
  step(dtSeconds: number): void    // closed form per segment; stable at any dt
  get settled(): boolean
}
export class SpringVec { /* same for N dims (x,y,w,h,radius…) */ }
export class Animator { /* rAF loop driving many springs; onFrame callbacks; idles when all settled */ }

// scroll.ts — UIScrollView physics, per-ms stepping (§scroll-motion-gestures 1–5)
export class ScrollPhysics {
  constructor(opts: { decelerationRate?: 0.998 | 0.99; paging?: boolean; pageSize?: number; rubberBand?: number /*0.55*/ })
  bounds: { min: number; max: number }
  dragBegin(): void
  dragMove(offsetFromFinger: number): number  // returns rubber-banded offset
  dragEnd(velocityPtPerSec: number, targetFn?: (projected: number) => number): void
  step(dtSeconds: number): number            // deceleration / bounce-back / paging
  get active(): boolean
}
export class VelocityTracker { add(t: number, x: number): void; velocity(): number } // 0.2·latest + 0.8·previous

// gestures.ts — exact decision rules
export function popShouldFinish(p: number, v: number, a: number, width: number, samples: number): boolean
export function sheetReleaseTarget(detents: number[], point: number, velocity: number): number // 0.099 s projection + 1000 pt/s rule
export function swipeActionRelease(...)  // open/close/confirm rules
export function flexTransform(size: {w,h}, touchDown: Pt, finger: Pt, inside: boolean): { sx: number; sy: number; tx: number; ty: number } // glass-drag §4
export function rubberBand(offset: number, min: number, max: number, range: number, c: number): number

// tokens.ts — colours per appearance (light/dark/HC), type scale, radii, metrics
export const colors: Record<'light' | 'dark', Record<string, string>>
export const metrics: { navBarHeight; tabBarHeight; barButton: 44; rowHeight: 52; insetGroupedRadius: 26; ... }
export const haptics: Record<string, number[]>  // navigator.vibrate patterns approximating the extracted intensities
```

### `@liquid-gpu/gpu` API

```ts
export function supportsHtmlInCanvas(): boolean
export class LiquidRenderer {
  static create(canvas: HTMLCanvasElement): Promise<LiquidRenderer | null> // null → use CSS fallback
  addLayer(el: HTMLElement, z: number): Layer         // el must be a drawable child of canvas
  addGlass(group: GlassGroup): GlassShape             // rounded-rect/capsule SDF, style 'regular' | 'clear', tint?, interactive?
  frame(): void                                        // composite + glass; called by core Animator
  setAppearance(a: 'light' | 'dark'): void
}
export interface Layer { transform: DOMMatrix; opacity: number; cornerRadius: number; clip?: Rect; dim?: number }
export interface GlassShape { rect: Rect; radius: number; flex: {sx,sy,tx,ty}; pressed: boolean; glow?: Pt }
```

The glass shader implements `deep/glass-render/findings.md` §2–3 literally: the normal-aware smooth-min union with k = container spacing; inner refraction `A·(1 − √(1 − (1 − x)²))` with the size-dependent A and height from `findings/liquid-glass.md`; mip-level blur from a half-resolution mip chain plus a 2-tap blur fill (lighten/darken by appearance); the Rec.709 YCbCr face matrix (light: black 0.4, white 1.03, sat 1.2, white fill α 0.2; dark: 0.125 / 1.125 / 1.3, no fill); the key/fill rim band (0°/180°, spread 80°, amount 0.5, height 1, curvature 0.75); the normal-CDF shadow (offset 0/8, radius 4+20t, opacity 0.04+0.36t light / 0.04+0.56t dark); and chromatic aberration only while pressed (3.684 pt at −15°).

### `@liquid-gpu/react` components

`LiquidRoot`, `NavigationStack` / `Screen` (push/pop with parallax −0.3·W, dimming, push spring with kick, interactive edge/full-width back swipe using `popShouldFinish`), `NavBar` (large and inline title, 44 pt glass capsules), `Toolbar`, `TabBar` (62 pt pill, liquid lens selection, minimize on scroll), `Sheet` (detents, press lift, glass at medium → opaque past the midpoint, scroll hand-off, `sheetReleaseTarget`), `ScrollView` (`ScrollPhysics`, rubber band, scroll-edge blur under bars), `List` / `Section` / `Row` (inset grouped, 52 pt rows, swipe actions), `GlassButton` and the button styles (flex press/drag stretch, glow), `Switch`, `SegmentedControl`, `Slider`, `Stepper`, `Menu` / `ContextMenu` (morph from source, preview lift, `.pop` commit to full screen), `Alert`, `ActionSheet`, `ZoomTransition` (Photos-style tap to open, swipe down to close), `Toast`.

The API is declarative React, SwiftUI-like naming, with no uluri-specific code in the kit. Each component works in both GPU and fallback mode.

## Quality bar
- 120 Hz-capable: a single rAF loop, no React re-render per frame (springs write to layer and transform state directly).
- Physics and decision rules have unit tests (vitest) against the numbers in the findings (e.g. paging friction at 440 pt = 0.971193, pop rule cases, sheet flick cases, flex examples).
- The demo runs in Chrome 157 (GPU mode) and Safari/Firefox (fallback).
- Accessibility: real DOM controls, focus rings, `prefers-reduced-motion` (springs → critically damped short), `prefers-reduced-transparency` (opaque glass).
