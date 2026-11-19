/**
 * `ContextMenu`: long-press preview with a menu (UIContextMenuInteraction), and the `.pop` commit to full screen.
 *
 * Sources: PT = deep/photos-transition/findings.md, MO = deep/motion/findings.md, TR = findings/transitions.md,
 * TO = components/text_overlays.md, HF = deep/haptics-framerate/findings.md.
 *
 * 1. Press (PT §1, TR §8): ≈0.18 s after touch-down the source grows ≈19 pt/s per side while a shadow fades in
 *    (0 → 0.30, radius 20). Moving more than 10 pt cancels (allowable movement), so scrolling still wins.
 * 2. Lift at 0.725 s (clickTimeoutDuration): the platter morphs to the preview frame on the present spring
 *    (ζ 0.8, 0.32): the source scaled by min(1.15, (w + 26)/w), or a `preview` sized by the PT §1 rule; continuous
 *    corners 32, shadow 0.30 / 20 / (0, 0). Background black @0.20, no blur. Haptic: contextMenuPreview.
 *    The menu (250 wide) morphs out of a blob one content spacing (20 pt; 16 on a 402 pt screen) below the preview
 *    and never overlaps it (logic.ts `placeContextMenu`, uikit-internals/deep/ctxmenu-fit).
 * 3. Without lifting the finger, sliding over the menu highlights rows (selection haptic); releasing on a row
 *    selects it. A tap outside dismisses: the platter returns to the source and the dim fades with the menu
 *    (ζ 0.85, 0.35).
 * 4. Tapping the preview with `onPreviewCommit` set commits with `.pop` (PT §2): a morph container starting at the
 *    preview frame with radius 32 grows to the screen with radius → 62 on the geometry spring
 *    (UIView 0.5 s, damping 0.7, v0 15 = k 267.11 c 22.881), its centre moves on the ζ1 0.238 s spring
 *    (UIView 0.35 s, damping 1); the preview snapshot (scaled uniformly by the width ratio) fades over 0–40 % and the
 *    background over 30–70 % of those 0.35 s; the destination fades in on the centre spring. The menu disappears at
 *    commit.
 */
import { holdFrames, useMotion } from '../controls/motion';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { playHaptic, springs } from '@liquid-gpu/core';
import type { Layer, Rect } from '@liquid-gpu/gpu';
import {
  cssVar,
  LayerView,
  measureInLayer,
  transformRect,
  useLayerContext,
  useLiquid,
  zBands,
  type GestureRecognizer,
} from '../root';
import {
  liftedRect,
  menuListHeight,
  placeContextMenu,
  popGeometry,
  popKeyframes,
  preLift,
  preLiftScale,
  preLiftShadow,
  previewSize,
} from './logic';
import { MenuSurface, type MenuSurfaceHandle } from './MenuSurface';
import { toSections, type MenuContent, type MenuItem } from './types';

export interface ContextMenuProps {
  items: MenuContent;
  children: ReactNode;
  /** Lifted preview content (UIContextMenuConfiguration previewProvider). Default: the source itself. */
  preview?: ReactNode;
  /** Preview aspect (w/h) for the PT §1 size rule. Without it the preview fills 400 × 571.33. */
  previewAspect?: number;
  /**
   * App cap on the preview height (UIContextMenuConfiguration previewProvider's preferredContentSize). Photos caps
   * at the screen width: 3:4 → 330 × 440 on 440 × 956, 301.67 × 402 on 402 × 874 (uikit-internals/deep/ctxmenu-fit).
   */
  previewMaxHeight?: number;
  /** Tapping the preview commits (`.pop`); called when the morph has settled. */
  onPreviewCommit?: () => void;
  /** Content of the committed full-screen view drawn during the morph. Default: `preview`. */
  commitDestination?: ReactNode;
  /** Icon row above the menu (Photos' Copy / Duplicate / Hide; `accessoriesForMenu`), up to three items. */
  accessories?: readonly MenuItem[];
  onSelect?: (item: MenuItem) => void;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

type Phase = 'idle' | 'pressing' | 'lifted' | 'dismissing' | 'commit';

const Z = {
  dim: zBands.menu,
  platter: zBands.menu + 10,
  menu: zBands.menu + 20,
  destination: zBands.menu + 30,
} as const;
const SHADOW_PAD = 40; // room for the 20 pt platter shadow inside the captured layer

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  width: lerp(a.width, b.width, t),
  height: lerp(a.height, b.height, t),
});
const scaleRect = (r: Rect, s: number): Rect => ({
  x: r.x + (r.width * (1 - s)) / 2,
  y: r.y + (r.height * (1 - s)) / 2,
  width: r.width * s,
  height: r.height * s,
});

