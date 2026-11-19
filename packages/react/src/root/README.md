# `@liquid-gpu/react` root: the foundation API

Everything here is exported from `@liquid-gpu/react` (and from `packages/react/src/root/index.ts`). This API is stable; components (navigation, controls, menus) build on it.

## Model in one paragraph

`<LiquidRoot>` owns one full-viewport `<canvas content="drawable" layoutsubtree>` and a renderer (`webgpu` through HTML-in-Canvas, or the `css` fallback `<div>` that replaces the canvas). Every surface that moves on its own is a **layer**: a direct child of that host element, rendered with a React portal, captured into its own texture and drawn with a transform. **Glass** shapes are drawn by the renderer between layers (by z). A glass's foreground (labels, icons) is its own layer above the glass. One core `Animator` runs one rAF loop; springs write layer/glass state directly (no React re-render per frame) and call `requestFrame()`; the root calls `renderer.frame()` exactly once in a frame where something changed.

## `<LiquidRoot>`

```tsx
<LiquidRoot appearance="system" /* | "light" | "dark" */ safeArea={{ top: 62, bottom: 34 }}>
  …
</LiquidRoot>
```

| prop | meaning |
|---|---|
| `appearance` | `system` follows `prefers-color-scheme` (default). Sets `data-appearance` on `.lq-root` (theme variables) and `renderer.setAppearance`. |
| `fallback` | force the CSS renderer. By default `?fallback` in the URL also forces it (`fallbackFromQuery`). |
| `safeArea` | override insets (default `env(safe-area-inset-*)`). |
| `baseLayer` | default `true`: children render inside a full-viewport layer at z 0, so plain DOM children are drawn. Components that portal their own layers (NavigationStack, Sheet, TabBar) work either way. |
| `clearColor`, `className`, `style`, `onReady(ctx)` | |

Children render only after the renderer exists (one async tick for WebGPU).

### Inline mode (UI embedded in a page or chat message)

```tsx
<div style={{ height: 420 }}>
  <LiquidRoot mode="inline" theme={{ tint: '#FF2D55' }}>…</LiquidRoot>
</div>
<LiquidRoot mode="inline" autoHeight>…a card whose height follows its content…</LiquidRoot>
```

| prop | meaning |
|---|---|
| `mode` | `fullscreen` (default, unchanged) or `inline`: the root is in flow and sizes to its container (`width/height: 100%`; give the container a height or use `autoHeight`). `viewport` = the container box (ResizeObserver), `safeArea` = 0 unless overridden. |
| `autoHeight` | inline: the root's height follows the base layer's content (no NavigationStack inside; screens are viewport-sized). |
| `overlays` | inline: `page` (default) draws `OverlayPortal` content (Alert, ActionSheet, Toast, Popover) in a transparent page-level root (`position: fixed`, CSS renderer so its glass blurs the real page, empty areas pass pointer events through); `contained` draws it inside the root, clipped. Menus, context menus and sheets are always contained (their anchors are canvas-space glass rects). |
| `maxGpuRoots` | inline: at most this many WebGPU canvases on the page (default 4); later roots use the CSS renderer. All WebGPU roots share one `GPUDevice` and one set of compiled pipelines (gpu `acquireSharedDevice`). |
| `pauseOffscreen` | inline (default true): drawing pauses while the root is out of view (IntersectionObserver, 100 px margin); springs still settle on the CPU and one frame is drawn on return. |

Coordinates: in an inline root canvas coordinates start at the root's top-left. `ctx.clientOrigin()` gives the client position of that origin (always 0, 0 for fullscreen and page-overlay roots); subtract it from `clientX/Y` or `getBoundingClientRect()` before comparing with glass/layer rects. `useFlex` / `<Glass interactive>` / `Popover` do this; components that compare raw `clientX` with canvas rects (MenuSurface slide-to-select, ContextMenu, TabView lens drag) are only exact in fullscreen roots.

### Theme overrides

`theme?: ThemeOverrides` = `{ tint?, fontFamily?, radiusScale?, colors?: { [semanticName]: color } }`, each colour a string or `{ light, dark }`. Written as CSS variables in the root element's inline style (`--lq-tint`, `--lq-font`, `--lq-radius-scale`, `--lq-<token>`), so they apply to that root only and beat the global stylesheet; page-level overlays inherit them. `useTheme()` returns the resolved theme (`tint`, `fontFamily`, `radiusScale`, `color(name)`, `cssVar(name)`, `overrides`).

