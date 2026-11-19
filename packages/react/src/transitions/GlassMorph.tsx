/**
 * `GlassCardButton`: a glass button whose glass grows into a full-screen card (`preferredTransition = .zoom` from a
 * glass button, deep/sheets/findings.md §6).
 *
 * - Present full screen. The source button's glass becomes the card's edge: the button glass is hidden and a card
 *   glass of the same style grows from its rect, centred on the button horizontally, its vertical centre moving to the
 *   screen centre. Width spring ≈ ζ 0.75 / 0.5 s, height ≈ ζ 0.65 / 0.48 s (rough video fits). Corner radius from the
 *   capsule through ~96 mid-flight to the display radius 62.
 * - Presented content fades in over 0.2 s starting ≈0.07 s after the tap. The presenting layer recedes to ×0.921.
 * - Dismiss: the card shrinks back into the button while its content fades out quickly; the button glass reappears
 *   with the measured bounce (1.204 → 1.144 → 1.017 → 0.944 → 1.012 → 1 over ≈0.7 s).
 * - Interactive dismiss: drag down anywhere; the top follows the finger, the width shrinks ≈0.23 pt per pt and the
 *   corners go 62 → 48; release past 120 pt or flicked down flies into the button, otherwise it springs back.
 *   TODO(unknown): the release threshold was not measured; the sheet's 1000 pt/s rule is reused for flicks.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { radii, springs, VelocityTracker } from '@liquid-gpu/core';
import type { GlassShape, Layer, Rect } from '@liquid-gpu/gpu';
import { cssVar, LayerContext, LayerView, useGlassCore, useLayerContext, useLiquid, type GlassGeometry, type GlassHandle } from '../root';
import { Button, type ButtonProps } from '../controls/Button';
import { holdFrames, releaseVelocity, useMotion } from '../controls/motion';
import { useControllable } from '../controls/internal';
import { glassMorph, glassMorphContentOpacity, glassMorphDragRect, glassMorphRadius, glassMorphRect, lerpRect } from './logic';

export interface GlassCardButtonProps extends Omit<ButtonProps, 'onClick' | 'glassRef' | 'children' | 'variant'> {
  variant?: 'glass' | 'prominentGlass' | 'clearGlass';
  label?: ReactNode;
  /** Card content; `close()` dismisses. */
  children: ReactNode | ((close: () => void) => ReactNode);
  isPresented?: boolean;
  onPresentedChange?: (presented: boolean) => void;
  /** z band. Default 7200. */
  z?: number;
}

type Phase = 'idle' | 'open' | 'closing';
const ZERO: Rect = { x: 0, y: 0, width: 1, height: 1 };
const CLOSE = { dampingRatio: 1, response: 0.3 }; // TODO(unknown): SH §6 dismiss visible ≈0.1 s; critically damped 0.3 s
const BOUNCE_T = [0, 0.12, 0.26, 0.4, 0.55, 0.7]; // SH §6 keyframe times (≈0.7 s total; evenly read from deep dumps)

