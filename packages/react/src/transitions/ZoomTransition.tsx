/**
 * `ZoomTransition`: tap a thumbnail to open a full-screen viewer, swipe down to close (Photos-style).
 *
 * Sources: PT = deep/photos-transition/findings.md, TR = findings/transitions.md §4.
 *
 * Modes:
 * - `zoom` (UIKit `.zoom`, PT §3): a card morphs from the cell to full screen on zoomIn (ζ1, 0.34 s, impulse 0.016)
 *   with v0 ≈ 6.5 × distance/s; corner radius on its own spring (ζ1, 0.35) from the cell radius to the display radius;
 *   platter shadow 0.4 / 40 / (0, 10); dimming black 0.15; the presenting layer recedes to ×0.9212
 *   (scaleDownPoints 34.67). Close: zoomOut (ζ 0.92, 0.34).
 * - `tile` (Photos `PUOneUpAssetNavigationTransition`, PT §4): ζ1, 0.3 s, square corners, the background crossfades
 *   to the viewer colour.
 *
 * Swipe down: nothing within 15 pt; then the photo follows the finger (1:1 in tile mode, 0.6× in zoom mode) and
 * scales down (zoom: 0.954 @ 98, 0.866 @ 222, 0.806 @ 300 pt). Release: dismiss flies back to the cell (zoom:
 * zoomOutInteractive ζ1 0.4; tile: ζ1 0.2 s, PT §5), carrying the finger velocity; cancel springs back (ζ1, 0.25).
 * Decision rules in `logic.ts` (`swipeDownShouldDismiss`).
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { pagingFriction, pagingSpringPull, pagingStep, VelocityTracker } from '@liquid-gpu/core';
import type { Layer, Rect } from '@liquid-gpu/gpu';
import { cssVar, LayerView, measureInLayer, transformRect, useLayerContext, useLiquid, zBands } from '../root';
import { holdFrames, releaseVelocity, useMotion } from '../controls/motion';
import { usePresence } from '../menus/overlay';
import { fitRect, lerpRect, ONE_UP_PAGE_SPACING, PAGE_AXIS_HYSTERESIS, pageDragOffset, pageReleaseStep, swipeDownOffset, swipeDownProgress, swipeDownScale, swipeDownShouldDismiss, SWIPE_HYSTERESIS, zoomModes, type ZoomMode } from './logic';

/** A neighbouring page of the viewer (horizontal paging). */
export interface ZoomPage {
  content: ReactNode;
  /** Content aspect (w/h). */
  aspect: number;
}

/**
 * Horizontal paging between items (Photos one-up): the photo follows the finger, neighbours sit one viewport width +
 * 40 pt away (`PUOneUpSettings.interpageSpacing`), release pages on the UIScrollView paging rule and spring.
 */
export interface ZoomPaging {
  /** Identity of the current item; when it changes the pager snaps back to the centre page. */
  key: string;
  prev?: ZoomPage | null;
  next?: ZoomPage | null;
  /** The pager settled on a neighbour: show it (update `children`, `aspect`, `sourceRef` and this prop). */
  onPage(direction: -1 | 1): void;
}

export interface ZoomTransitionProps {
  isPresented: boolean;
  /** The thumbnail the viewer zooms out of and back into. */
  sourceRef: RefObject<HTMLElement | null>;
  /** Called when the viewer asks to close (swipe-down dismiss, Escape). Set `isPresented` false here. */
  onDismiss: () => void;
  /** Content aspect (w/h), used to fit it in the viewer and aspect-fill the source. Default: the source's aspect. */
  aspect?: number;
  mode?: ZoomMode;
  /** Corner radius of the source cell. Default 0 (tile) / read from the element's border-radius (zoom). */
  sourceRadius?: number;
  /** Viewer background. Default systemBackground. */
  background?: string;
  /** Viewer content (e.g. the photo); it is laid out in the fitted rect. */
  children: ReactNode;
  /** Chrome drawn over the viewer (close button, toolbar); fades with the transition. */
  overlay?: ReactNode;
  /** Called every frame with the chrome opacity (0…1), to fade glass chrome that draws on its own layers. */
  onChromeOpacity?: (opacity: number) => void;
  /** Open already settled (no zoom), e.g. after a context-menu `.pop` commit has drawn the morph. */
  immediate?: boolean;
  /** Swipe left / right between neighbouring items. */
  paging?: ZoomPaging;
  /** z band. Default 7000 (below menus 8000, above sheets). */
  z?: number;
  'aria-label'?: string;
}