### Streaming (mount/unmount churn)

`useLayer` and `useGlass` go through the root's `SceneRegistry` (`registry.ts`): a release hides the layer/shape at once and the renderer removal happens in one batch right before the next draw; re-acquiring the same element before then revives its layer. The WebGPU renderer additionally keeps removed layers' textures until after the next submitted frame (never destroyed while a capture may reference them) and revives them on re-add. `test/registry.test.ts` covers the churn.

Frame scheduling: the Animator's rAF callback runs the before-frame callbacks and `renderer.frame()` when the scene is dirty. In `webgpu` mode the canvas `paint` event (which captures changed layers, after rAF) draws again only when it re-captured something, so new DOM content shows in the same frame. Do not call `canvas.requestPaint()` from rAF: in Chrome 157 it re-runs rAF callbacks within the same update and can spin forever.

## `useLiquid()`

```ts
const { renderer, animator, appearance, mode, safeArea, viewport, host,
        requestFrame, onBeforeFrame, gestures, reducedMotion, reducedTransparency, spring } = useLiquid();
```

- `renderer: Renderer` (gpu `LiquidRenderer` or `CssRenderer`), `mode: 'webgpu' | 'css'`.
- `animator: Animator` (core). Add any `Animatable` (`ScrollPhysics`, `Spring`, `SpringVec`): `animator.add(item, onUpdate)`. Call `requestFrame()` from `onUpdate`.
- `appearance: 'light' | 'dark'` (resolved), `safeArea: {top,right,bottom,left}`, `viewport: {width,height}`.
- `host: HTMLElement`: portal target for layers.
- `requestFrame()`: mark the scene dirty; one `renderer.frame()` follows on the next frame.
- `onBeforeFrame(cb) → unsubscribe`: runs right before each draw. Write glass rects / layer transforms that depend on other layers here. Do **not** mutate DOM layout in it.
- `gestures: GestureArena` (see below).
- `spring(params)`: returns params adjusted for `prefers-reduced-motion` (critically damped, ≤ 0.2 s). `useSpring` applies it for you.
- `useLiquidOptional()` returns null outside a root.

## Layers

### `useLayer(ref, { z, x?, y?, visible?, cornerRadius?, opacity? }) → Layer | null`

`ref.current` must be rendered into `host` (`createPortal(<div ref={ref}/>, useLiquid().host)`). Registers it with `renderer.addLayer`, adds class `lq-layer` (absolute at the canvas origin), sets `z-index` and keeps DOM order sorted by z (focus order = draw order), sets `inert` when hidden. Visibility is ANDed with the enclosing `LayerContext` (inactive tabs hide everything inside). Returns the gpu `Layer`: write `layer.transform` (a `DOMMatrix` mapping the element box to canvas px), `opacity`, `cornerRadius`, `clip`, `dim`, then `requestFrame()`. The renderer follows the element's size and re-captures when its rendering changes; `updateElementGeometry` is called for every layer inside `frame()`.

**Layer boxes in webgpu mode.** A portaled layer element is laid out at the canvas origin; its on-screen position exists only through `updateElementGeometry` (hit testing). Do not rely on its `getBoundingClientRect()` / `offsetLeft` to find it on screen: use the glass handle's `geometry().rect`, the in-flow `.lq-placeholder` box of a `<Glass>`, or your own `layer.transform`. (In the CSS fallback the transform is a real CSS transform, so the rects agree.)

**Pointer events.** `.lq-layer` is `pointer-events: none` and its children `auto`, so empty parts of a full-screen layer pass clicks to the layers below. A layer element that is itself the control is solid: the `<Glass>` content (`.lq-glass-content`) and a layer element that is a `button`, `a[href]`, input or has a control role. Add class `lq-solid` to make a whole layer catch events (full-screen tap catchers, dims); screens (`lq-screen`) are solid too.

**Hit-test order.** New layers (and layers whose `z` changed) get their geometry re-sent on the first frame after they are added or reordered, and again once they are first captured, followed by every layer above them in z order (see "Chrome 157 findings").