export function GlassCardButton({
  label,
  children,
  isPresented,
  onPresentedChange,
  variant = 'glass',
  z = 7200,
  ...buttonProps
}: GlassCardButtonProps) {
  const ctx = useLiquid();
  const presenter = useLayerContext();
  const [presented, setPresented] = useControllable(isPresented, false, onPresentedChange);
  const [phase, setPhaseState] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const glass = useRef<GlassHandle | null>(null);
  const [content, setContent] = useState<Layer | null>(null);
  const clipEl = useRef<HTMLDivElement | null>(null);
  const src = useRef<{ rect: Rect; radius: number } | null>(null);
  const t0 = useRef(0);
  const closeFrom = useRef<{ rect: Rect; radius: number; opacity: number } | null>(null);
  const presenterBase = useRef<DOMMatrix | null>(null);
  const bounceT0 = useRef(0);
  const release = useRef<(() => void) | null>(null);

  const pw = useMotion(0, glassMorph.width);
  const ph = useMotion(0, glassMorph.height);
  const q = useMotion(0, CLOSE);
  const drag = useMotion(0, springs.interactive);


  const vp = (): Rect => ({ x: 0, y: 0, width: ctx.viewport.width, height: ctx.viewport.height });

  // Geometry of the card now.
  const cardGeom = (): { rect: Rect; radius: number; opacity: number } | null => {
    const s = src.current;
    if (!s) return null;
    const V = vp();
    if (phaseRef.current === 'closing' && closeFrom.current) {
      const f = closeFrom.current;
      const k = Math.max(0, q.value);
      const rect = lerpRect(s.rect, f.rect, k);
      return { rect, radius: s.radius + (f.radius - s.radius) * k, opacity: f.opacity * Math.max(0, k * 3 - 2) };
    }
    const d = drag.value;
    if (d > 0.5) {
      const r = glassMorphDragRect(V, d);
      return { rect: r, radius: r.radius, opacity: 1 };
    }
    const rect = glassMorphRect(s.rect, V, pw.value, ph.value);
    return {
      rect,
      radius: glassMorphRadius(s.radius, rect.width, rect.height, pw.value, ph.value),
      opacity: glassMorphContentOpacity((performance.now() - t0.current) / 1000),
    };
  };

  useGlassCore(ZERO, { style: variant === 'clearGlass' ? 'clear' : 'regular', z: z + 1 }, (_g: GlassGeometry, shape: GlassShape) => {
    const g = phaseRef.current === 'idle' ? null : cardGeom();
    if (!g) {
      shape.visible = false;
      return;
    }
    shape.rect = g.rect;
    shape.radius = g.radius;
    shape.visible = true;
  });

  // Per frame: hide the source glass while the card exists, write the content layer, recede the presenter, bounce.
  useLayoutEffect(() => {
    const off = ctx.onBeforeFrame(() => {
      const h = glass.current;
      const ph_ = phaseRef.current;
      if (h?.shape && h.layer) {
        if (ph_ !== 'idle') {
          h.shape.visible = false;
          h.layer.opacity = 0;
        } else if (bounceT0.current) {
          const t = (performance.now() - bounceT0.current) / 1000;
          const ks = glassMorph.buttonBounce;
          let s = 1;
          if (t >= BOUNCE_T[BOUNCE_T.length - 1]!) bounceT0.current = 0;
          else
            for (let i = 1; i < BOUNCE_T.length; i++)
              if (t <= BOUNCE_T[i]!) {
                const u = (t - BOUNCE_T[i - 1]!) / (BOUNCE_T[i]! - BOUNCE_T[i - 1]!);
                s = ks[i - 1]! + (ks[i]! - ks[i - 1]!) * (0.5 - 0.5 * Math.cos(Math.PI * u));
                break;
              }
          const r = h.shape.rect;
          const cx = r.x + r.width / 2;
          const cy = r.y + r.height / 2;
          h.shape.rect = { x: cx - (r.width * s) / 2, y: cy - (r.height * s) / 2, width: r.width * s, height: r.height * s };
          h.shape.radius *= s;
          h.layer.transform = new DOMMatrix().translate(cx, cy).scale(s).translate(-cx, -cy).multiply(h.layer.transform);
          h.layer.opacity = 1;
        } else h.layer.opacity = 1;
      }
      const g = ph_ === 'idle' ? null : cardGeom();
      if (content) {
        content.visible = !!g;
        if (g) {
          content.opacity = Math.min(1, Math.max(0, g.opacity));
          // The content follows the card (uniform by width), so nested glass (which follows its layer) moves with it.
          const W = ctx.viewport.width;
          const H = ctx.viewport.height;
          const s = Math.max(0.01, g.rect.width / W);
          content.transform = new DOMMatrix().translate(g.rect.x, g.rect.y).scale(s);
          const el = clipEl.current;
          if (el) {
            const h = g.rect.height / s;
            el.style.clipPath = `inset(0px 0px ${Math.max(0, H - h).toFixed(2)}px 0px round ${(g.radius / s).toFixed(2)}px)`;
          }
        }
      }
      // Presenter recede (SH §6 ×0.921).
      if (presenter.layer && presenterBase.current) {
        const prog = ph_ === 'closing' ? Math.max(0, q.value) : ph_ === 'open' ? Math.min(1, Math.max(0, pw.value)) * (1 - Math.min(1, drag.value / 600)) : 0;
        const s = 1 + (glassMorph.presenterScale - 1) * prog;
        const V = vp();
        presenter.layer.transform = new DOMMatrix()
          .translate(V.width / 2, V.height / 2)
          .scale(s)
          .translate(-V.width / 2, -V.height / 2)
          .multiply(presenterBase.current);
      }
      if (ph_ === 'closing' && q.value <= 0.003 && Math.abs(q.velocity) < 0.05) queueMicrotask(finishClose);
    });
    ctx.requestFrame();
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, presenter.layer]);

  const open = () => {
    const g = glass.current?.geometry();
    if (!g) return;
    src.current = { rect: g.rect, radius: Math.min(g.rect.width, g.rect.height) / 2 };
    if (presenter.layer && !presenterBase.current) presenterBase.current = DOMMatrix.fromMatrix(presenter.layer.transform);
    t0.current = performance.now();
    pw.snap(0);
    ph.snap(0);
    drag.snap(0);
    release.current?.();
    release.current = holdFrames(ctx); // the content fade is time-based
    setTimeout(() => {
      release.current?.();
      release.current = null;
    }, 400);
    setPhase('open');
    pw.set(1, { params: glassMorph.width });
    ph.set(1, { params: glassMorph.height });
  };
  const close = () => {
    if (phaseRef.current !== 'open') return;
    const g = cardGeom();
    if (!g) return;
    const s = glass.current?.geometry();
    if (s && src.current) src.current = { rect: s.rect, radius: src.current.radius };
    closeFrom.current = g;
    q.snap(1);
    setPhase('closing');
    q.set(0, { params: CLOSE });
  };
  const finishClose = () => {
    if (phaseRef.current !== 'closing') return;
    setPhase('idle');
    bounceT0.current = performance.now();
    const r = holdFrames(ctx);
    setTimeout(r, 800);
    if (presenter.layer && presenterBase.current) presenter.layer.transform = presenterBase.current;
    presenterBase.current = null;
    ctx.requestFrame();
  };

  // Controlled `isPresented`.
  useEffect(() => {
    if (presented && phaseRef.current === 'idle') open();
    else if (!presented && phaseRef.current === 'open') close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presented]);

  // Interactive dismiss: drag down anywhere on the card.
  useEffect(() => {
    const el = content?.element;
    if (!el || phase !== 'open') return;
    const vt = new VelocityTracker();
    const onDown = (e: PointerEvent) => {
      vt.reset();
      let lastMove = e.timeStamp;
      ctx.gestures.track(e, {
        decide: ({ dx, dy }) => (dy > 10 && dy > Math.abs(dx) ? 'claim' : Math.hypot(dx, dy) > 10 ? 'fail' : 'wait'),
        onMove: (s) => {
          vt.add(s.event.timeStamp, s.dy);
          lastMove = s.event.timeStamp;
          drag.set(Math.max(0, s.dy - 10), { params: springs.interactive });
        },
        onEnd: (s, cancelled) => {
          const v = releaseVelocity(vt.velocity(), lastMove, s.event.timeStamp);
          if (!cancelled && (s.dy > 120 || v > 1000)) {
            setPresented(false);
            if (isPresented === undefined) close();
          } else drag.set(0, { params: springs.zoomCancel });
        },
      });
    };
    el.addEventListener('pointerdown', onDown);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPresented(false);
        if (isPresented === undefined) close();
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, phase]);

  const requestClose = () => {
    setPresented(false);
    if (isPresented === undefined) close();
  };
  return (
    <>
      <Button
        {...buttonProps}
        variant={variant}
        glassRef={glass}
        aria-haspopup="dialog"
        aria-expanded={phase === 'open'}
        onClick={() => {
          setPresented(true);
          if (isPresented === undefined && phaseRef.current === 'idle') open();
        }}
      >
        {label}
      </Button>
      {phase !== 'idle' && (
        <LayerView ref={setContent} z={z + 2} role="dialog" aria-modal="true" className="lq-solid" opacity={0} style={{ touchAction: 'none' }}>
          <div ref={clipEl} style={{ position: 'absolute', inset: 0, background: cssVar('systemBackground'), borderRadius: radii.display, overflow: 'hidden' }}>
            <NestedVisibility visible={phase === 'open'}>{typeof children === 'function' ? children(requestClose) : children}</NestedVisibility>
          </div>
        </LayerView>
      )}
    </>
  );
}

/** Hides nested glass (which cannot be clipped or faded) while the card shrinks back into its button. */
function NestedVisibility({ visible, children }: { visible: boolean; children: ReactNode }) {
  const parent = useLayerContext();
  if (visible) return <>{children}</>;
  return <LayerContext.Provider value={{ ...parent, visible: false }}>{children}</LayerContext.Provider>;
}
