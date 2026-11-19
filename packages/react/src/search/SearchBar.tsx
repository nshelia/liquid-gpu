/**
 * Bottom search field of `.searchable` on iPhone (BR §1.10, SL = deep/demo-audit/search):
 * - Rest: glass capsule 384 × 48 at (28, H − 76), r 24; magnifyingglass at x + 12, prompt Medium 17 secondaryLabel at
 *   x + 40.67 (BR §1.10). `.minimize`: a 48 circle at the bottom centre with a 25.67 pt magnifyingglass (SL).
 * - Presented: field 324 wide plus a 48 close circle (`xmark`) 12 pt to its right. Width and circle (scale 1.2 → 1,
 *   alpha 0 → 1) share one spring, ζ 0.936 / 0.24 s both ways (SL fits; UIKit `.integrated` is 0.88 / 0.27, BR §1.11).
 *   `.minimize` morphs circle ↔ field on ζ 0.97 / 0.227 with a 9.3 pt height bulge; field contents fade in as the
 *   circle glyph shrinks to 0.2 × and fades (SL minimize).
 * - Typed text Regular 17 label colour, tint caret; clear button `xmark.circle.fill` 20 pt at the trailing edge − 13.33.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { componentType } from '@liquid-gpu/core';
import { Glass, type GlassHandle } from '../root/Glass';
import { useLiquid } from '../root/context';
import { useSpring } from '../root/useSpring';
import { cssVar } from '../root/theme';
import { injectFieldCss } from '../controls/TextField';
import { closeRect, FIELD_DELAY_MS, fieldRect, SEARCH, SEARCH_SPRINGS, searchBarLayout } from './logic';
import { Magnifier, XMark, XMarkCircleFill } from './glyphs';

export interface SearchBarProps {
  text: string;
  onTextChange(text: string): void;
  prompt: string;
  presented: boolean;
  onPresent(): void;
  onCancel(): void;
  onSubmit?(text: string): void;
  /** `searchToolbarBehavior(.minimize)`: a 48 pt circle until presented. */
  minimize?: boolean;
}

const place = (el: HTMLElement | null, r: { x: number; y: number; width: number; height: number }) => {
  if (!el) return;
  el.style.left = `${r.x}px`;
  el.style.top = `${r.y}px`;
  el.style.width = `${r.width}px`;
  el.style.height = `${r.height}px`;
};

