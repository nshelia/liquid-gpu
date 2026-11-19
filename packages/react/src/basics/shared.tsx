/**
 * Shared pieces for the basics components: local colour tokens, press opacity and a list row primitive that matches
 * `list/List.tsx` rows (52 pt, text at +20, separator 1 pt inset to the text, systemGray4 highlight).
 * BL = uikit-internals/deep/demo-audit/basics, SC = deep/swiftui-components/spec.md.
 */
import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';
import { gestureThresholds, metrics } from '@liquid-gpu/core';
import { useLiquid } from '../root/context';
import { useSpring } from '../root/useSpring';
import { PRESSED_OPACITY, pressReleaseSpring } from './logic';

/** Body frames are 20.33 tall in SwiftUI (BL static-*.jsonl), slightly more than the UIFont line height. */
export const BODY_LINE = 20.333;
export const bodyText: CSSProperties = { fontSize: 17, lineHeight: `${BODY_LINE}px`, letterSpacing: 'calc(var(--lq-tracking-on) * -0.432px)' };

// SC §4 / §13: Divider = `.separator` #3C3C43@0.29 (dark #545458@0.6), not the list separator.
const CSS =
  '.lq-root{--lq-divider:rgba(60,60,67,.29)}.lq-root[data-appearance="dark"]{--lq-divider:rgba(84,84,88,.6)}' +
  // Disclosure children are wrapped: their last separator shows unless the group itself ends the section.
  '.lq-dg-children>.lq-row:last-child>.lq-row-sep{display:block}.lq-dg-children:last-child>.lq-row:last-child>.lq-row-sep{display:none}' +
  '.lq-row:has(+.lq-dg-children>.lq-row-lit:first-child)>.lq-row-sep{opacity:0}';
let injected = false;
export function useBasicsCss(): void {
  useEffect(() => {
    if (injected || typeof document === 'undefined') return;
    injected = true;
    const s = document.createElement('style');
    s.dataset.lq = 'basics';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}

/**
 * Plain-button press (BL anim-link-hold): opacity 0.2 at touch-down, held while pressed, sprung back on release.
 * Writes `opacity` on every element in `targets`.
 */
export function usePressOpacity(trigger: RefObject<HTMLElement | null>, targets: RefObject<HTMLElement | null>[], enabled = true): void {
  const ctx = useLiquid();
  const spring = useSpring(1, pressReleaseSpring, (v) => {
    const o = v >= 0.9995 ? '' : String(Math.min(1, v));
    for (const t of targets) if (t.current) t.current.style.opacity = o;
  });
  useEffect(() => {
    const el = trigger.current;
    if (!el || !enabled) return;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      spring.snap(PRESSED_OPACITY);
      ctx.gestures.track(e, {
        decide: (s) => (Math.hypot(s.dx, s.dy) > gestureThresholds.panHysteresis ? 'fail' : 'wait'),
        onCancel: () => spring.set(1),
        onTap: () => spring.set(1),
      });
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [trigger, enabled, ctx, spring]);
}

/** Extra leading indent for rows nested in a list DisclosureGroup (+20 per level, SC §6 / BL static-list). */
export const RowIndentContext = createContext(0);

export interface BasicRowProps {
  children?: ReactNode;
  onPress?(): void;
  /** Text start relative to the cell's content edge (+20); a Label row's separator starts at its title (+40). */
  separatorLead?: number;
  role?: string;
  'aria-expanded'?: boolean;
  'aria-label'?: string;
  style?: CSSProperties;
}

/** A 52 pt inset-grouped row (LS §1.1–1.4 as in `list/List.tsx`) for the basics row variants. */
export function BasicRow({ children, onPress, separatorLead = 0, style, ...aria }: BasicRowProps) {
  const ctx = useLiquid();
  const indent = useContext(RowIndentContext);
  const ref = useRef<HTMLDivElement | null>(null);
  const [lit, setLit] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !onPress) return;
    let timer: ReturnType<typeof setTimeout> | 0 = 0;
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = 0;
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // LS §1.4: highlight after the 0.15 s touch delay unless a scroll claims the touch; BL list-hold: #D1D1D6.
      timer = setTimeout(() => {
        timer = 0;
        if (!ctx.gestures.isClaimed(e.pointerId)) setLit(true);
      }, gestureThresholds.touchDelay * 1000);
      ctx.gestures.track(e, {
        decide: (s) => (Math.hypot(s.dx, s.dy) > gestureThresholds.panHysteresis ? 'fail' : 'wait'),
        onCancel: () => {
          clear();
          setLit(false);
        },
        onTap: () => {
          clear();
          setLit(true);
          setTimeout(() => setLit(false), 100);
        },
      });
    };
    el.addEventListener('pointerdown', onDown);
    return () => {
      clear();
      el.removeEventListener('pointerdown', onDown);
    };
  }, [onPress, ctx]);

  const pad = metrics.cellLayoutMargins[1];
  const Fg = onPress ? 'button' : 'div';
  return (
    <div ref={ref} role="listitem" className={['lq-row', lit ? 'lq-row-lit' : ''].join(' ')} style={{ position: 'relative', ...style }}>
      <Fg
        type={onPress ? 'button' : undefined}
        onClick={onPress}
        aria-label={aria['aria-label']}
        aria-expanded={aria['aria-expanded']}
        role={aria.role}
        className="lq-row-fg"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          minHeight: metrics.rowHeight,
          padding: `0 ${pad}px 0 ${pad + indent}px`,
          boxSizing: 'border-box',
          background: lit ? 'var(--lq-cell-selected)' : 'var(--lq-cell-grouped)',
          transition: lit ? 'none' : 'background-color 0.5s cubic-bezier(0.42, 0, 0.58, 1)', // LS §1.4 deselect
          color: 'var(--lq-label)',
          textAlign: 'left',
          ...bodyText,
        }}
      >
        {children}
      </Fg>
      <div
        aria-hidden
        className="lq-row-sep"
        style={{
          position: 'absolute',
          left: pad + indent + separatorLead,
          right: metrics.separatorInsetLeading,
          bottom: 0,
          height: 1, // SwiftUI list separators are 1 pt (3 device px), #3C3C43@0.12 (BL static-list; SC §6)
          background: 'var(--lq-separator)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
