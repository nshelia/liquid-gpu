/**
 * MenuSurface: the glass menu card shared by `Menu` (button menu) and `ContextMenu`.
 *
 * Present (deep/motion/findings.md §2): the glass shape grows out of a 22×22 blob at the source's trailing area to
 * the 250-wide menu on the menuOpen spring (ζ 0.75, 0.35); the list crossfades in with blur 4·(1 − opacity),
 * clipped to the growing shape. Dismiss: the shape returns to the blob on menuClose (ζ 0.8, 0.49) while the list
 * scales 1 → 0.2 about the source and fades on the menuList spring (ζ 0.85, 0.35).
 *
 * Layout (text_overlays §10.1): 250 wide, rows 42 (60 with a subtitle), 10 pt list padding, section separators 1 pt
 * inset 24 with 10 pt above and below, title 17 pt @0.96, icons centred at x 55, title at 79 (43 without icons),
 * checkmark at 21. Glass: regular, radius 32 (MO §2 menuCornerRadius).
 *
 * Sliding a finger over the rows highlights them with a selection haptic per change (haptics-framerate §4), throttled
 * to 0.04 s; releasing on a row selects it.
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useMotion } from '../controls/motion';
import { HAPTIC_SELECTION_MIN_INTERVAL, playHaptic, springs } from '@liquid-gpu/core';
import type { GlassShape, Layer, Rect } from '@liquid-gpu/gpu';
import { cssVar, LayerView, useGlassCore, useLiquid, type GlassGeometry } from '../root';
import { menuMetrics as M, morphBlur, morphOrigin, morphShape } from './logic';
import type { MenuItem } from './types';

export interface MenuSurfaceHandle {
  /** Highlight the row under a client point (finger sliding from a long-press). Returns the row index or -1. */
  highlightAt(x: number, y: number): number;
  /** Select the row under a client point, if any. Returns true when a row was selected. */
  selectAt(x: number, y: number): boolean;
  /** Current menu rect (canvas coordinates) once placed. */
  rect(): Rect | null;
  /** Hide immediately (the `.pop` commit: the menu disappears at commit). */
  vanish(): void;
}

export interface MenuSurfaceProps {
  sections: readonly (readonly MenuItem[])[];
  /** Icon row above the sections (ContextMenu `accessories`); its items come first in the row indices. */
  accessories?: readonly MenuItem[];
  /** Source rect (canvas coordinates): the blob starts at its trailing area. */
  anchor: Rect;
  /** Placement for a measured list height. */
  place: (height: number) => Rect;
  /** False starts the dismiss animation; `onClosed` follows when it settles. */
  open: boolean;
  onSelect: (item: MenuItem) => void;
  onRequestClose: () => void;
  onClosed: () => void;
  /** Point the list shrinks toward on dismiss (canvas coordinates). Default: the anchor centre. */
  shrinkOrigin?: { x: number; y: number };
  /** Base z (glass at z + 1, list at z + 2). */
  z: number;
  /** Move keyboard focus into the menu on open. */
  autoFocus?: boolean;
  label?: string;
  /** Called every frame with the morph progress (0…1) for coupled animations (trigger collapse). */
  onProgress?: (p: number) => void;
}

const ZERO: Rect = { x: 0, y: 0, width: 1, height: 1 };

