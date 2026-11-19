/**
 * Sheet (UISheetPresentationController), drawn as layers: dimming, glass, opaque backing, content.
 *
 * - Detents medium / large (TR §3a); release rule `sheetReleaseTarget` (0.099 s projection + 1000 pt/s one-detent
 *   rule) with the sheet spring (ζ 1, 0.3441) or the high-speed spring (ζ 0.8) and the finger velocity (TR §3b–c, GS §4).
 * - Drag 1:1; no travel above the largest detent, 200 pt rubber band (c 0.55) below the lowest point (SH §2).
 * - Press lift ×1.0077 on touch-down, back within ~2 frames on release (SH §3).
 * - Medium: scale 0.96364 (8 pt inset), radius 54 → 62 at large, linear in position (TR §3a).
 * - Glass at medium (content background transparent); past the midpoint between the detents the background turns
 *   opaque on the sheet spring (SH §4).
 * - Dimming black 0.20 light / 0.48 dark (TR §3a); `largestUndimmedDetent="medium"` → none at medium (SH §5).
 * - Scroll hand-off with an inner ScrollView through `SheetScrollContext` (`sheetScrollHandoff`, SH §1).
 */
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  VelocityTracker,
  colors,
  gestureThresholds,
  metrics,
  radii,
  sheetReleaseSpring,
  sheetReleaseTarget,
  sheetScrollHandoff,
  springs,
} from '@liquid-gpu/core';
import type { GlassShape, Layer } from '@liquid-gpu/gpu';
import { useLiquid, ZBaseContext } from '../root/context';
import { LayerView } from '../root/Layer';
import { useSpring } from '../root/useSpring';
import { zBands } from '../root/zBands';
import { ScrollChannel } from '../logic/scroll';
import {
  constrainSheetTop,
  detentTop,
  sheetDimming,
  sheetExpansion,
  sheetOpaque,
  sheetScale,
  sheetTopRadius,
  sheetVisualOffset,
  type DetentName,
} from '../logic/sheet';
import { BarInsetsContext, ScrollChannelContext, TabBarPresentContext } from '../scroll/context';
import { SheetScrollContext, type SheetScrollBridge } from './bridge';

/** True inside a sheet (screens default to a transparent background there so the glass shows). */
export const InSheetContext = createContext(false);

let presentedSheets = 0;

/**
 * Stacking index shared by every modal surface (sheets, full-screen covers): the i-th presented one draws in
 * `zBands.sheet(i)`, so a later presentation is always above an earlier one whatever its kind.
 */
export function useModalIndex(): number {
  const [index] = useState(() => presentedSheets++);
  useEffect(() => () => void presentedSheets--, []);
  return index;
}

export interface SheetProps {
  isPresented: boolean;
  onDismiss?(): void;
  detents?: DetentName[];
  /** Initial detent (default: the first of `detents`). */
  initialDetent?: DetentName;
  onDetentChange?(d: DetentName): void;
  largestUndimmedDetent?: DetentName;
  /** Allow dragging / tapping the dimming to dismiss. Default true. */
  dismissible?: boolean;
  /** Show the grabber. Default true. */
  grabber?: boolean;
  'aria-label'?: string;
  children?: ReactNode;
}

export function Sheet({
  isPresented,
  onDismiss,
  detents = ['medium', 'large'],
  initialDetent,
  onDetentChange,
  largestUndimmedDetent,
  dismissible = true,
  grabber = true,
  children,
  ...aria
}: SheetProps) {
  const [mounted, setMounted] = useState(isPresented);
  useEffect(() => {
    if (isPresented) setMounted(true);
  }, [isPresented]);
  if (!mounted) return null;
  return (
    <SheetInner
      isPresented={isPresented}
      onGone={() => setMounted(false)}
      onDismiss={onDismiss}
      detents={detents}
      initialDetent={initialDetent}
      onDetentChange={onDetentChange}
      largestUndimmedDetent={largestUndimmedDetent}
      dismissible={dismissible}
      grabber={grabber}
      label={aria['aria-label']}
    >
      {children}
    </SheetInner>
  );
}

