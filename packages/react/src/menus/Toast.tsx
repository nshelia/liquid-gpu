/**
 * `Toast` (a transient glass capsule) and `Popover` (an anchored glass panel).
 *
 * Toast: iOS has no public toast; this follows the system HUD/banner idiom with Liquid Glass. TODO(unknown): no
 * extracted metrics. A regular-glass capsule 48 pt tall (the minimized tab/edit-menu glass height family, motion §3 /
 * text_overlays §10.3) placed 8 pt below the safe-area top (or above the bottom inset), sliding and scaling in on the
 * menu present spring (ζ 0.75, 0.35) and out on the menu dismiss spring.
 *
 * Popover (text_overlays §10.4, adaptive `.none` on iPhone): content `preferredContentSize` (default 250 × 150),
 * placed above or below the source with a 13 pt arrow gap, inside the 10 pt containing-frame side insets;
 * presentation and dismissal 0.35 s (SwiftUI 0.35 s, bounce 0). The panel grows from the source edge
 * (scale 0.6 → 1, TODO(unknown) start scale). Dimming clear; a tap outside dismisses.
 * TODO(unknown): GlassPopoverView radius was not decoded; 26 pt continuous corners are used.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { springFromDurationBounce, springs } from '@liquid-gpu/core';
import type { GlassShape, Layer, Rect } from '@liquid-gpu/gpu';
import { LayerView, OverlayPortal, useGlassCore, useLiquid, zBands, type GlassGeometry } from '../root';
import { useMotion } from '../controls/motion';
import { usePresence } from './overlay';

const ZERO: Rect = { x: 0, y: 0, width: 1, height: 1 };

export interface ToastProps {
  isPresented: boolean;
  children: ReactNode;
  /** Leading icon. */
  icon?: ReactNode;
  /** Auto-dismiss after this many seconds (calls `onDismiss`). Default 2. 0 keeps it up. */
  duration?: number;
  placement?: 'top' | 'bottom';
  onDismiss?: () => void;
}

const TOAST_HEIGHT = 48;

export function Toast(props: ToastProps) {
  const { mounted, exiting, done } = usePresence(props.isPresented);
  if (!mounted) return null;
  return (
    <OverlayPortal>
      <ToastView {...props} exiting={exiting} onExited={done} />
    </OverlayPortal>
  );
}

function ToastView({ children, icon, duration = 2, placement = 'top', onDismiss, exiting, onExited }: ToastProps & { exiting: boolean; onExited: () => void }) {
  const ctx = useLiquid();
  const [layer, setLayer] = useState<Layer | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const w = useRef(200);
  const p = useMotion(0, springs.menuOpen);
  const geom = (): Rect & { s: number } => {
    const s = 0.6 + 0.4 * Math.max(0, p.value);
    const width = w.current * s;
    const height = TOAST_HEIGHT * s;
    const off = (1 - p.value) * (TOAST_HEIGHT + 24);
    const y =
      placement === 'top'
        ? ctx.safeArea.top + 8 - off
        : ctx.viewport.height - ctx.safeArea.bottom - 8 - TOAST_HEIGHT + off;
    return { x: ctx.viewport.width / 2 - width / 2, y: y + (TOAST_HEIGHT - height) / 2, width, height, s };
  };
  useGlassCore(ZERO, { style: 'regular', z: zBands.toast + 1 }, (_g: GlassGeometry, shape: GlassShape) => {
    const g = geom();
    shape.rect = g;
    shape.radius = g.height / 2;
    shape.opacity = Math.max(0, Math.min(1, p.value)); // fades with the content layer
    shape.visible = shape.opacity > 0.001;
  });
  useLayoutEffect(() => {
    if (!layer) return;
    if (elRef.current) w.current = elRef.current.offsetWidth;
    const off = ctx.onBeforeFrame(() => {
      const g = geom();
      layer.transform = new DOMMatrix().translate(g.x, g.y).scale(g.s);
      layer.opacity = Math.max(0, Math.min(1, p.value));
      if (exiting && p.value < 0.02) queueMicrotask(onExited);
    });
    if (exiting) p.set(0, { params: springs.menuClose });
    else p.set(1, { params: springs.menuOpen });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, exiting]);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (exiting || !duration) return;
    const t = setTimeout(() => dismissRef.current?.(), duration * 1000);
    return () => clearTimeout(t);
  }, [exiting, duration]);
  return (
    <LayerView ref={setLayer} z={zBands.toast + 2} width="auto" height={TOAST_HEIGHT}>
      <div
        ref={elRef}
        role="status"
        aria-live="polite"
        className="lq-subheadline"
        style={{
          height: TOAST_HEIGHT,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 20px',
          whiteSpace: 'nowrap',
          fontWeight: 590,
          color: 'var(--lq-label)',
        }}
      >
        {icon}
        {children}
      </div>
    </LayerView>
  );
}

// ---------------------------------------------------------------------------------------------- Popover

/** A rectangle in client (viewport) coordinates, like `getBoundingClientRect()`. */
export interface AnchorRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Popover source: a ref to the element, the element's `id` (for JSON-driven UI, no refs needed), or a rect in client
 * coordinates.
 */
export type PopoverAnchor = RefObject<HTMLElement | null> | string | AnchorRect;

