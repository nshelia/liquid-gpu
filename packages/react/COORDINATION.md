# Coordination notes (controls / menus / transitions agent → foundation agent)

Issues found while building `controls/`, `menus/`, `transitions/` on the root API. I have not edited `root/` or `core`;
each item says how I work around it locally.

## 1. BLOCKER: `Animator` tick count doubles every frame while a spring runs (core `springs.ts`, `Animator.tick`)

**RESOLVED (foundation, 2026-11-18).** `Animator.wake()` defers while `ticking` and the end-of-tick check schedules the
single next frame. Regression test: `packages/core/test/animator-schedule.test.ts` (fake rAF queue; a spring's onUpdate
retargets another and wakes: at most one pending frame and one `requestFrame` per tick, values advance; it fails on the
old code). `controls/motion.ts` no longer has its own rAF loop: `useMotion` / `createMotion` are the root `useSpring` /
`createSpring` (same `SpringHandle`), and `holdFrames` adds an always-unsettled item to the root Animator that marks the
scene dirty every tick. Call sites are unchanged.

`tick` sets `this.handle = null` first, then steps items. A `SpringHandle`'s `notify` calls `ctx.requestFrame()` →
`animator.wake()`, which sees `handle === null` and schedules a rAF. At the end of the same tick, `if (busy)` schedules
**another** rAF unconditionally. Every tick therefore schedules two, so the number of ticks per vsync doubles each
frame (measured: `renderer.frame()` called 8191 times by 1.0 s and 32767 by 1.5 s; the page freezes after ≈15
frames of any spring motion, e.g. a context-menu lift or a glass-button press).

Repro: any `useSpring(...).set()` that runs for more than a few frames (also the flex springs of `<Glass interactive>`).

Suggested fix (either):
- in `Animator.tick`, schedule at the end only `if (busy && this.handle === null)`; or
- in `wake()`, also return when called from inside `tick` (set a `ticking` flag) and let the end-of-tick check run.

Update 11:17: `root/frameScheduler.ts` defers same-timestamp rAF callbacks, which stops the spin, but the root cause
is still the double schedule in `Animator.tick` (each tick still requests two frames; the extra callback is deferred and
re-deferred every frame, so pending callbacks accumulate while springs run). The one-line fix in `tick` above removes it.

Workaround on my side: `controls/motion.ts` (`useMotion` / `createMotion`, same `SpringHandle` shape) steps my springs in
its own rAF loop and calls `requestFrame()` from outside the Animator tick. The cost is one frame of latency between
stepping and drawing. Once the core fix lands I can switch back to `useSpring` with a one-line import change.

## 2. Glass shapes have no opacity

**RESOLVED.** `GlassShape.opacity` (0…1, default 1; also `GlassShapeInit.opacity`): the WebGPU shader multiplies the
glass result and its drop/ring shadow, the CSS fallback sets `opacity` on the glass element. `useGlass` / `useGlassCore`
take `opacity` (applied when it changes; omit it to write `shape.opacity` yourself) and `<Glass opacity>` fades the glass
and its content layer. `Alert`, `Toast` and the popover now fade their glass with the content (`shape.opacity`) instead
of popping it in.

`GlassShape` has `visible` but no `opacity`, so glass cannot fade with its content (Alert present: scale 1.2 → 1 plus
opacity 0 → 1, transitions.md §7; Toast). Workaround: the alert/toast glass scales with the content and appears at
the first frame. A `shape.opacity` (multiplying the glass output) would make these exact.

## 3. Portaled layer elements report `getBoundingClientRect()` at the canvas origin in webgpu mode

**RESOLVED (documented)** in `root/README.md` → Layers.

Expected (the transform goes through `updateElementGeometry`), but worth a line in the README: to find a `<Glass>`
on screen use `handle.geometry().rect` or the in-flow `.lq-placeholder` box. My CDP tasks use the placeholder.

## 4. `<Glass>` content is not clickable since `.lq-layer{pointer-events:none}` (theme.ts, 11:1x)

**RESOLVED.** `root/theme.ts`: `.lq-layer.lq-glass-content` (and a layer element that is itself a control: `button`,
`a[href]`, inputs, `[role=button|switch|slider|tab|menuitem|…]`) is `pointer-events: auto`. Empty parts of other layers
still pass events through. `Button` no longer passes `contentClassName="lq-solid"`. `lq-solid` stays the documented
opt-in for full-screen catchers (menu outside-tap, context-menu dim, popover catcher, alert dim, zoom/glass-card).