export function ContextMenu({
  items,
  children,
  preview,
  previewAspect,
  previewMaxHeight,
  onPreviewCommit,
  commitDestination,
  accessories,
  onSelect,
  onOpenChange,
  disabled,
  className,
  style,
  ...aria
}: ContextMenuProps) {
  const ctx = useLiquid();
  const layerCtx = useLayerContext();
  const srcRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<MenuSurfaceHandle | null>(null);
  const sections = toSections(items);

  // Geometry (canvas coordinates).
  const geo = useRef({ src: null as Rect | null, from: null as Rect | null, target: null as Rect | null, menu: null as Rect | null, size: { w: 1, h: 1 } });
  const press = useRef({ t0: 0, timers: [] as ReturnType<typeof setTimeout>[], release: null as null | (() => void), event: null as PointerEvent | null, slid: false, at: { x: 0, y: 0 } });
  const platterLayer = useRef<Layer | null>(null);
  const destLayer = useRef<Layer | null>(null);
  const dimLayer = useRef<Layer | null>(null);
  const destClip = useRef<HTMLDivElement | null>(null);
  const commitT0 = useRef(0);

  const lift = useMotion(0, springs.contextMenuPresent);
  const g = useMotion(0, springs.contextMenuCommit);
  const c = useMotion(0, springs.contextMenuCommitCentre);

  // Read through a ref: the pointer handlers are bound in an effect that does not re-run when only the layer
  // context changes (it arrives after the enclosing layer mounts), so a captured `layerCtx` could still be the
  // default one (element null) and measure every source at (0, 0).
  const layerCtxRef = useRef(layerCtx);
  layerCtxRef.current = layerCtx;
  const srcCanvasRect = (): Rect | null => {
    const el = srcRef.current;
    if (!el) return null;
    const lc = layerCtxRef.current;
    const local = measureInLayer(el, lc.element);
    const t = lc.layer?.transform;
    return t ? transformRect({ a: t.a, b: t.b, c: t.c, d: t.d, e: t.e, f: t.f }, local) : local;
  };

  const clearTimers = () => {
    for (const t of press.current.timers) clearTimeout(t);
    press.current.timers = [];
    press.current.release?.();
    press.current.release = null;
  };
  const resetSource = () => {
    const el = srcRef.current;
    if (!el) return;
    el.style.transform = '';
    el.style.filter = '';
    el.style.visibility = '';
  };

  // Pre-lift: per-frame CSS on the source while pressing.
  useLayoutEffect(() => {
    if (phase !== 'pressing') return;
    const off = ctx.onBeforeFrame(() => {
      const el = srcRef.current;
      const r = geo.current.src;
      if (!el || !r || phaseRef.current !== 'pressing') return;
      const t = (performance.now() - press.current.t0) / 1000;
      el.style.transform = `scale(${preLiftScale(r.width, t).toFixed(5)})`;
      el.style.filter = `drop-shadow(0 0 ${preLift.shadowRadius / 2}px rgba(0,0,0,${preLiftShadow(t).toFixed(3)}))`;
    });
    return off;
  }, [phase, ctx]);

  const beginLift = (fromPress: boolean) => {
    const src = geo.current.src ?? srcCanvasRect();
    if (!src) return;
    geo.current.src = src;
    const t = fromPress ? (performance.now() - press.current.t0) / 1000 : 0;
    geo.current.from = scaleRect(src, fromPress ? preLiftScale(src.width, t) : 1);
    // Target: a preview by the PT §1 size rule (kept near the source), else the lifted source.
    // The preview (sized without regard to the menu, as UIKit does) is centred on the source; placeContextMenu keeps
    // the pair inside the screen where it can, with the menu one spacing below (never over the preview).
    const menuH = menuListHeight(sections.map((s) => s.map((i) => ({ subtitle: !!i.subtitle }))), !!accessories?.length);
    const scx = src.x + src.width / 2;
    let target: Rect;
    if (preview) {
      const sz = previewSize(ctx.viewport, previewAspect, previewMaxHeight);
      target = { x: scx - sz.width / 2, y: src.y + src.height / 2 - sz.height / 2, width: sz.width, height: sz.height };
    } else target = liftedRect(src);
    const placed = placeContextMenu(
      target,
      menuH,
      { width: ctx.viewport.width, height: ctx.viewport.height, safeTop: ctx.safeArea.top, safeBottom: ctx.safeArea.bottom },
      scx,
    );
    geo.current.target = placed.preview;
    geo.current.menu = placed.menu;
    geo.current.size = { w: placed.preview.width, h: placed.preview.height };
    clearTimers();
    press.current.release = holdFrames(ctx);
    lift.snap(0);
    setPhase('lifted');
    setMenuOpen(true);
    playHaptic('contextMenuPreview'); // HF §4: previewed, when the preview lifts
    onOpenChange?.(true);
  };

  // Lift spring starts once the overlay layers exist.
  useLayoutEffect(() => {
    if (phase !== 'lifted') return;
    const el = srcRef.current;
    if (el) {
      el.style.transform = '';
      el.style.filter = '';
      el.style.visibility = 'hidden';
    }
    lift.set(1, { params: springs.contextMenuPresent });
    press.current.release?.();
    press.current.release = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const dismiss = () => {
    if (phaseRef.current !== 'lifted') return;
    geo.current.from = geo.current.src; // the platter returns to the source frame
    setPhase('dismissing');
    setMenuOpen(false);
    lift.set(0, { params: springs.contextMenuDismiss });
    onOpenChange?.(false);
  };

  const commit = () => {
    if (phaseRef.current !== 'lifted' || !onPreviewCommit) return;
    menuRef.current?.vanish(); // PT §2: the menu disappears at commit
    setMenuOpen(false);
    setPhase('commit');
    playHaptic('previewCommit');
    commitT0.current = performance.now();
    g.snap(0);
    c.snap(0);
    g.set(1, { params: springs.contextMenuCommit }); // initialVelocity 15 → v = 15 × distance
    c.set(1, { params: springs.contextMenuCommitCentre });
    onOpenChange?.(false);
  };

  // Per-frame overlay geometry.
  useLayoutEffect(() => {
    if (phase === 'idle' || phase === 'pressing') return;
    const off = ctx.onBeforeFrame(() => {
      const { from, target, size } = geo.current;
      const pl = platterLayer.current;
      if (!from || !target || !pl) return;
      const ph = phaseRef.current;
      const W = size.w;
      const H = size.h;
      let R = lerpRect(from, target, lift.value);
      let opacity = 1;
      let dim = Math.min(1, Math.max(0, lift.value));
      if (ph === 'commit') {
        const t = (performance.now() - commitT0.current) / 1000;
        const k = popKeyframes(t);
        const vp = { x: 0, y: 0, width: ctx.viewport.width, height: ctx.viewport.height };
        const pg = popGeometry(target, vp, g.value, c.value);
        const cont = pg.container;
        R = scaleRect(
          { x: cont.x + cont.width / 2 - target.width / 2, y: cont.y + cont.height / 2 - target.height / 2, width: target.width, height: target.height },
          pg.previewScale,
        );
        opacity = k.preview;
        dim = k.background;
        const dl = destLayer.current;
        if (dl) {
          const s = pg.destScale;
          const cx = cont.x + cont.width / 2;
          const cy = cont.y + cont.height / 2;
          dl.transform = new DOMMatrix().translate(cx, cy).scale(s).translate(-vp.width / 2, -vp.height / 2);
          dl.opacity = Math.min(1, Math.max(0, c.value));
          const clip = destClip.current;
          if (clip) {
            // Container rect in the destination element's own coordinates, rounded (radius 32 → 62).
            const ox = cx - (s * vp.width) / 2;
            const oy = cy - (s * vp.height) / 2;
            const l = (cont.x - ox) / s;
            const tp = (cont.y - oy) / s;
            const rr = (cont.x + cont.width - ox) / s;
            const bb = (cont.y + cont.height - oy) / s;
            clip.style.clipPath = `inset(${tp.toFixed(2)}px ${(vp.width - rr).toFixed(2)}px ${(vp.height - bb).toFixed(2)}px ${l.toFixed(2)}px round ${(cont.radius / s).toFixed(2)}px)`;
          }
        }
        if (g.settled && c.settled && t > 0.35) {
          queueMicrotask(finishCommit);
        }
      }
      // Platter: uniform scale by width (height for a preview of a different aspect), clipped while they differ.
      const sx = R.width / W;
      const sy = R.height / H;
      const s = Math.max(sx, sy);
      pl.transform = new DOMMatrix()
        .translate(R.x + R.width / 2, R.y + R.height / 2)
        .scale(s)
        .translate(-(W / 2 + SHADOW_PAD), -(H / 2 + SHADOW_PAD));
      pl.clip = Math.abs(sx - sy) > 0.01 ? R : undefined;
      pl.opacity = opacity;
      const dl = dimLayer.current;
      if (dl) dl.opacity = dim;
      if (ph === 'dismissing' && lift.value <= 0.004 && Math.abs(lift.velocity) < 0.05) queueMicrotask(finishDismiss);
    });
    ctx.requestFrame();
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, ctx]);

  const finishDismiss = () => {
    if (phaseRef.current !== 'dismissing') return;
    resetSource();
    setPhase('idle');
  };
  const finishCommit = () => {
    if (phaseRef.current !== 'commit') return;
    resetSource();
    setPhase('idle');
    onPreviewCommit?.();
  };

  // Press handling on the source.
  useEffect(() => {
    const el = srcRef.current;
    if (!el || disabled) return;
    const onDown = (e: PointerEvent) => {
      if (phaseRef.current !== 'idle') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      press.current.t0 = performance.now();
      press.current.event = e;
      press.current.slid = false;
      press.current.at = { x: e.clientX, y: e.clientY };
      clearTimers();
      const recognizer: GestureRecognizer = {
        decide: ({ dx, dy }) => (Math.hypot(dx, dy) > preLift.allowableMovement ? 'fail' : 'wait'),
        onMove: (s) => {
          // A release selects only after the finger has slid since the lift (UIKit: lifting in place keeps the menu).
          const p = press.current;
          if (phaseRef.current === 'lifted' && !p.slid && Math.hypot(s.event.clientX - p.at.x, s.event.clientY - p.at.y) > 8) p.slid = true;
          if (p.slid) menuRef.current?.highlightAt(s.event.clientX, s.event.clientY);
        },
        onEnd: (s, cancelled) => {
          if (!cancelled && press.current.slid) menuRef.current?.selectAt(s.event.clientX, s.event.clientY);
        },
        onCancel: () => {
          if (phaseRef.current === 'pressing' || phaseRef.current === 'idle') abortPress();
        },
        onTap: () => {
          if (phaseRef.current === 'pressing' || phaseRef.current === 'idle') abortPress();
        },
      };
      ctx.gestures.track(e, recognizer);
      press.current.timers.push(
        setTimeout(() => {
          geo.current.src = srcCanvasRect();
          press.current.release = holdFrames(ctx);
          setPhase('pressing');
        }, preLift.start * 1000),
        setTimeout(() => {
          ctx.gestures.claim(e, recognizer);
          beginLift(true);
        }, preLift.commit * 1000),
      );
    };
    const onContext = (e: MouseEvent) => {
      e.preventDefault();
      if ((e as PointerEvent).pointerType === 'mouse' || e.button === 2) {
        if (phaseRef.current === 'idle') {
          geo.current.src = srcCanvasRect();
          beginLift(false);
        }
      }
    };
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('contextmenu', onContext);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('contextmenu', onContext);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, ctx.gestures, preview, previewAspect, items]);

  const abortPress = () => {
    clearTimers();
    resetSource();
    if (phaseRef.current === 'pressing') setPhase('idle');
  };
  useEffect(() => () => clearTimers(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'lifted') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const overlay = phase === 'lifted' || phase === 'dismissing' || phase === 'commit';
  const { w, h } = geo.current.size;
  const src = geo.current.src;
  const platterContent = preview ?? (
    <div style={{ width: src?.width, height: src?.height, transformOrigin: '0 0', transform: src ? `scale(${w / src.width})` : undefined }}>{children}</div>
  );

  return (
    <>
      <div
        ref={srcRef}
        className={className}
        aria-haspopup="menu"
        {...aria}
        style={{
          WebkitTouchCallout: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
          transformOrigin: '50% 50%',
          ...style,
        }}
        onKeyDown={(e) => {
          // Keyboard: Shift+F10 / ContextMenu key opens the menu.
          if ((e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
            e.preventDefault();
            if (phaseRef.current === 'idle') {
              geo.current.src = srcCanvasRect();
              beginLift(false);
            }
          }
        }}
      >
        {children}
      </div>
      {overlay && (
        <>
          <LayerView
            ref={(l) => {
              dimLayer.current = l;
            }}
            z={Z.dim}
            aria-hidden="true"
            className="lq-solid"
            opacity={0}
            onPointerDown={(e) => {
              e.preventDefault();
              dismiss();
            }}
            // PT §1: UIVisualEffectView with effect nil, background black @0.20, no blur.
            style={{ background: cssVar('contextMenuDimming') }}
          />
          <LayerView
            ref={(l) => {
              platterLayer.current = l;
            }}
            z={Z.platter}
            width={w + 2 * SHADOW_PAD}
            height={h + 2 * SHADOW_PAD}
            style={{ padding: SHADOW_PAD, boxSizing: 'border-box', pointerEvents: 'none' }}
          >
            <div
              role={onPreviewCommit ? 'button' : undefined}
              aria-label={onPreviewCommit ? 'Open preview' : undefined}
              onClick={() => (onPreviewCommit ? commit() : dismiss())}
              style={{
                width: w,
                height: h,
                borderRadius: 32, // PT §1 continuous ≈32 (menuCornerRadius)
                overflow: 'hidden',
                boxShadow: '0 0 40px rgba(0,0,0,0.30)', // PT §1 shadow opacity 0.30, radius 20, offset 0
                pointerEvents: 'auto',
                cursor: onPreviewCommit ? 'pointer' : 'default',
                background: cssVar('secondarySystemGroupedBackground'),
                ['cornerShape' as string]: 'squircle',
              }}
            >
              {platterContent}
            </div>
          </LayerView>
          {phase === 'commit' && (
            <LayerView
              ref={(l) => {
                destLayer.current = l;
              }}
              z={Z.destination}
              opacity={0}
              aria-hidden="true"
            >
              <div ref={destClip} style={{ width: '100%', height: '100%', overflow: 'hidden' }}>
                {commitDestination ?? preview ?? children}
              </div>
            </LayerView>
          )}
          {(menuOpen || phase === 'dismissing') && geo.current.menu && geo.current.target && phase !== 'commit' && (
            <MenuSurface
              ref={menuRef}
              sections={sections}
              accessories={accessories}
              anchor={geo.current.target}
              z={Z.menu}
              open={menuOpen}
              label={aria['aria-label']}
              place={() => geo.current.menu!}
              shrinkOrigin={{ x: geo.current.target.x + geo.current.target.width / 2, y: geo.current.target.y + geo.current.target.height }}
              onSelect={(item) => {
                item.onSelect?.();
                onSelect?.(item);
                dismiss();
              }}
              onRequestClose={dismiss}
              onClosed={() => {}}
            />
          )}
        </>
      )}
    </>
  );
}