export function SearchBar({ text, onTextChange, prompt, presented, onPresent, onCancel, onSubmit, minimize = false }: SearchBarProps) {
  const ctx = useLiquid();
  injectFieldCss();
  const L = useMemo(() => searchBarLayout(ctx.viewport.width, ctx.viewport.height), [ctx.viewport.width, ctx.viewport.height]);
  const LRef = useRef(L);
  LRef.current = L;
  const minRef = useRef(minimize);
  minRef.current = minimize;
  const fieldBox = useRef<HTMLDivElement | null>(null);
  const closeBox = useRef<HTMLDivElement | null>(null);
  const fieldGlass = useRef<GlassHandle | null>(null);
  const closeGlass = useRef<GlassHandle | null>(null);
  const contentsRef = useRef<HTMLDivElement | null>(null);
  const miniRef = useRef<HTMLDivElement | null>(null);
  const xRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const apply = () => {
    const p = field.value;
    const c = close.value;
    const m = minRef.current;
    const fr = fieldRect(LRef.current, p, m, fieldW.value);
    place(fieldBox.current, fr);
    // Contents cross-fade on the close-circle spring (SL: contents and circle share ζ 0.98 / 0.226).
    const q = Math.min(1, Math.max(0, c));
    if (contentsRef.current) contentsRef.current.style.opacity = m ? String(q) : '1';
    const mini = miniRef.current;
    if (mini) {
      // SL: the circle glyph's centre drifts from the circle centre to 58 pt left of it and shrinks to 0.2 ×.
      const mc = LRef.current.mini;
      const cx = mc.x + mc.width / 2 - 58 * q;
      const s = 1 + (SEARCH.miniGlyphEndScale - 1) * q;
      mini.style.opacity = m ? String(1 - q) : '0';
      mini.style.transform = `translate(${(cx - fr.x - mc.width / 2).toFixed(2)}px, ${((fr.height - mc.height) / 2).toFixed(2)}px) scale(${s.toFixed(4)})`;
    }
    const cr = closeRect(LRef.current, c);
    place(closeBox.current, cr.rect);
    if (xRef.current) xRef.current.style.transform = `scale(${(cr.rect.width / L.close.width).toFixed(4)})`;
    ctx.requestFrame();
  };
  const field = useSpring(presented ? 1 : 0, minimize ? SEARCH_SPRINGS.morph : SEARCH_SPRINGS.field, apply);
  const fieldW = useSpring(presented ? 1 : 0, SEARCH_SPRINGS.field, apply);
  const close = useSpring(presented ? 1 : 0, minimize ? SEARCH_SPRINGS.morph : SEARCH_SPRINGS.field, apply);

  // Presentation: the field follows the navigation bar after FIELD_DELAY_MS (SL); dismissal starts at once.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      apply();
      return;
    }
    const params = minRef.current ? (presented ? SEARCH_SPRINGS.morph : SEARCH_SPRINGS.morphOut) : SEARCH_SPRINGS.field;
    const go = () => {
      if (ctx.reducedMotion) {
        field.snap(presented ? 1 : 0);
        fieldW.snap(presented ? 1 : 0);
        close.snap(presented ? 1 : 0);
      } else {
        const morphIn = minRef.current && presented;
        field.set(presented ? 1 : 0, { params: morphIn ? SEARCH_SPRINGS.morphX : params });
        fieldW.set(presented ? 1 : 0, { params: morphIn ? SEARCH_SPRINGS.morphWidth : params });
        close.set(presented ? 1 : 0, { params });
      }
    };
    if (!presented) {
      go();
      return;
    }
    const t = setTimeout(go, FIELD_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presented]);

  useLayoutEffect(apply, [L, minimize]);
  // Close-circle alpha, written every frame after the glass placed itself (its handle appears after mount).
  useEffect(
    () =>
      ctx.onBeforeFrame(() => {
        const g = closeGlass.current;
        const a = Math.min(1, Math.max(0, close.value));
        if (g?.shape) g.shape.opacity = a;
        if (g?.layer) {
          g.layer.opacity = a;
          if (a < 0.001) g.layer.visible = false;
        }
      }),
    [ctx, close],
  );

  useEffect(() => {
    if (presented && document.activeElement !== inputRef.current) inputRef.current?.focus({ preventScroll: true });
    if (!presented && document.activeElement === inputRef.current) inputRef.current?.blur();
  }, [presented]);

  const fontBase: CSSProperties = { fontSize: componentType.barItemText.size, letterSpacing: 0, lineHeight: `${SEARCH.textHeight}px` };
  // Mount-time placement only: afterwards the springs own these styles (React must not rewrite them).
  const [initField] = useState(() => fieldRect(L, presented ? 1 : 0, minimize));
  const [initClose] = useState(() => closeRect(L, presented ? 1 : 0).rect);
  const glyphTop = 14; // SL: glyph frame y = field y + 14

  return (
    <div className="lq-search-bar" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 3 }}>
      <div ref={fieldBox} style={{ position: 'absolute', left: initField.x, top: initField.y, width: initField.width, height: initField.height }}>
        <Glass
          ref={fieldGlass}
          fit="container"
          boxStyle={{ width: '100%', height: '100%' }}
          role="search"
          contentStyle={{ position: 'relative', overflow: 'hidden', pointerEvents: 'auto', color: cssVar('label'), cursor: presented ? 'text' : 'pointer' }}
          onPointerDown={(e) => {
            if (presented) return;
            e.preventDefault();
            onPresent();
          }}
        >
          <div ref={contentsRef} style={{ position: 'absolute', inset: 0 }}>
            <Magnifier width={SEARCH.glyph.width} height={SEARCH.glyph.height} style={{ position: 'absolute', left: SEARCH.glyphX, top: glyphTop }} />
            <input
              ref={inputRef}
              type="search"
              enterKeyHint="search"
              aria-label={prompt}
              placeholder={prompt}
              value={text}
              onChange={(e) => onTextChange(e.target.value)}
              onFocus={() => !presented && onPresent()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSubmit?.(text);
                if (e.key === 'Escape') onCancel();
              }}
              className="lq-input lq-search-input lq-search-bar-input"
              style={{
                position: 'absolute',
                left: SEARCH.textX,
                right: text ? SEARCH.clearRight + SEARCH.clear + 6 : 12,
                top: (SEARCH.height - SEARCH.textHeight) / 2,
                height: SEARCH.textHeight,
                border: 'none',
                outline: 'none',
                background: 'transparent',
                padding: 0,
                margin: 0,
                font: 'inherit',
                ...fontBase,
                fontWeight: text ? 400 : componentType.barItemText.weight,
                color: cssVar('label'),
                caretColor: cssVar('tint'),
              }}
            />
            {text && (
              <button
                type="button"
                aria-label="Clear text"
                tabIndex={-1}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onTextChange('')}
                style={{
                  position: 'absolute',
                  right: SEARCH.clearRight,
                  top: (SEARCH.height - SEARCH.clear) / 2,
                  width: SEARCH.clear,
                  height: SEARCH.clear,
                  padding: 0,
                  border: 'none',
                  background: 'transparent',
                  color: cssVar('label'),
                  display: 'flex',
                }}
              >
                <XMarkCircleFill size={SEARCH.clear} />
              </button>
            )}
          </div>
          {minimize && (
            <div
              ref={miniRef}
              aria-hidden="true"
              style={{ position: 'absolute', left: 0, top: 0, width: SEARCH.height, height: SEARCH.height, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <Magnifier width={SEARCH.miniGlyph.width} height={SEARCH.miniGlyph.height} />
            </div>
          )}
        </Glass>
      </div>
      <div
        ref={closeBox}
        style={{ position: 'absolute', left: initClose.x, top: initClose.y, width: initClose.width, height: initClose.height, pointerEvents: presented ? 'auto' : 'none' }}
      >
        <Glass
          ref={closeGlass}
          as="button"
          interactive
          fit="container"
          boxStyle={{ width: '100%', height: '100%' }}
          aria-label="Close"
          tabIndex={presented ? 0 : -1}
          onClick={onCancel}
          contentStyle={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: cssVar('label'), pointerEvents: presented ? 'auto' : 'none' }}
        >
          <div ref={xRef} style={{ display: 'flex' }}>
            <XMark width={SEARCH.xmark.width} height={SEARCH.xmark.height} />
          </div>
        </Glass>
      </div>
    </div>
  );
}