function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <path d="M2 7.5l3.2 3.2L12 3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const MenuSurface = forwardRef<MenuSurfaceHandle, MenuSurfaceProps>(function MenuSurface(
  { sections, accessories, anchor, place, open, onSelect, onRequestClose, onClosed, shrinkOrigin, z, autoFocus, label, onProgress },
  ref,
) {
  const ctx = useLiquid();
  const layerRef = useRef<Layer | null>(null);
  const [layer, setLayer] = useState<Layer | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef<Rect | null>(null);
  const originRef = useRef({ x: 0, y: 0 });
  const closing = useRef(false);
  const gone = useRef(false);
  const [hi, setHi] = useState(-1);
  const hiRef = useRef(-1);
  const lastHaptic = useRef(0);
  const closedFired = useRef(false);

  // Stable callback ref (an inline one would detach/attach every render and loop through setLayer).
  const setLayerRef = useCallback((l: Layer | null) => {
    layerRef.current = l;
    setLayer(l);
  }, []);

  const p = useMotion(0, springs.menuOpen);
  const q = useMotion(1, springs.menuList);

  const settledClosed = () => p.value <= 0.01 && q.value <= 0.02;

  // Glass: shape rect written every frame from the morph.
  const onGeometry = (_g: GlassGeometry, shape: GlassShape) => {
    const r = rectRef.current;
    if (!r || gone.current) {
      shape.visible = false;
      return;
    }
    const s = morphShape(originRef.current, r, Math.max(0, p.value));
    shape.rect = { x: s.x, y: s.y, width: s.width, height: s.height };
    shape.radius = s.radius;
    shape.visible = p.value > 0.015;
  };
  useGlassCore(ZERO, { style: 'regular', z: z + 1, radius: M.radius }, onGeometry);

  // Content layer + per-frame transform.
  useLayoutEffect(() => {
    if (!layer) return;
    const off = ctx.onBeforeFrame(() => {
      const r = rectRef.current;
      const list = listRef.current;
      if (!r || gone.current) {
        layer.visible = false;
        return;
      }
      layer.visible = true;
      const pv = p.value;
      if (!closing.current) {
        const s = morphShape(originRef.current, r, Math.max(0, pv));
        layer.transform = new DOMMatrix().translate(r.x, r.y);
        layer.opacity = Math.min(1, Math.max(0, pv));
        layer.clip = { x: s.x, y: s.y, width: s.width, height: s.height };
        if (list) list.style.filter = pv < 0.995 ? `blur(${morphBlur(pv).toFixed(2)}px)` : '';
      } else {
        const o = shrinkOrigin ?? { x: anchor.x + anchor.width / 2, y: anchor.y + anchor.height / 2 };
        const sc = M.listDismissScale + (1 - M.listDismissScale) * Math.max(0, q.value);
        layer.transform = new DOMMatrix().translate(o.x, o.y).scale(sc).translate(r.x - o.x, r.y - o.y);
        layer.opacity = Math.min(1, Math.max(0, q.value));
        layer.clip = undefined;
        if (list) list.style.filter = '';
      }
      onProgress?.(Math.max(0, Math.min(1, pv)));
      if (closing.current && settledClosed() && !closedFired.current) {
        closedFired.current = true;
        layer.visible = false;
        queueMicrotask(onClosed);
      }
    });
    ctx.requestFrame();
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  // Measure, place, start the morph.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!layer || !list) return;
    const h = list.offsetHeight;
    const r = place(h);
    rectRef.current = r;
    originRef.current = morphOrigin(anchor, r);
    p.snap(0);
    p.set(1, { params: springs.menuOpen });
    if (autoFocus) (list.querySelector('[role=menuitem]:not([aria-disabled=true])') as HTMLElement | null)?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer]);

  useEffect(() => {
    if (open || closing.current) return;
    closing.current = true;
    p.set(0, { params: springs.menuClose });
    q.set(0, { params: springs.menuList });
    ctx.requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const acc = accessories ?? [];
  const flatItems = [...acc, ...sections.flat()];
  const rowIndexAt = useCallback((x: number, y: number): number => {
    const l = layerRef.current;
    const list = listRef.current;
    if (!l || !list) return -1;
    const inv = l.transform.inverse();
    const pt = inv.transformPoint(new DOMPoint(x, y));
    if (pt.x < 0 || pt.x > M.width) return -1;
    const rows = list.querySelectorAll<HTMLElement>('[data-lq-menu-row]');
    for (const row of rows) {
      const top = row.offsetTop;
      const left = row.offsetLeft;
      if (pt.y >= top && pt.y < top + row.offsetHeight && pt.x >= left && pt.x < left + row.offsetWidth) return Number(row.dataset.lqMenuRow);
    }
    return -1;
  }, []);

  const setHighlight = useCallback((i: number) => {
    if (i === hiRef.current) return;
    const item = i >= 0 ? flatItems[i] : undefined;
    const valid = !!item && !item.disabled;
    const next = valid ? i : -1;
    if (next === hiRef.current) return;
    hiRef.current = next;
    setHi(next);
    const now = performance.now() / 1000;
    if (next >= 0 && now - lastHaptic.current >= HAPTIC_SELECTION_MIN_INTERVAL) {
      lastHaptic.current = now;
      playHaptic('menuSelection'); // HF §4 selection on each highlighted item change
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  const select = (i: number) => {
    const item = flatItems[i];
    if (!item || item.disabled) return false;
    onSelect(item);
    return true;
  };

  useImperativeHandle(
    ref,
    () => ({
      highlightAt: (x, y) => {
        const i = rowIndexAt(x, y);
        setHighlight(i);
        return i;
      },
      selectAt: (x, y) => {
        const i = rowIndexAt(x, y);
        setHighlight(-1);
        return i >= 0 && select(i);
      },
      rect: () => rectRef.current,
      vanish: () => {
        gone.current = true;
        ctx.requestFrame();
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rowIndexAt, setHighlight, sections],
  );

  // Press and slide over rows.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      setHighlight(rowIndexAt(e.clientX, e.clientY));
      ctx.gestures.track(e, {
        decide: ({ dx, dy }) => (Math.hypot(dx, dy) > 4 ? 'claim' : 'wait'),
        onMove: (s) => setHighlight(rowIndexAt(s.event.clientX, s.event.clientY)),
        onEnd: (s, cancelled) => {
          const i = rowIndexAt(s.event.clientX, s.event.clientY);
          setHighlight(-1);
          if (!cancelled && i >= 0) select(i);
        },
        onCancel: () => setHighlight(-1),
        onTap: () => setHighlight(-1),
      });
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, sections]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onRequestClose();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>('[role=menuitem]:not([aria-disabled=true])') ?? [])];
    const i = rows.indexOf(document.activeElement as HTMLElement);
    const n = rows[(i + (e.key === 'ArrowDown' ? 1 : -1) + rows.length) % rows.length];
    n?.focus({ preventScroll: true });
  };

  const dark = ctx.appearance === 'dark';
  const ink = dark ? 'rgba(255,255,255,0.96)' : 'rgba(0,0,0,0.96)';
  const separator = (key: string) => (
    <div key={key} role="separator" style={{ padding: `${M.separatorGap}px ${M.separatorInset}px` }}>
      <div style={{ height: M.separator, background: dark ? 'rgba(255,255,255,0.08)' : cssVar('menuSeparator') }} />
    </div>
  );
  let idx = 0;
  const rows: ReactNode[] = [];
  if (acc.length > 0) {
    rows.push(
      <div key="acc" style={{ display: 'flex', paddingLeft: M.accessoryInset, height: M.accessoryRow }}>
        {acc.map((item) => {
          const i = idx++;
          return (
            <div
              key={item.id ?? `acc${i}`}
              role="menuitem"
              tabIndex={-1}
              aria-label={item.title}
              aria-disabled={item.disabled || undefined}
              data-lq-menu-row={i}
              onClick={() => select(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  select(i);
                }
              }}
              onPointerEnter={(e) => e.pointerType === 'mouse' && setHighlight(i)}
              onPointerLeave={(e) => e.pointerType === 'mouse' && setHighlight(-1)}
              style={{ position: 'relative', width: M.accessoryColumn, height: M.accessoryRow, color: item.destructive ? cssVar('systemRed') : ink, cursor: 'pointer', outline: 'none' }}
            >
              {/* TODO(unknown): accessory highlight shape; uses the row highlight fill in a 22-radius cell. */}
              <div aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 22, background: hi === i ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent' }} />
              <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: M.accessoryIconCentreY - 14, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {item.icon}
              </span>
              {/* Regular 12, lh 14.32 (ascent 11.43): baseline at accessoryBaseline. */}
              <span style={{ position: 'absolute', left: -4, right: -4, top: M.accessoryBaseline - 11.43, fontSize: 12, lineHeight: '14.32px', textAlign: 'center', whiteSpace: 'nowrap' }}>{item.title}</span>
            </div>
          );
        })}
      </div>,
    );
  }
  sections.forEach((section, si) => {
    if (section.length === 0) return;
    if (rows.length > 0) rows.push(separator(`sep${si}`));
    const icons = section.some((it) => it.icon);
    for (const item of section) {
      const i = idx++;
      const color = item.disabled ? cssVar('tertiaryLabel') : item.destructive ? cssVar('systemRed') : ink;
      const titleX = icons ? M.titleXWithIcons : M.titleXNoIcons; // TO §10.1: 79 with icons, 43 without (checkmark column)
      rows.push(
        <div
          key={item.id ?? `${si}-${i}`}
          role="menuitem"
          tabIndex={-1}
          aria-disabled={item.disabled || undefined}
          aria-checked={item.checked}
          data-lq-menu-row={i}
          onClick={() => select(i)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              select(i);
            }
          }}
          onPointerEnter={(e) => e.pointerType === 'mouse' && setHighlight(i)}
          onPointerLeave={(e) => e.pointerType === 'mouse' && setHighlight(-1)}
          style={{
            position: 'relative',
            height: item.subtitle ? M.rowSubtitle : M.row,
            color,
            cursor: item.disabled ? 'default' : 'pointer',
            outline: 'none',
          }}
        >
          {/* MO §2 largeItemContentShape: inset 10, radius 22. TODO(unknown): highlight fill colour. */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: '0 10px',
              borderRadius: M.row / 2 > 22 ? 22 : M.row / 2,
              background: hi === i ? (dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.08)') : 'transparent',
            }}
          />
          {item.checked && (
            <span style={{ position: 'absolute', left: M.checkCentreX - 7, top: '50%', marginTop: -7, display: 'flex' }}>
              <Check />
            </span>
          )}
          {item.icon && (
            <span
              aria-hidden="true"
              style={{ position: 'absolute', left: M.iconCentreX - 14, width: 28, top: 0, bottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              {item.icon}
            </span>
          )}
          <span
            style={{
              position: 'absolute',
              left: titleX,
              right: 20,
              top: 0,
              bottom: 0,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              fontSize: 17, // TO §10.1 `.SFUI-Regular` 17
              letterSpacing: 0,
              lineHeight: '20.29px',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
            {item.subtitle && (
              <span style={{ fontSize: 13, lineHeight: '15.51px', letterSpacing: 0, color: cssVar('secondaryLabel') }}>{item.subtitle}</span>
            )}
          </span>
          {item.submenu && (
            // chevron.forward: ink 6 × 10.33 at x 216.33 (TO §10.1 glyph box 9.33 × 12.67 at 214.33).
            <svg aria-hidden="true" width="9.333" height="12.667" viewBox="0 0 9.333 12.667" style={{ position: 'absolute', left: M.chevronX, top: '50%', marginTop: -6.333 }}>
              <path d="M3.33 1.17l5 5.17-5 5.17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>,
      );
    }
  });

  return (
    <LayerView
      ref={setLayerRef}
      z={z + 2}
      width={M.width}
      height="auto"
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ touchAction: 'none' }}
    >
      <div ref={listRef} style={{ padding: `${M.padding}px 0`, maxHeight: M.maxHeight, overflowY: 'auto', boxSizing: 'border-box' }}>
        {rows}
      </div>
    </LayerView>
  );
});