const DEFAULT_Z = 7000;

export function ZoomTransition(props: ZoomTransitionProps) {
  const { mounted, exiting, done } = usePresence(props.isPresented);
  if (!mounted) return null;
  return <ZoomView {...props} exiting={exiting} onExited={done} />;
}

function ZoomView({
  sourceRef,
  onDismiss,
  aspect: aspectProp,
  mode = 'zoom',
  sourceRadius,
  background,
  children,
  overlay,
  onChromeOpacity,
  immediate,
  paging,
  z = DEFAULT_Z,
  exiting,
  onExited,
  ...aria
}: ZoomTransitionProps & { exiting: boolean; onExited: () => void }) {
  const ctx = useLiquid();
  const presenter = useLayerContext(); // the layer the thumbnail lives in (recedes in zoom mode)
  const M = zoomModes[mode];
  const [card, setCard] = useState<Layer | null>(null);
  const dim = useRef<Layer | null>(null);
  const shadow = useRef<Layer | null>(null);
  const chrome = useRef<Layer | null>(null);
  const shadowEl = useRef<HTMLDivElement | null>(null);
  const clipEl = useRef<HTMLDivElement | null>(null);
  const src = useRef<{ rect: Rect; radius: number } | null>(null);
  const presenterBase = useRef<DOMMatrix | null>(null);
  const interactiveClose = useRef(false);

  const p = useMotion(0, M.open);
  const radius = useMotion(0, M.radius);
  const ox = useMotion(0, M.track);
  const oy = useMotion(0, M.track);
  const k = useMotion(1, M.track);
  const travel = useRef(0);
  const chromeT0 = useRef<number | null>(null); // open start (ms) for the chrome fade; null = shown at once
  // Horizontal pager (content offset in pt, finger direction). Integrated per ms with the SMG §4 paging spring.
  const pager = useRef({ pos: 0, v: 0, target: 0, dragging: false, pending: 0 as -1 | 0 | 1, t: 0 });
  const pagingRef = useRef(paging);
  pagingRef.current = paging;
  const aspectRef = useRef(aspectProp);
  aspectRef.current = aspectProp;
  const prevLayer = useRef<Layer | null>(null);
  const nextLayer = useRef<Layer | null>(null);

  const vp: Rect = { x: 0, y: 0, width: ctx.viewport.width, height: ctx.viewport.height };
  const srcEl = useRef<HTMLElement | null>(null); // captured at open (the ref may change or clear while closing)
  const measureSource = (): { rect: Rect; radius: number } | null => {
    const el = sourceRef.current ?? srcEl.current;
    if (!el) return null;
    const local = measureInLayer(el, presenter.element);
    const base = presenterBase.current ?? presenter.layer?.transform;
    const rect = base ? transformRect({ a: base.a, b: base.b, c: base.c, d: base.d, e: base.e, f: base.f }, local) : local;
    const r = sourceRadius ?? (mode === 'tile' ? 0 : parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
    return { rect, radius: r };
  };
  // Read through a ref: the frame callback outlives the render that registered it (the item can change while open).
  const aspect = () => aspectRef.current ?? (src.current ? src.current.rect.width / src.current.rect.height : 1);

  // Per-frame geometry.
  useLayoutEffect(() => {
    if (!card) return;
    const off = ctx.onBeforeFrame(() => {
      const s0 = src.current;
      if (!s0) return;
      const P = Math.max(0, p.value);
      const pc = Math.min(1, P);
      // Pager: integrate the paging spring toward the target page, then hand the page change to the owner.
      const pitch = vp.width + ONE_UP_PAGE_SPACING;
      const pg = pager.current;
      if (!pg.dragging && (pg.pos !== pg.target || pg.v !== 0)) {
        const now = performance.now();
        const steps = Math.min(64, Math.max(1, Math.round(now - pg.t)));
        pg.t = now;
        const pull = pagingSpringPull(pitch);
        const fr = pagingFriction(pitch);
        for (let i = 0; i < steps; i++) [pg.pos, pg.v] = pagingStep(pg.pos, pg.v, pg.target, pull, fr);
        if (Math.abs(pg.target - pg.pos) < 0.5 && Math.abs(pg.v) < 0.01) {
          pg.pos = pg.target;
          pg.v = 0;
          if (pg.pending) {
            const d = pg.pending;
            pg.pending = 0;
            queueMicrotask(() => pagingRef.current?.onPage(d));
          }
        } else ctx.requestFrame();
      }
      const hx = pg.pos;
      const pagerShown = P > 0.999 && !exiting;
      for (const [l, side] of [
        [prevLayer.current, -1],
        [nextLayer.current, 1],
      ] as const) {
        if (!l) continue;
        l.transform = new DOMMatrix().translate(hx + side * pitch, 0);
        l.visible = pagerShown;
      }
      const D = fitRect(vp, aspect()); // photo rect when open
      // Open-state rect, displaced by the drag (scale about the photo centre + offset).
      const kk = k.value;
      const openRect = (r: Rect): Rect => {
        const cx = r.x + r.width / 2 + ox.value;
        const cy = r.y + r.height / 2 + oy.value;
        return { x: cx - (r.width * kk) / 2, y: cy - (r.height * kk) / 2, width: r.width * kk, height: r.height * kk };
      };
      const S = s0.rect;
      const fill = Math.max(S.width / D.width, S.height / D.height); // aspect-fill of the cell
      const scale = fill + (kk - fill) * P;
      const P1 = openRect(D);
      const cx = S.x + S.width / 2 + (P1.x + P1.width / 2 - (S.x + S.width / 2)) * P;
      const cy = S.y + S.height / 2 + (P1.y + P1.height / 2 - (S.y + S.height / 2)) * P;
      card.transform = new DOMMatrix()
        .translate(cx + hx, cy)
        .scale(scale)
        .translate(-(D.x + D.width / 2), -(D.y + D.height / 2));
      // Visible region: the cell → the photo (tile) or the whole card (zoom).
      const region0 = lerpRect(S, mode === 'tile' ? P1 : openRect(vp), P);
      const region = hx === 0 ? region0 : { ...region0, x: region0.x + hx };
      if (mode === 'tile') {
        card.clip = region;
      } else {
        card.clip = undefined;
        const el = clipEl.current;
        if (el) {
          const inv = card.transform.inverse();
          const a = inv.transformPoint(new DOMPoint(region.x, region.y));
          const b = inv.transformPoint(new DOMPoint(region.x + region.width, region.y + region.height));
          const rr = Math.max(0, radius.value) / scale;
          el.style.clipPath = `inset(${a.y.toFixed(2)}px ${(vp.width - b.x).toFixed(2)}px ${(vp.height - b.y).toFixed(2)}px ${a.x.toFixed(2)}px round ${rr.toFixed(2)}px)`;
        }
        // Platter shadow 0.4 / 40 / (0, 10) on the card region (PT §3).
        const sh = shadow.current;
        const se = shadowEl.current;
        if (sh && se) {
          sh.transform = new DOMMatrix().translate(region.x, region.y);
          se.style.width = `${region.width}px`;
          se.style.height = `${region.height}px`;
          se.style.borderRadius = `${Math.max(0, radius.value)}px`;
          sh.opacity = Math.min(1, pc * 1.5) * (1 - swipeDownProgress(travel.current));
        }
      }
      // Background: dim (zoom) or crossfade to the viewer colour (tile), lifted by the drag.
      const d = dim.current;
      if (d) d.opacity = pc * (1 - swipeDownProgress(travel.current) * (mode === 'tile' ? 1 : 0.5));
      // Chrome: on open a linear 0.2 s fade from the first frame of the open (native Photos @151.51 s / 289.91 s:
      // ≈0.083 alpha per 60 Hz frame, = PXOneUp transitionDuration 0.2); closing still follows the progress.
      const fadeIn = chromeT0.current === null ? 1 : Math.min(1, Math.max(0, (performance.now() - chromeT0.current) / 200));
      if (fadeIn < 1) ctx.requestFrame();
      const co = (exiting ? Math.max(0, pc * 2 - 1) : Math.min(fadeIn, pc > 0.001 ? 1 : 0)) * (travel.current > SWIPE_HYSTERESIS ? 0 : 1);
      if (chrome.current) chrome.current.opacity = co;
      onChromeOpacity?.(co);
      // Presenter recede (zoom): 1 → 0.9212 about the viewport centre.
      if (M.presenterScale !== 1 && presenter.layer && presenterBase.current) {
        const s = 1 + (M.presenterScale - 1) * pc;
        presenter.layer.transform = new DOMMatrix()
          .translate(vp.width / 2, vp.height / 2)
          .scale(s)
          .translate(-vp.width / 2, -vp.height / 2)
          .multiply(presenterBase.current);
      }
      if (exiting && P < 0.002 && Math.abs(p.velocity) < 0.05) queueMicrotask(finish);
    });
    ctx.requestFrame();
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, exiting]);

  const finish = () => {
    if (presenter.layer && presenterBase.current) {
      presenter.layer.transform = presenterBase.current;
      presenterBase.current = null;
      ctx.requestFrame();
    }
    const el = srcEl.current;
    if (el) el.style.visibility = '';
    onExited();
  };

  // Open / close.
  useLayoutEffect(() => {
    if (!card) return;
    if (!exiting) {
      if (presenter.layer && !presenterBase.current) presenterBase.current = DOMMatrix.fromMatrix(presenter.layer.transform);
      srcEl.current = sourceRef.current;
      src.current = measureSource();
      if (!src.current) return;
      const el = srcEl.current;
      if (el) el.style.visibility = 'hidden'; // the cell's content is now the card
      chromeT0.current = immediate ? null : performance.now();
      if (immediate) {
        p.snap(1);
        radius.snap(M.destinationRadius);
        ctx.requestFrame();
        return;
      }
      p.snap(0);
      radius.snap(src.current.radius);
      p.set(1, { params: M.open, velocity: M.openVelocity });
      radius.set(M.destinationRadius, { params: M.radius });
      return;
    }
    // Close: back into the (re-measured) cell. The source may have changed while open (another photo shown).
    if (sourceRef.current && sourceRef.current !== srcEl.current) {
      if (srcEl.current) srcEl.current.style.visibility = '';
      srcEl.current = sourceRef.current;
      srcEl.current.style.visibility = 'hidden';
    }
    const s = measureSource();
    if (s) src.current = s;
    const params = interactiveClose.current ? M.commit : M.close;
    p.set(0, { params, velocity: p.velocity });
    radius.set(src.current?.radius ?? 0, { params: M.radius });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, exiting]);

  // Swipe-down.
  useEffect(() => {
    const el = card?.element;
    if (!el || exiting) return;
    const vt = new VelocityTracker();
    const vtx = new VelocityTracker();
    let release: (() => void) | null = null;
    let axis: 'x' | 'y' = 'y';
    const cone = Math.tan((22.5 * Math.PI) / 180); // TR §4 swipeDown cone ±22.5°
    const onDown = (e: PointerEvent) => {
      vt.reset();
      vtx.reset();
      let lastMove = e.timeStamp;
      axis = 'y';
      const pg = pager.current;
      const start = pg.pos; // grabbing a settling pager continues from where it is
      ctx.gestures.track(e, {
        decide: ({ dx, dy }) => {
          const pgs = pagingRef.current;
          if (pgs && (pgs.prev || pgs.next) && Math.hypot(dx, dy) > PAGE_AXIS_HYSTERESIS && Math.abs(dx) > Math.abs(dy)) {
            axis = 'x';
            return 'claim';
          }
          if (Math.hypot(dx, dy) <= SWIPE_HYSTERESIS) return 'wait';
          if (dy > 0 && Math.abs(dx) <= dy * (mode === 'zoom' ? cone : 1)) return 'claim';
          return 'fail';
        },
        onBegin: () => {
          release = holdFrames(ctx);
        },
        onMove: (s) => {
          if (axis === 'x') {
            const pgs = pagingRef.current;
            vtx.add(s.event.timeStamp, s.dx);
            lastMove = s.event.timeStamp;
            pg.dragging = true;
            pg.pending = 0;
            pg.v = 0;
            pg.pos = pageDragOffset(start + s.dx, !!pgs?.prev, !!pgs?.next, vp.width);
            pg.target = pg.pos;
            ctx.requestFrame();
            return;
          }
          vt.add(s.event.timeStamp, s.dy);
          lastMove = s.event.timeStamp;
          const o = swipeDownOffset(mode, s.dx, s.dy);
          travel.current = Math.max(0, s.dy);
          ox.set(o.x, { params: M.track });
          oy.set(o.y, { params: M.track });
          k.set(swipeDownScale(mode, s.dy - SWIPE_HYSTERESIS), { params: M.track });
        },
        onEnd: (s, cancelled) => {
          release?.();
          if (axis === 'x') {
            const pgs = pagingRef.current;
            const vx = cancelled ? 0 : releaseVelocity(vtx.velocity(), lastMove, s.event.timeStamp);
            const pitch = vp.width + ONE_UP_PAGE_SPACING;
            const step = cancelled ? 0 : pageReleaseStep(pg.pos, vx, pitch, !!pgs?.prev, !!pgs?.next);
            pg.dragging = false;
            pg.target = -step * pitch;
            pg.pending = step;
            pg.v = vx / 1000; // pt/ms, the SMG §4 integrator's unit
            pg.t = performance.now();
            ctx.requestFrame();
            return;
          }
          const vy = releaseVelocity(vt.velocity(), lastMove, s.event.timeStamp);
          if (!cancelled && swipeDownShouldDismiss(mode, s.dy, vy)) {
            interactiveClose.current = true;
            // Hand the finger velocity to the progress spring: progress units = travel / distance to the cell.
            const S = src.current?.rect;
            const dist = S ? Math.max(1, Math.abs(vp.height / 2 + oy.value - (S.y + S.height / 2))) : vp.height;
            p.spring.velocity = -Math.abs(vy) / dist;
            onDismiss();
          } else {
            travel.current = 0;
            ox.set(0, { params: M.cancel });
            oy.set(0, { params: M.cancel });
            k.set(1, { params: M.cancel });
          }
        },
        onCancel: () => {
          release?.();
          if (axis === 'x') {
            pg.dragging = false;
            pg.target = 0;
            pg.pending = 0;
            pg.t = performance.now();
            ctx.requestFrame();
          }
        },
      });
    };
    el.addEventListener('pointerdown', onDown);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDismiss();
    addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      removeEventListener('keydown', onKey);
      release?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card, exiting, mode]);

  // A new current item: its content now draws on the centre page, so the pager snaps back without motion.
  useLayoutEffect(() => {
    const pg = pager.current;
    pg.pos = 0;
    pg.v = 0;
    pg.target = 0;
    pg.pending = 0;
    ctx.requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paging?.key]);

  const bg = background ?? cssVar('systemBackground');
  const [, force] = useState(0);
  useLayoutEffect(() => {
    // Re-render once the source is measured so the photo box uses the real aspect.
    if (!aspectProp && src.current) force((n) => n + 1);
  }, [card, aspectProp]);
  const Dl = fitRect(vp, aspect());
  return (
    <>
      <LayerView
        ref={(l) => {
          dim.current = l;
        }}
        z={z}
        opacity={0}
        aria-hidden="true"
        style={{ background: mode === 'tile' ? bg : `rgba(0,0,0,${M.dim})` }}
      />
      {mode === 'zoom' && (
        <LayerView
          ref={(l) => {
            shadow.current = l;
          }}
          z={z + 1}
          width="auto"
          height="auto"
          opacity={0}
          aria-hidden="true"
          style={{ padding: 0 }}
        >
          <div
            ref={shadowEl}
            style={{ boxShadow: `0 ${M.shadow.offsetY}px ${M.shadow.radius}px rgba(0,0,0,${M.shadow.opacity})`, background: 'transparent' }}
          />
        </LayerView>
      )}
      <LayerView ref={setCard} z={z + 2} role="dialog" aria-modal="true" aria-label={aria['aria-label']} className="lq-solid" style={{ touchAction: 'none' }}>
        <div ref={clipEl} style={{ position: 'absolute', inset: 0, background: mode === 'zoom' ? bg : 'transparent' }}>
          <div style={{ position: 'absolute', left: Dl.x, top: Dl.y, width: Dl.width, height: Dl.height, overflow: 'hidden' }}>{children}</div>
        </div>
      </LayerView>
      {paging &&
        ([
          [prevLayer, paging.prev, 'prev'],
          [nextLayer, paging.next, 'next'],
        ] as const).map(([ref, page, name]) => {
          if (!page) return null;
          const r = fitRect(vp, page.aspect);
          return (
            <LayerView
              key={name}
              ref={(l) => {
                ref.current = l;
              }}
              z={z + 2}
              visible={false}
              aria-hidden="true"
              style={{ pointerEvents: 'none' }}
            >
              <div style={{ position: 'absolute', left: r.x, top: r.y, width: r.width, height: r.height, overflow: 'hidden' }}>{page.content}</div>
            </LayerView>
          );
        })}
      {overlay && (
        <LayerView
          ref={(l) => {
            chrome.current = l;
          }}
          z={z + 3}
          opacity={0}
          style={{ pointerEvents: 'none' }}
        >
          {overlay}
        </LayerView>
      )}
    </>
  );
}