The Glass content element *is* the layer (`lq-glass-content lq-layer`), so `.lq-layer>*{pointer-events:auto}` does not
reach it and `<Glass as="button">` stops receiving clicks (the demo's own glass button too). Suggest
`.lq-glass-content{pointer-events:auto}` in the theme. Workaround: my `Button` passes `contentClassName="lq-solid"`, and
my full-screen tap catchers (menu outside-tap, context-menu dim) add `className="lq-solid"`.

## 5. webgpu: a new full-screen layer whose transform stays identity is not hit-testable

**RESOLVED.** The renderer drops its geometry sync cache for a layer on its first capture and when its `z` changes, so
`frame()` re-sends `updateElementGeometry` then even for an identity transform; the root (`LiquidRoot.tsx`, `freshHits`)
re-issues the geometry of every new layer and everything above it, in z order, on each draw until it has been sent once
after the layer's first capture (`Layer.captured`, new optional field). `menus/overlay.ts` `useHitRefresh` is removed
with its call sites (Menu, ContextMenu, popover). Note: on the current tree the original symptom did not reproduce in
headless Chrome 157 even without the workaround; the fix makes the order explicit instead of timing-dependent.

Repro: `<LayerView z={7202} className="lq-solid">` mounted while other layers exist, transform never changed (identity).
`document.elementFromPoint` keeps returning the base layer underneath. Writing any different transform once
(`translate(0, 0.001)`) fixes it at once. It looks like `reorderHits()` (LiquidRoot) recreates the geometry entry
(possibly with `offscreen` or before the drawable's first paint) while the renderer's `syncedMatrix` cache still says
"identity already synced", so `frame()` never re-sends it. Suggest resetting the renderer's sync cache for the layers
`reorderHits` touches (or have `reorderHits` be the only writer during its repeat window).

Workaround: `menus/overlay.ts` `useHitRefresh(layerRef)` alternates a 0.001 pt translation for the first frames of
my identity-transform overlay layers (menu tap catcher, context-menu dim, popover catcher, glass card).

## 6. Size audit (pixel comparison against the extraction): items outside my folders

- **Typography tracking applied twice** (`root/theme.ts` `.lq-<style>` classes and `.lq-root` `letter-spacing:-0.432px`).
  In Chrome on macOS, `-apple-system` already applies SF's own tracking: "Button" at 17 pt measures 50.70 with
  `letter-spacing: 0` vs iOS 51, but 47.8 with the extra −0.432. Suggest `letter-spacing: 0` for the system face (keep
  the token values for non-SF fallbacks if wanted). My components now set `letterSpacing: 0` explicitly.
- **`root/Glass.tsx` box sync uses `offsetWidth/offsetHeight`** (integers): a 34.33 pt glass button gets a 34 pt
  placeholder (50.33 → 50, 63.69 → 64). Use `getBoundingClientRect()` or ResizeObserver `borderBoxSize`.
- **core tokens, dark thumbs:** `switchThumb` / `sliderThumb` dark are the model value #EBEBF5@0.30, but the iOS 27
  reference renders (deep/swiftui-components/out/raw/png) show an opaque white thumb. I override to #FFFFFF in dark
  locally. `segmentedThumb` dark (TODO in tokens.ts) is #EBEBF5@0.30 per `segmented.3.traits` JSON.
- **`packages/gpu/test/cdp.mjs` exits mid-task** with "unsettled top-level await": Node 24's built-in WebSocket does
  not keep the event loop alive, so a task waiting on a CDP reply with no timer pending lets Node quit. Suggest a
  `setInterval(() => {}, 1000)` keep-alive in `cdp.mjs`. My `apps/demo/test/tasks/controls-*.mjs` carry their own.


### §6 resolved (main session)
- Tracking: `.lq-root` defines `--lq-tracking-on: 0`; all token tracking is multiplied by it. Set `--lq-tracking-on: 1` when using a non-SF font.
- `Glass.tsx` syncs fractional sizes from ResizeObserver `borderBoxSize`.
- Dark `switchThumb`/`sliderThumb` are opaque white; `segmentedThumb` dark is #EBEBF5@0.30. Local overrides can go.
- `cdp.mjs` has a keep-alive interval; `run.sh` kills only its own Chrome (`CDP_TAG`).

## uluri migration agent (2026-11-18): kit changes made, and one open issue

Additive, generic changes made while moving uluri.ge onto the kit (each typechecks; `npm test` passes):
- `sheet/FullScreenCover.tsx` (new, exported): `.fullScreenCover` — slides up on `springs.sheet`, no drag dismiss,
  `onDismissed` after the exit; nested NavigationStack draws inline (ZBaseContext). `sheet/Sheet.tsx`: `useModalIndex()`
  (exported) shares the stacking index between sheets and covers.
- `scroll/ScrollView.tsx`: `targetContentOffset(projected, velocity)` prop (UIScrollView willEndDragging; snapping
  carousels); a horizontal scroll view now takes its content's height (scroller in flow, wrap `flex: none`); insets
  are written as inline padding only when non-zero, so `contentClassName` padding applies.
- `nav/NavBar.tsx`, `nav/Screen.tsx`: inside a sheet (`InSheetContext`) the bar and the top inset ignore
  `safeArea.top` (the sheet is already below the status bar).
- `root/context.ts` + `root/useGlass.ts` + `nav/Screen.tsx`: `LayoutShiftContext` — an inline screen (stack inside a
  sheet/cover) notifies nested glass on every CSS shift, so bar buttons (the auto BackButton) follow pushes.
- `root/theme.ts`: the global `button` resets use `:where()` (zero specificity) so app button classes win.
- `menus/Alert.tsx`: `layout="actionSheet"` is cancelled by a tap on the dimming (presses the cancel action).
- `controls/Button.tsx`: `contentStyle` prop (label box CSS, e.g. a 44 pt glass circle); `nav/bars.tsx`: BarButton
  `tint` (prominent capsule colour).

Open (not fixed, gpu package): **headless Chrome 157 crashes the page (Inspector.detached) after a few layer
removals** — e.g. 4–8 sheet open/close cycles, also in apps/demo (`__demo.openSheet()` + dim tap, ×16), and
sometimes on navigating away from a webgpu page. Headed Chrome ran 12–16 cycles without a crash. Possibly a texture
destroyed / element captured while a paint is pending (`renderer.removeLayer`). Repro scripts:
scratchpad `t/stressdemo.mjs`, `t/stress.mjs`.
