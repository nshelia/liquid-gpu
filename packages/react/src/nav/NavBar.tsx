/**
 * NavBar: the iOS 27 navigation bar. No background (BR §1.9 default appearance is empty); the separation comes from
 * the scroll edge effect (BR §9).
 *
 * - Row: 54 tall below the safe area; 44 pt glass capsules at 20 pt margins, centred at row top + 22 (BR §1.1, §10).
 * - Inline title: Semibold 17, centred (BR §1.2). Large title: Bold 34 at x 20, 3.67 below the 52 pt band top
 *   (BR §1.3); it scrolls with the content 1:1, and the inline title slides in from +15 pt with
 *   springDuration 0.35 / bounce 0 once the band has scrolled away (TR §6).
 * - Scroll edge effect (automatic): opacity 0 at the scroll edge, 1 once scrolled; region = bar bottom + 40; blur
 *   radius 2 over the status bar ramping to 0.25 at the bar bottom; 0.333 pt keyline #000@0.1 (BR §9). In webgpu mode
 *   the blur is computed inside the screen's captured layer (backdrop-filter of the content below it).
 */
import { InSheetContext } from '../sheet/Sheet';
import { useContext, useEffect, useRef, type ReactNode } from 'react';
import { componentType, metrics, springs } from '@liquid-gpu/core';
import { useLiquid } from '../root/context';
import { useSpring } from '../root/useSpring';
import { largeTitleCollapse, NAV_ITEMS, navBarHeight, scrollEdgeHeight } from '../logic/nav';
import { BackButton, BarMetricsContext, navBarMetrics, useBarGroup } from './bars';
import { useNavigation } from './NavigationStack';
import { ScreenContext } from './Screen';

/** `_UINavigationBarTitleTransitionSpec`. */
export const SHEET_BAR_TOP = 20;

const TITLE_TRANSITION = { fastDuration: 0.45, slowDuration: 0.7, minDurationFactor: 0.5, maxScrollVelocity: 2000, bounceFactor: 0.4, blurRadius: 4 } as const;

export interface NavBarProps {
  title?: ReactNode;
  /** Large title display mode. */
  large?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  /** Show the back button when the stack can go back. Default true. */
  backButton?: boolean;
  /** `automatic` (default): edge effect appears once scrolled. `hard`: always. `none`. */
  scrollEdge?: 'automatic' | 'hard' | 'none';
}