function SheetInner({
  isPresented,
  onGone,
  onDismiss,
  detents,
  initialDetent,
  onDetentChange,
  largestUndimmedDetent,
  dismissible,
  grabber,
  label,
  children,
}: Omit<SheetProps, 'aria-label'> & { detents: DetentName[]; dismissible: boolean; grabber: boolean; onGone(): void; label?: string }) {
  const ctx = useLiquid();
  const { viewport, safeArea, renderer } = ctx;
  const H = viewport.height;
  const W = viewport.width;
  const index = useModalIndex();
  const z = zBands.sheet(index);
  const largeTop = detentTop('large', H, safeArea.top);
  const mediumTop = detentTop('medium', H, safeArea.top);
  const hasLarge = detents.includes('large');
  const hasMedium = detents.includes('medium');
  const detentTops = detents.map((d) => (d === 'large' ? largeTop : mediumTop));
  const largest = Math.min(...detentTops);
  const lowest = Math.max(...detentTops);
  const startTop = (initialDetent ?? detents[0]) === 'large' ? largeTop : mediumTop;
  const geo = useRef({ largest, lowest, largeTop, mediumTop, hasLarge, hasMedium, detentTops, dismissible, H, W });
  geo.current = { largest, lowest, largeTop, mediumTop, hasLarge, hasMedium, detentTops, dismissible, H, W };
  const contentH = H - largeTop;

  const dimRef = useRef<Layer | null>(null);
  const backRef = useRef<Layer | null>(null);
  const contentRef = useRef<Layer | null>(null);
  const glass = useRef<GlassShape | null>(null);
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;
  const onDetentRef = useRef(onDetentChange);
  onDetentRef.current = onDetentChange;
  const closing = useRef(false);

  const top = useSpring(H, springs.sheet);
  const lift = useSpring(1, springs.interactive);
  const opaque = useSpring(sheetOpaque(startTop, hasMedium ? mediumTop : null, hasLarge ? largeTop : null) ? 1 : 0, springs.sheet);

  useLayoutEffect(() => {
    glass.current = renderer.addGlass({ rect: { x: 0, y: H, width: W, height: contentH }, radius: radii.sheetMediumTop, z: z + 1 });
    ctx.requestFrame();
    return () => {
      glass.current?.remove();
      glass.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer]);

  const innerRef = useRef<HTMLDivElement | null>(null);
  // Per-frame geometry.
  useEffect(() => {
    const apply = () => {
      const g = geo.current;
      const t = top.value;
      const e = sheetExpansion(t, g.hasMedium ? g.mediumTop : g.largeTop, g.largeTop);
      const base = g.hasMedium || !g.hasLarge ? sheetScale(e) : 1;
      const s = base * lift.value;
      const y = t + sheetVisualOffset(base);
      const m = new DOMMatrix().translate(g.W / 2, y).scale(s, s).translate(-g.W / 2, 0);
      const r = sheetTopRadius(g.hasMedium ? e : 1);
      // The sheet is H − top tall (the medium sheet ends 8 pt above the screen edge once scaled).
      const visH = Math.max(0, g.H - t) * s;
      const clip = { x: g.W / 2 - (g.W / 2) * s, y, width: g.W * s, height: visH };
      for (const l of [contentRef.current, backRef.current]) {
        if (!l) continue;
        l.transform = m;
        l.cornerRadius = r;
        l.clip = clip;
      }
      // Rounded bottom edge at the visible height (54 at medium, 0 at large), in unscaled layer coordinates.
      const inner = innerRef.current;
      const cut = Math.round(Math.max(0, g.H - g.largeTop - (g.H - t)));
      const bottomR = Math.round(radii.sheetMediumBottom * (1 - e));
      const cp = `inset(0 0 ${cut}px 0 round ${r}px ${r}px ${bottomR}px ${bottomR}px)`;
      if (inner && inner.style.clipPath !== cp) inner.style.clipPath = cp;
      const backAlpha = Math.max(0, Math.min(1, opaque.value));
      if (backRef.current) backRef.current.opacity = backAlpha;
      const gl = glass.current;
      if (gl) {
        gl.rect = clip;
        gl.radius = r * s;
        gl.bottomRadius = radii.sheetMediumBottom * (1 - e) * s;
        // Once the opaque background (same transform, radius and clip, drawn above the glass) is fully in, the glass
        // is invisible: drop it so the CSS renderer stops running a sheet-sized backdrop blur under an opaque sheet.
        gl.visible = t < g.H && backAlpha < 0.999;
      }
      const dim = dimRef.current;
      if (dim) {
        const f = sheetDimming(t, g.H, g.largeTop, g.mediumTop, g.lowest, largestUndimmedDetent === 'medium');
        dim.opacity = f;
        dim.visible = f > 0.001;
        const pe = f > 0.01 ? 'auto' : 'none';
        if (dim.element.style.pointerEvents !== pe) dim.element.style.pointerEvents = pe;
      }
      // SH §4: glass → opaque past the midpoint (spring on the background alpha).
      const want = sheetOpaque(t, g.hasMedium ? g.mediumTop : null, g.hasLarge ? g.largeTop : null) ? 1 : 0;
      if (opaque.target !== want) opaque.set(want, { params: springs.sheet });
    };
    const offs = [ctx.onBeforeFrame(apply)];
    ctx.requestFrame();
    return () => offs.forEach((f) => f());
  }, [ctx, top, lift, opaque, largestUndimmedDetent]);

  const settleTo = (target: number, velocity: number) => {
    const g = geo.current;
    top.set(target, { params: sheetReleaseSpring(velocity), velocity });
    if (target >= g.H - 0.5) {
      closing.current = true;
      onDismissRef.current?.();
    } else {
      const d: DetentName = Math.abs(target - g.largeTop) < Math.abs(target - g.mediumTop) ? 'large' : 'medium';
      onDetentRef.current?.(d);
    }
  };

  // Present / dismiss.
  useEffect(() => {
    if (isPresented) {
      closing.current = false;
      if (top.value >= H - 0.5) top.snap(H);
      top.set(startTop, { params: springs.sheet }); // TR §3b: present on the sheet curve (ζ 1, 0.3441)
    } else {
      closing.current = true;
      top.set(H, { params: springs.sheet });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresented]);
  useEffect(
    () =>
      top.subscribe((v, s) => {
        if (closing.current && s.settled && v >= geo.current.H - 0.5) onGone();
      }),
    [top, onGone],
  );

  const release = (velocity: number) => {
    const g = geo.current;
    const pts = g.dismissible ? [...g.detentTops, g.H] : g.detentTops;
    settleTo(sheetReleaseTarget(pts, top.value, velocity), velocity);
  };

  // Drag on the sheet (outside inner scroll views) + press lift.
  useEffect(() => {
    const el = contentRef.current?.element;
    if (!el) return;
    const tracker = new VelocityTracker();
    let start = 0;
    let startY = 0;
    const lowestPoint = () => (geo.current.dismissible ? geo.current.H : geo.current.lowest);
    const rec = {
      decide(s: { dx: number; dy: number }) {
        const h = gestureThresholds.panHysteresis;
        if (Math.abs(s.dy) >= h && Math.abs(s.dy) >= Math.abs(s.dx)) return 'claim' as const;
        if (Math.abs(s.dx) >= h) return 'fail' as const;
        return 'wait' as const;
      },
      onBegin(s: { event: PointerEvent }) {
        start = top.value;
        startY = s.event.clientY;
        tracker.reset();
      },
      onMove(s: { event: PointerEvent }) {
        tracker.add(s.event.timeStamp, s.event.clientY);
        top.snap(constrainSheetTop(start + (s.event.clientY - startY), geo.current.largest, lowestPoint()));
      },
      onEnd(_s: unknown, cancelled: boolean) {
        release(cancelled ? 0 : tracker.velocity());
      },
    };
    const onDown = (e: PointerEvent) => {
      // SH §3 press lift ×1.0077 (~0.15 s, small overshoot).
      lift.set(metrics.sheetPressScale, { params: springs.interactive });
      ctx.gestures.track(e, rec);
      // Scroll views inside register before us (inner first); a drag there is handled by the bridge.
    };
    const onUp = () => lift.set(1, { params: springs.sheetBoundary }); // back within ~2 frames (ζ 1, 0.1)
    el.addEventListener('pointerdown', onDown);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.gestures, contentRef.current]);

  // Scroll hand-off bridge (SH §1).
  const bridge = useMemo<SheetScrollBridge>(() => {
    let start = 0;
    let took = false;
    let lastEnd = -Infinity;
    return {
      scrollDragBegin() {
        start = top.value;
        took = false;
      },
      scrollDragMove(i) {
        const g = geo.current;
        const r = sheetScrollHandoff({
          ...i,
          distanceToLargestDetent: Math.max(0, start - g.largest),
          timeSinceLastPanEnd: (performance.now() - lastEnd) / 1000,
          sheetAnimating: !top.settled,
          sheetDragging: false,
          dismissibleByDragging: g.dismissible,
        });
        if (!r.handoff) {
          if (took) top.snap(constrainSheetTop(start, g.largest, g.dismissible ? g.H : g.lowest));
          return null;
        }
        took = true;
        top.snap(constrainSheetTop(start + r.sheetTranslation, g.largest, g.dismissible ? g.H : g.lowest));
        return { scrollOffset: r.scrollOffset, zeroScrollVelocity: r.zeroScrollVelocity };
      },
      scrollDragEnd(fingerVelocity) {
        lastEnd = performance.now();
        if (!took) return false;
        took = false;
        release(fingerVelocity);
        return true;
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [top]);

  const channel = useMemo(() => new ScrollChannel(null), []);
  const insets = useMemo(() => ({ top: 0, bottom: safeArea.bottom }), [safeArea.bottom]);
  const dimColor = colors[ctx.appearance].sheetDimming;

  return (
    <>
      <LayerView
        ref={(l) => {
          dimRef.current = l;
        }}
        z={z}
        aria-hidden="true"
        onClick={() => {
          if (dismissible) settleTo(H, 0);
        }}
        className="lq-solid"
        style={{ background: dimColor }}
      />
      <LayerView
        ref={(l) => {
          backRef.current = l;
        }}
        z={z + 2}
        height={contentH}
        aria-hidden="true"
        style={{ background: 'var(--lq-system-background)', pointerEvents: 'none' }}
      />
      <LayerView
        ref={(l) => {
          contentRef.current = l;
        }}
        z={z + 3}
        height={contentH}
        role="dialog"
        aria-modal={true}
        aria-label={label}
        className="lq-sheet lq-solid"
        style={{ overflow: 'hidden', color: 'var(--lq-label)' }}
      >
        {/* Own compositing layer: its clip-path changes every frame while the sheet moves; composited, WebKit applies it
            as a shape mask instead of repainting the whole sheet each frame. */}
        <div ref={innerRef} style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', willChange: 'transform' }}>
        {grabber && (
          <div
            aria-hidden
            style={{
              position: 'absolute',
              top: 6,
              left: '50%',
              marginLeft: -30,
              width: 60,
              height: 4,
              borderRadius: 2,
              background: 'var(--lq-sheet-grabber)',
              zIndex: 5,
            }}
          />
        )}
        <ZBaseContext.Provider value={z + 3}>
        <InSheetContext.Provider value={true}>
          <SheetScrollContext.Provider value={bridge}>
            <ScrollChannelContext.Provider value={channel}>
              <BarInsetsContext.Provider value={insets}>
                <TabBarPresentContext.Provider value={false}>{children}</TabBarPresentContext.Provider>
              </BarInsetsContext.Provider>
            </ScrollChannelContext.Provider>
          </SheetScrollContext.Provider>
        </InSheetContext.Provider>
        </ZBaseContext.Provider>
        </div>
      </LayerView>
    </>
  );
}

export function useInSheet(): boolean {
  return useContext(InSheetContext);
}