### `<LayerView z x y width height visible cornerRadius opacity clip as …htmlProps>`

Component form: portals a `div` (or `as`) into the host, registers it and provides `LayerContext` to children. Default size: the viewport. The forwarded `ref` is the `Layer` handle.

### `LayerContext` / `useLayerContext()`

`{ layer, element, z, visible, clip() }` of the enclosing layer. Nested glass maps its element's layout position inside `element` through `layer.transform`.

### `zBands`

`base 0`, `screen(i) = 100 + 10i`, `toolbar 4000`, `tabBar 5000`, `sheet(i) = 6000 + 20i`, `menu 8000`, `alert 9000`, `toast 9500`. Inside a layer at z, nested glass is z + 1 and its content z + 2.

## Glass

### `useGlass(refOrRect, opts) → GlassShape | null`

```ts
const shape = useGlass(ref, { group, style: 'regular' | 'clear' | 'lens', tint, interactive, spacing, z, radius, visible, opacity });
```

- With a ref: the element's rect inside its layer is tracked (layout offsets minus scroll offsets, `ResizeObserver` on it and the layer, window resize, enclosing `ScrollView` scrolls), mapped through the layer's transform every frame. Radius defaults to a capsule and scales with the layer.
- With a `Rect` (canvas coordinates): the shape sits there; update it by passing a new rect, or write `shape.rect` yourself and `requestFrame()`.
- `z` defaults to the enclosing layer's z + 1. Glass inside a `ScrollView` hides when scrolled out of the viewport (glass shapes cannot be clipped).
- `prefers-reduced-transparency`: the shape gets an opaque tint.
- `opacity` (0…1, default 1) fades the glass and its shadow (`GlassShape.opacity`; the WebGPU shader multiplies the glass result and shadow, the fallback sets CSS `opacity`). It is applied when the option changes; leave it undefined and write `shape.opacity` per frame (then `requestFrame()`) to animate it with a spring.
- `useGlassCore(target, opts, onGeometry)` is the same with a per-frame callback `(geometry, shape)`; `geometry = { local, matrix, rect, clip, visible }`.

### `<Glass>`

```tsx
<Glass as="button" style="regular" group="nav-trailing" spacing={12} tint={null} interactive
       radius={22} fit="content" className="…" boxStyle={{…}} contentStyle={{ width: 44, height: 44 }}
       onClick={…} aria-label="Add">
  <PlusIcon />
</Glass>
```

`opacity` (0…1) fades the glass and its content layer together.

Renders an in-flow placeholder box (`className`, `boxStyle`) and portals the content element (`as`, `contentClassName`, `contentStyle`, all other HTML props) as its own layer above the glass. `fit="content"` (default): the box takes the content's size. `fit="container"`: the content is stretched to the box. Note that `style` is the **glass style** (`regular | clear | lens`), as in the contract; CSS goes to `boxStyle` / `contentStyle`.

`interactive`: press lift, drag stretch (`flexTransform`), glow and pressed chromatic aberration, on the size-resolved core flex springs. Inside a `ScrollView` the press yields to scrolling after 10 pt; elsewhere a drag stretches the glass and a release inside still clicks. The ref is `{ shape, layer, content, geometry() }`.

### `useFlex({ variant })` / `createFlexController(ctx)`

The press/drag/glow controller used by `<Glass interactive>`: `begin(pointerEvent, rect)`, `move(x, y)`, `release()`, `apply(shape)`, `contentMatrix(rect)`, `recognizer({ yieldToScroll, isInside })` for the arena. Use it for custom glass controls (switch knob, slider thumb, menu items).

## Springs

### `useSpring(initial, preset, onChange?) → SpringHandle`

```ts
const x = useSpring(0, 'push', (v) => { layer.transform = new DOMMatrix().translate(v, 0); });
x.set(440);                                   // animate (preset impulse kick applies)
x.set(0, { params: 'navInteractiveFinish', velocity: v }); // switch spring, hand off velocity
x.snap(0);                                    // jump
x.value; x.velocity; x.target; x.settled; x.subscribe(fn);
```