export function NavBar({ title, large = false, leading, trailing, backButton = true, scrollEdge = 'automatic' }: NavBarProps) {
  const { safeArea, viewport } = useLiquid();
  const screen = useContext(ScreenContext);
  const nav = useNavigation();
  const leadingGroup = useBarGroup('nav-l');
  const trailingGroup = useBarGroup('nav-t');
  const inlineRef = useRef<HTMLDivElement | null>(null);
  const largeRef = useRef<HTMLDivElement | null>(null);
  const edgeRef = useRef<HTMLDivElement | null>(null);
  // In a sheet the bar starts 20 pt below the sheet top.
  const inSheet = useContext(InSheetContext);
  const top = inSheet ? SHEET_BAR_TOP : safeArea.top;
  const canGoBack = backButton && !!nav?.canGoBack && (screen?.index ?? 0) > 0;

  // Inline title appearance: TR §6 springDuration 0.35, bounce 0 (= ζ 1, 0.35 s), hidden offset +15.
  const titleT = useSpring(large ? 0 : 1, springs.titleTransition, (v) => {
    const el = inlineRef.current;
    if (!el) return;
    const p = Math.max(0, Math.min(1, v));
    el.style.opacity = String(p);
    el.style.transform = `translate3d(-50%, ${metrics.navTitleHiddenOffset * (1 - v)}px, 0)`;
    el.style.filter = p >= 0.999 ? '' : `blur(${(TITLE_TRANSITION.blurRadius * (1 - p)).toFixed(2)}px)`;
  });

  useEffect(() => {
    const ch = screen?.channel;
    // Scroll velocity at the trigger shortens the title spring.
    let lastT = performance.now();
    let lastO = ch?.last.offset ?? 0;
    let v = 0;
    let collapsed: boolean | null = null;
    const apply = (offset: number) => {
      const now = performance.now();
      const dt = (now - lastT) / 1000;
      if (dt > 0.001) v = 0.6 * v + 0.4 * ((offset - lastO) / dt);
      if (dt > 0.1) v = 0;
      lastT = now;
      lastO = offset;
      if (large && largeRef.current) largeRef.current.style.transform = `translate3d(0, ${-offset}px, 0)`;
      if (large) {
        const now = largeTitleCollapse(offset) >= 1;
        if (now !== collapsed) {
          const first = collapsed === null;
          collapsed = now;
          if (largeRef.current) largeRef.current.style.opacity = now ? '0' : '1';
          const f = Math.min(Math.abs(v) / TITLE_TRANSITION.maxScrollVelocity, 1);
          const base = now ? TITLE_TRANSITION.fastDuration : TITLE_TRANSITION.slowDuration;
          const params = { dampingRatio: 1 - TITLE_TRANSITION.bounceFactor * f, response: base * (1 - TITLE_TRANSITION.minDurationFactor * f) };
          if (first) titleT.snap(now ? 1 : 0);
          else titleT.set(now ? 1 : 0, { params });
        }
      }
      const edge = edgeRef.current;
      if (edge && scrollEdge === 'automatic') {
        const o = offset > 0.5 ? '1' : '0';
        if (edge.style.opacity !== o) edge.style.opacity = o;
      }
    };
    apply(ch?.last.offset ?? 0);
    if (!ch) return;
    return ch.subscribe((e) => apply(e.offset));
  }, [screen?.channel, large, scrollEdge, titleT]);

  const rowTop = top;
  const edgeH = scrollEdgeHeight(top);
  // BR §9 blur mask: full to the status bar bottom, ramping to 0.25 at the bar bottom, then to 0 over 40 pt.
  const barBottom = top + metrics.navBarHeight;
  const mask = `linear-gradient(to bottom, #000 0, #000 ${barBottom - 8}px, rgba(0,0,0,0.6) ${barBottom + 8}px, rgba(0,0,0,0) ${edgeH}px)`;

  return (
    <BarMetricsContext.Provider value={navBarMetrics(leadingGroup)}>
      <div
        className="lq-navbar"
        style={{ position: 'absolute', left: 0, top: 0, width: viewport.width, height: navBarHeight(top, large), pointerEvents: 'none', zIndex: 3 }}
      >
        {scrollEdge !== 'none' && (
          <div
            ref={edgeRef}
            aria-hidden
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: '100%',
              height: edgeH,
              opacity: scrollEdge === 'hard' ? 1 : 0,
              // ≈ spring response 0.35, bounce 0.
              transition: 'opacity 0.514s cubic-bezier(0.25, 0.8, 0.3, 1)',
              // BR §9: variable blur r 2 + saturation 1.25 + brightness 0.03 + 50 % replay of the backdrop.
              backdropFilter: 'blur(4px) saturate(1.25) brightness(1.03)',
              WebkitBackdropFilter: 'blur(4px) saturate(1.25) brightness(1.03)',
              // The pocket's blur fill + 50 % replay read as a strong wash of the background under the bar (BR §9).
              background: `linear-gradient(to bottom, var(--lq-screen-bg) 0, color-mix(in srgb, var(--lq-screen-bg) 92%, transparent) ${top}px, color-mix(in srgb, var(--lq-screen-bg) 78%, transparent) ${barBottom - 12}px, color-mix(in srgb, var(--lq-screen-bg) 40%, transparent) ${barBottom}px, transparent ${edgeH}px)`,
              maskImage: mask,
              WebkitMaskImage: mask,
            }}
          >
            {/* BR §9 keyline 0.333 pt #000@0.1 at the bar bottom (hard / thinFilm). */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: barBottom - 0.333, height: 'calc(1px / var(--lq-dpr))', background: 'rgba(0,0,0,0.1)' }} />
          </div>
        )}
        {large && (
          <div
            ref={largeRef}
            className="lq-large-title-label"
            role="heading"
            aria-level={1}
            style={{
              position: 'absolute',
              left: metrics.sideMargin,
              right: metrics.sideMargin,
              top: barBottom + 3.67,
              fontSize: componentType.navLargeTitle.size,
              fontWeight: componentType.navLargeTitle.weight,
              lineHeight: `${componentType.navLargeTitle.lineHeight}px`,
              letterSpacing: 0.39,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              // Fades when the bar is fully collapsed (offset 52), not with the scroll.
              transition: 'opacity 0.2s cubic-bezier(0.42, 0, 0.58, 1)',
            }}
          >
            {title}
          </div>
        )}
        <div
          className="lq-navbar-row"
          style={{
            position: 'absolute',
            left: NAV_ITEMS.margin,
            right: NAV_ITEMS.margin,
            top: rowTop,
            height: NAV_ITEMS.height,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', gap: NAV_ITEMS.capsuleGap, alignItems: 'center' }}>
            {canGoBack && <BackButton />}
            {leading}
          </div>
          <div
            ref={inlineRef}
            className="lq-nav-title"
            role={large ? undefined : 'heading'}
            aria-level={large ? undefined : 1}
            aria-hidden={large ? true : undefined}
            style={{
              position: 'absolute',
              left: '50%',
              top: (NAV_ITEMS.height - componentType.navTitle.lineHeight) / 2,
              maxWidth: viewport.width - 2 * (NAV_ITEMS.margin + 44 + NAV_ITEMS.capsuleGap) - 40,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              opacity: large ? 0 : 1,
              transform: large ? `translate3d(-50%, ${metrics.navTitleHiddenOffset}px, 0)` : 'translate3d(-50%, 0, 0)',
            }}
          >
            {title}
          </div>
          <BarMetricsContext.Provider value={navBarMetrics(trailingGroup)}>
            <div style={{ display: 'flex', gap: NAV_ITEMS.capsuleGap, alignItems: 'center' }}>{trailing}</div>
          </BarMetricsContext.Provider>
        </div>
      </div>
    </BarMetricsContext.Provider>
  );
}
