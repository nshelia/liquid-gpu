/**
 * `Menu`: a button that shows a menu as its primary action (UIButton.showsMenuAsPrimaryAction, SwiftUI `Menu`).
 *
 * - Placement (controls.md §1.8, text_overlays §10.1): 250 wide, top at the button's top, centred on the button when
 *   that fits inside the 8 pt container insets (deep/motion §2), otherwise aligned with the button's edge.
 * - Motion (MO §2): the menu morphs out of a 22×22 blob at the button's trailing area (menuOpen ζ 0.75 / 0.35)
 *   while a glass trigger collapses to an 11×11 dot; on dismiss the trigger regrows and the list shrinks to 0.2
 *   about the button and fades (menuClose 0.8 / 0.49, list 0.85 / 0.35). Opens ≈55–75 ms after touch-up (MO §2).
 * - No dimming for a button menu (text_overlays §10.1: dimming alpha 0); a tap outside dismisses.
 * - Keyboard: Enter/Space opens and focuses the first item, arrows move, Escape closes and refocuses the button.
 */
import { useRef, useState, type ReactNode } from 'react';
import type { Rect } from '@liquid-gpu/gpu';
import { LayerView, useLiquid, zBands, type GlassHandle } from '../root';
import { Button, type ButtonProps } from '../controls/Button';
import { placeButtonMenu } from './logic';
import { MenuSurface } from './MenuSurface';
import { toSections, type MenuContent, type MenuItem } from './types';

export interface MenuProps extends Omit<ButtonProps, 'onClick' | 'glassRef' | 'children'> {
  items: MenuContent;
  /** Trigger label. */
  label?: ReactNode;
  /** Called with the selected item (after its own `onSelect`). */
  onSelect?: (item: MenuItem) => void;
  onOpenChange?: (open: boolean) => void;
  'aria-label'?: string;
}

/** MO §2: first morph frame 55–75 ms after touch-up. */
const OPEN_DELAY_MS = 60;

export function Menu({ items, label, onSelect, onOpenChange, variant = 'glass', ...buttonProps }: MenuProps) {
  const ctx = useLiquid();
  const glass = useRef<GlassHandle | null>(null);
  const btn = useRef<HTMLButtonElement | null>(null);
  const [phase, setPhase] = useState<null | 'open' | 'closing'>(null);
  const [anchor, setAnchor] = useState<Rect | null>(null);
  const keyboard = useRef(false);
  const collapse = useRef(0);

  const anchorRect = (): Rect | null => {
    const g = glass.current?.geometry();
    if (g) return g.rect;
    const el = btn.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  };

  const open = () => {
    if (phase) return;
    const a = anchorRect();
    if (!a) return;
    setTimeout(() => {
      setAnchor(a);
      setPhase('open');
      onOpenChange?.(true);
    }, ctx.reducedMotion ? 0 : OPEN_DELAY_MS);
  };
  const close = () => {
    if (phase !== 'open') return;
    setPhase('closing');
    onOpenChange?.(false);
  };
  const closed = () => {
    setPhase(null);
    setAnchor(null);
    collapse.current = 0;
    restoreTrigger();
    if (keyboard.current) (glass.current?.content ?? btn.current)?.focus();
    keyboard.current = false;
  };

  // Trigger collapse (MO §2: the button shape shrinks to an 11×11 dot while the menu grows).
  const restoreTrigger = () => {
    const h = glass.current;
    if (h?.layer) h.layer.opacity = 1;
    ctx.requestFrame();
  };
  const onProgress = (p: number) => {
    collapse.current = p;
    const h = glass.current;
    if (!h?.shape || !h.layer) return;
    const g = h.geometry();
    if (!g) return;
    const r = g.rect;
    const k = p; // 0 = button, 1 = dot
    const w = r.width + (11 - r.width) * k;
    const hh = r.height + (11 - r.height) * k;
    h.shape.rect = { x: r.x + r.width / 2 - w / 2, y: r.y + r.height / 2 - hh / 2, width: w, height: hh };
    h.shape.radius = Math.min(w, hh) / 2;
    h.shape.visible = k < 0.98;
    h.layer.opacity = Math.max(0, 1 - 1.5 * k);
  };

  const sections = toSections(items);
  return (
    <>
      <Button
        {...buttonProps}
        ref={btn}
        glassRef={glass}
        variant={variant}
        aria-haspopup="menu"
        aria-expanded={phase === 'open'}
        onClick={(e) => {
          keyboard.current = e.detail === 0;
          if (phase) close();
          else open();
        }}
      >
        {label}
      </Button>
      {phase && anchor && (
        <>
          <LayerView
            z={zBands.menu}
            aria-hidden="true"
            className="lq-solid"
            onPointerDown={(e) => {
              e.preventDefault();
              close();
            }}
            style={{ background: 'transparent' }}
          />
          <MenuSurface
            sections={sections}
            anchor={anchor}
            z={zBands.menu}
            open={phase === 'open'}
            autoFocus={keyboard.current}
            label={typeof label === 'string' ? label : buttonProps['aria-label']}
            place={(h) =>
              placeButtonMenu(anchor, h, {
                width: ctx.viewport.width,
                height: ctx.viewport.height,
                safeTop: ctx.safeArea.top,
                safeBottom: ctx.safeArea.bottom,
              })
            }
            onSelect={(item) => {
              item.onSelect?.();
              onSelect?.(item);
              close();
            }}
            onRequestClose={close}
            onClosed={closed}
            onProgress={variant === 'glass' || variant === 'prominentGlass' || variant === 'clearGlass' ? onProgress : undefined}
          />
        </>
      )}
    </>
  );
}