`preset` is a core `springs` name or `SpringParams`. The spring is stepped by the root `Animator`; `onChange` runs inside the frame and `requestFrame()` is called for you. No React state changes. `createSpring(ctx, initial, preset)` is the non-hook form (call `dispose()`).

## Gestures: `GestureArena`

```ts
el.addEventListener('pointerdown', (e) => ctx.gestures.track(e, {
  decide: ({ dx, dy }) => Math.abs(dx) < 10 ? 'wait' : Math.abs(dx) > Math.abs(dy) ? 'claim' : 'fail',
  onBegin, onMove, onEnd: (s, cancelled) => …, onCancel, onTap, keepClick,
}));
```

Native `pointerdown` listeners register candidates innermost first. A candidate may claim only after every earlier one failed; `wait` blocks the outer ones. The winner gets `onBegin`/`onMove`/`onEnd`, the others `onCancel`; a pointer-up with no winner is `onTap`. The click after a claimed gesture is swallowed unless `keepClick` returns true. Window listeners are used instead of pointer capture (Chrome 157 retargets clicks after capturing on a drawable). `gestures.claim(e, r)` claims immediately (catching a decelerating scroll).

## Theme

`LiquidRoot` injects a stylesheet built from core tokens:

- colours: `--lq-<token>` for every `colors.light/dark` entry (`--lq-label`, `--lq-secondary-label`, `--lq-system-grouped-background`, `--lq-tint`, `--lq-system-red`, `--lq-cell-grouped`, `--lq-separator`, …), switched by `data-appearance`. `cssVar('secondaryLabel')` → `var(--lq-secondary-label)`.
- type: `.lq-large-title`, `.lq-title1`, …, `.lq-body`, `.lq-footnote`, `.lq-caption2` and `-em` (semibold) variants; variables `--lq-<style>-size|weight|line|tracking`.
- font stack `fontStack`: SF (system) → Inter → platform UI fonts (Georgian falls back to the system Georgian face).
- `--lq-dpr` (device pixel ratio) for hairlines: `height: calc(1px / var(--lq-dpr))`.
- base classes: `.lq-root`, `.lq-host`, `.lq-layer`, `.lq-glass-content`, `.lq-placeholder`, focus ring `:focus-visible` in the tint colour.

## Geometry helpers

`measureInLayer(el, layerEl)`, `transformRect(m, r)`, `multiply`, `translation`, `toDOMMatrix`, `affineScale`, `intersectRects`, `rectsEqual`, `extraTranslation` (a `WeakMap` where components register CSS translations that layout offsets cannot see, e.g. a scroll view's rubber band).

## Chrome 157 findings this layer works around

- **Hit testing of overlapping drawable children** follows the order of their latest `updateElementGeometry` call (the most recently updated element wins), not z-index or DOM order. The root re-issues the geometry of every layer above the lowest one that moved, in ascending z, after each draw (`LiquidRoot.tsx`, `reorderHits`). Layer elements are also `pointer-events: none` (their children `auto`), so empty parts of a full-size layer pass events through. A layer that was just added or reordered may have had its first geometry update dropped before its first paint (an identity-transform layer then never "moves" and is never re-sent): the renderer resets its geometry cache on the first capture and on a `z` change, and the root re-sends new layers and everything above them until each was sent after its first capture (`freshHits`).
- **`canvas.requestPaint()` from a rAF callback** re-runs rAF callbacks inside the same rendering update and can spin forever; the root never calls it. Drawing happens in rAF, plus once more from the `paint` event when it re-captured layers.
- **Same-timestamp rAF re-entry**: `createFrameScheduler` pushes a callback that arrives with the previous callback's timestamp to the next real frame.
- Core bug fixed alongside: `Animator.wake()` from inside a tick used to reset the clock (every later tick had dt = 0). It also no longer schedules a second frame: a wake inside a tick is deferred to the single end-of-tick schedule (`packages/core/test/animator-schedule.test.ts`).

## Nesting surfaces

`ZBaseContext` (set by `<Sheet>`) makes a nested NavigationStack draw its screens inline inside the sheet's layer (an adapter turns the stack's transform/dim into CSS), so they move with the sheet. `InSheetContext` makes screens default to a transparent background there so the sheet's glass shows.