/** Client rect of an anchor, or null when it cannot be resolved (missing element). */
export function resolveAnchorRect(anchor: PopoverAnchor): AnchorRect | null {
  if (typeof anchor === 'string') {
    if (typeof document === 'undefined') return null;
    const el = document.getElementById(anchor);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  }
  if ('current' in anchor) {
    const r = anchor.current?.getBoundingClientRect();
    return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null;
  }
  if (typeof anchor.x === 'number' && typeof anchor.y === 'number') return anchor;
  return null;
}

export interface PopoverProps {
  isPresented: boolean;
  /**
   * Source: a ref (element in the base layer or any layer that is not transformed), an element id, or a rect in
   * client coordinates.
   */
  anchor: PopoverAnchor;
  children: ReactNode;
  /** `preferredContentSize` width (height follows the content). Default 250. */
  width?: number;
  /** Preferred direction. Default `any` (above when there is room, like `.any` in §10.4). */
  arrowEdge?: 'top' | 'bottom' | 'any';
  onDismiss?: () => void;
  'aria-label'?: string;
}

const ARROW = 13; // §10.4 the frame includes a 13 pt arrow
const SIDE_INSET = 10; // §10.4 _containingFrameInsets {0, 10, 0, 10}
const POPOVER_RADIUS = 26; // TODO(unknown)
const POPOVER_SPRING = springFromDurationBounce(0.35, 0); // §10.4 0.35 s presentation / dismissal

export function Popover(props: PopoverProps) {
  const { mounted, exiting, done } = usePresence(props.isPresented);
  if (!mounted) return null;
  return (
    <OverlayPortal>
      <PopoverView {...props} exiting={exiting} onExited={done} />
    </OverlayPortal>
  );
}

function PopoverView({ anchor, children, width = 250, arrowEdge = 'any', onDismiss, exiting, onExited, ...aria }: PopoverProps & { exiting: boolean; onExited: () => void }) {
  const ctx = useLiquid();
  const [layer, setLayer] = useState<Layer | null>(null);
  const elRef = useRef<HTMLDivElement | null>(null);
  const place = useRef<{ rect: Rect; below: boolean; origin: { x: number; y: number } } | null>(null);
  const p = useMotion(0, POPOVER_SPRING);

  const measure = () => {
    const ar = resolveAnchorRect(anchor);
    const el = elRef.current;
    if (!ar || !el) return;
    // Client → canvas coordinates (an inline root with contained overlays is offset in the page).
    const o = ctx.clientOrigin ? ctx.clientOrigin() : { x: 0, y: 0 };
    const a = { left: ar.x - o.x, top: ar.y - o.y, width: ar.width, height: ar.height, bottom: ar.y - o.y + ar.height };
    const h = el.offsetHeight;
    const roomAbove = a.top - ctx.safeArea.top - ARROW;
    const below = arrowEdge === 'top' || (arrowEdge === 'any' && roomAbove < h);
    const x = Math.min(ctx.viewport.width - SIDE_INSET - width, Math.max(SIDE_INSET, a.left + a.width / 2 - width / 2));
    const y = below ? a.bottom + ARROW : a.top - ARROW - h;
    place.current = { rect: { x, y, width, height: h }, below, origin: { x: a.left + a.width / 2, y: below ? a.bottom : a.top } };
  };
  const current = (): Rect | null => {
    const pl = place.current;
    if (!pl) return null;
    const s = 0.6 + 0.4 * p.value;
    const r = pl.rect;
    const ox = pl.origin.x;
    const oy = pl.origin.y;
    return { x: ox + (r.x - ox) * s, y: oy + (r.y - oy) * s, width: r.width * s, height: r.height * s };
  };
  useGlassCore(ZERO, { style: 'regular', z: zBands.menu + 31, radius: POPOVER_RADIUS }, (_g, shape) => {
    const r = current();
    if (!r) {
      shape.visible = false;
      return;
    }
    shape.rect = r;
    shape.radius = POPOVER_RADIUS * (0.6 + 0.4 * p.value);
    shape.opacity = Math.max(0, Math.min(1, p.value)); // fades with the content layer
    shape.visible = shape.opacity > 0.001;
  });
  useLayoutEffect(() => {
    if (!layer) return;
    measure();
    const off = ctx.onBeforeFrame(() => {
      const r = current();
      if (!r) return;
      const s = r.width / width;
      layer.transform = new DOMMatrix().translate(r.x, r.y).scale(s);
      layer.opacity = Math.max(0, Math.min(1, p.value));
      if (exiting && p.value < 0.02) queueMicrotask(onExited);
    });
    p.set(exiting ? 0 : 1);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, exiting]);
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;
  useEffect(() => {
    if (exiting) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismissRef.current?.();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [exiting]);
  return (
    <>
      <LayerView z={zBands.menu + 30} aria-hidden="true" className="lq-solid" onPointerDown={() => onDismiss?.()} style={{ background: 'transparent' }} />
      <LayerView ref={setLayer} z={zBands.menu + 32} width={width} height="auto">
        <div ref={elRef} role="dialog" aria-label={aria['aria-label']} style={{ width, minHeight: 44, boxSizing: 'border-box' }}>
          {children}
        </div>
      </LayerView>
    </>
  );
}
