/**
 * `Tooltip`: UIToolTipInteraction (components/text_overlays.md §10.5). The class exists, but tooltips only present
 * with a pointer (iPad / Mac Catalyst); nothing renders on iPhone, so no metrics were extracted.
 *
 * Here: a regular-glass capsule above the anchor (below when there is no room), shown on pointer hover after a delay,
 * on keyboard focus, and on touch long-press. Wrap the anchor: `<Tooltip text="Share"><Button …/></Tooltip>`.
 * - Long-press: 0.725 s, the UIKit long-press click commit time, with 10 pt allowable movement
 *   (findings/transitions.md "Long-press commit time" / `_allowableMovement`).
 * - TODO(unknown): hover delay (0.5 s), gap to the anchor (8 pt), height (28 pt), padding (12 pt), font (footnote 13),
 *   10 pt side inset (the popover `_containingFrameInsets`, text_overlays §10.4), touch auto-hide (1.5 s).
 * - Motion: fade + scale 0.9 → 1 on the menu open/close springs (core `springs.menuOpen` / `menuClose`).
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { springs } from '@liquid-gpu/core';
import type { GlassShape, Layer, Rect } from '@liquid-gpu/gpu';
import { LayerView, useGlassCore, useLiquid, zBands, type GlassGeometry } from '../root';
import { useMotion } from '../controls/motion';
import { usePresence } from '../menus/overlay';

export interface TooltipProps {
  /** Tooltip text. */
  text: string;
  children: ReactNode;
  /** Preferred side. Default `top`. */
  placement?: 'top' | 'bottom';
  /** Hover delay in seconds. Default 0.5 (TODO(unknown)). */
  delay?: number;
  disabled?: boolean;
  /** Controlled visibility (otherwise hover / focus / long-press). */
  isPresented?: boolean;
  onPresentedChange?: (shown: boolean) => void;
  className?: string;
  style?: CSSProperties;
}

const LONG_PRESS = 0.725; // findings/transitions.md clickTimeoutDuration
const ALLOWABLE_MOVE = 10; // findings/transitions.md _allowableMovement
const GAP = 8; // TODO(unknown)
const HEIGHT = 28; // TODO(unknown)
const SIDE_INSET = 10; // text_overlays §10.4 _containingFrameInsets (borrowed)
const TOUCH_HIDE = 1.5; // TODO(unknown)
const ZERO: Rect = { x: 0, y: 0, width: 1, height: 1 };

export function Tooltip({ text, children, placement = 'top', delay = 0.5, disabled, isPresented, onPresentedChange, className, style }: TooltipProps) {
  const [inner, setInner] = useState(false);
  const tipId = useId();
  const shown = (isPresented ?? inner) && !disabled;
  const anchor = useRef<HTMLSpanElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const set = (s: boolean) => {
    if (isPresented === undefined) setInner(s);
    onPresentedChange?.(s);
  };
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => clear, []);
  const later = (s: number, fn: () => void) => {
    clear();
    timer.current = setTimeout(fn, s * 1000);
  };
  return (
    <>
      <span
        ref={anchor}
        className={className}
        style={{ display: 'inline-flex', ...style }}
        aria-describedby={shown ? tipId : undefined}
        onPointerEnter={(e) => e.pointerType === 'mouse' && later(delay, () => set(true))}
        onPointerLeave={(e) => {
          if (e.pointerType !== 'mouse') return;
          clear();
          set(false);
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') {
            clear();
            set(false);
            return;
          }
          start.current = { x: e.clientX, y: e.clientY };
          later(LONG_PRESS, () => {
            set(true);
            later(TOUCH_HIDE, () => set(false));
          });
        }}
        onPointerMove={(e) => {
          const s = start.current;
          if (s && e.pointerType !== 'mouse' && Math.hypot(e.clientX - s.x, e.clientY - s.y) > ALLOWABLE_MOVE) {
            start.current = null;
            if (!shown) clear();
          }
        }}
        onPointerUp={(e) => {
          start.current = null;
          if (e.pointerType !== 'mouse' && !shown) clear();
        }}
        onFocus={() => set(true)}
        onBlur={() => {
          clear();
          set(false);
        }}
        onContextMenu={(e) => shown && e.preventDefault()}
      >
        {children}
      </span>
      <TooltipPresence shown={shown} id={tipId} text={text} anchor={anchor} placement={placement} />
    </>
  );
}

function TooltipPresence({ shown, ...p }: { shown: boolean; id: string; text: string; anchor: RefObject<HTMLElement | null>; placement: 'top' | 'bottom' }) {
  const { mounted, exiting, done } = usePresence(shown);
  if (!mounted) return null;
  return <TooltipView {...p} exiting={exiting} onExited={done} />;
}

function TooltipView({ id, text, anchor, placement, exiting, onExited }: { id: string; text: string; anchor: RefObject<HTMLElement | null>; placement: 'top' | 'bottom'; exiting: boolean; onExited: () => void }) {
  const ctx = useLiquid();
  const [layer, setLayer] = useState<Layer | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const place = useRef<Rect | null>(null);
  const p = useMotion(0, springs.menuOpen);
  const measure = () => {
    const a = anchor.current?.getBoundingClientRect();
    const el = elRef.current;
    if (!a || !el) return;
    const w = el.offsetWidth;
    const above = a.top - GAP - HEIGHT >= ctx.safeArea.top;
    const below = a.bottom + GAP + HEIGHT <= ctx.viewport.height - ctx.safeArea.bottom;
    const top = placement === 'top' ? above || !below : !below && above;
    const x = Math.min(ctx.viewport.width - SIDE_INSET - w, Math.max(SIDE_INSET, a.left + a.width / 2 - w / 2));
    place.current = { x, y: top ? a.top - GAP - HEIGHT : a.bottom + GAP, width: w, height: HEIGHT };
  };
  const current = (): (Rect & { s: number }) | null => {
    const r = place.current;
    if (!r) return null;
    const s = 0.9 + 0.1 * Math.max(0, p.value); // TODO(unknown) start scale
    const width = r.width * s;
    const height = r.height * s;
    return { x: r.x + (r.width - width) / 2, y: r.y + (r.height - height) / 2, width, height, s };
  };
  useGlassCore(ZERO, { style: 'regular', z: zBands.toast + 11 }, (_g: GlassGeometry, shape: GlassShape) => {
    const r = current();
    if (!r) {
      shape.visible = false;
      return;
    }
    shape.rect = r;
    shape.radius = r.height / 2;
    shape.opacity = Math.max(0, Math.min(1, p.value));
    shape.visible = shape.opacity > 0.001;
  });
  useLayoutEffect(() => {
    if (!layer) return;
    measure();
    const off = ctx.onBeforeFrame(() => {
      const r = current();
      if (!r) return;
      layer.transform = new DOMMatrix().translate(r.x, r.y).scale(r.s);
      layer.opacity = Math.max(0, Math.min(1, p.value));
      if (exiting && p.value < 0.02) queueMicrotask(onExited);
    });
    if (exiting) p.set(0, { params: springs.menuClose });
    else p.set(1, { params: springs.menuOpen });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, exiting]);
  return (
    <LayerView ref={setLayer} z={zBands.toast + 12} width="auto" height={HEIGHT}>
      <div
        ref={elRef}
        id={id}
        role="tooltip"
        className="lq-footnote"
        style={{ height: HEIGHT, display: 'flex', alignItems: 'center', padding: '0 12px', whiteSpace: 'nowrap', color: 'var(--lq-label)', pointerEvents: 'none' }}
      >
        {text}
      </div>
    </LayerView>
  );
}
