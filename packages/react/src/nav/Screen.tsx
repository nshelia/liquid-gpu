/**
 * Screen: one navigation destination, drawn as its own layer (so push/pop only moves textures).
 * It hosts an optional NavBar and Toolbar, publishes its primary scroll view's activity (NavBar title collapse,
 * TabBar minimize) and provides the bar insets that its scroll views pad their content with.
 *
 * Insets: top = safe area + 54 (+ 52 large-title band) (BR §1.1); bottom = 86 with a toolbar or a bottom search field
 * (BR §2, §1.10), else the enclosing tab bar inset or the safe area. While search is presented the top inset is the safe
 * area (+ the scope bar), see search/Searchable.
 */
import { metrics } from '@liquid-gpu/core';
import { SHEET_BAR_TOP } from './NavBar';
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Layer } from '@liquid-gpu/gpu';
import { LayoutShiftContext, useLiquid, ZBaseContext, type LayoutShiftContextValue } from '../root/context';
import { extraTranslation } from '../root/geometry';
import { InSheetContext } from '../sheet/Sheet';
import { LayerView } from '../root/Layer';
import { zBands } from '../root/zBands';
import { ScrollChannel } from '../logic/scroll';
import { navBarHeight, TOOLBAR } from '../logic/nav';
import { BarInsetsContext, ScrollChannelContext, type BarInsets } from '../scroll/context';
import { StackEntryContext } from './NavigationStack';
import { NavBar, type NavBarProps } from './NavBar';
import { useSearchable, type SearchableProps } from '../search/Searchable';

export interface ScreenContextValue {
  key: string;
  index: number;
  channel: ScrollChannel;
  insets: BarInsets;
}

export const ScreenContext = createContext<ScreenContextValue | null>(null);

export function useScreen(): ScreenContextValue | null {
  return useContext(ScreenContext);
}

export interface ScreenProps extends Omit<NavBarProps, 'large'> {
  /** Large-title display mode. */
  largeTitle?: boolean;
  /** Hide the navigation bar entirely. */
  hideNavBar?: boolean;
  /** `grouped` (systemGroupedBackground, default), `plain` (systemBackground) or any CSS colour. */
  background?: 'grouped' | 'plain' | (string & {});
  /** A `<Toolbar>` shown over the bottom of the screen. */
  toolbar?: ReactNode;
  /** `.searchable`: bottom search field, scopes, `.minimize` (search/Searchable). */
  searchable?: SearchableProps<string | number>;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
  children?: ReactNode;
}

/**
 * Layer adapter for a screen drawn inside another layer (a NavigationStack in a sheet): the stack's transform and
 * dim become a CSS translate and an overlay, and the translation is registered for nested glass.
 */
class InlineLayer {
  private _t = new DOMMatrix();
  private _dim = 0;
  z = 0;
  opacity = 1;
  cornerRadius = 0;
  visible = true;
  constructor(
    readonly element: HTMLElement,
    private readonly dimEl: HTMLElement | null,
    private readonly onShift: () => void = () => {},
  ) {}
  get transform(): DOMMatrix {
    return this._t;
  }
  set transform(m: DOMMatrix) {
    this._t = m;
    this.element.style.transform = m.isIdentity ? '' : `translate3d(${m.e}px, ${m.f}px, 0)`;
    if (m.isIdentity) extraTranslation.delete(this.element);
    else extraTranslation.set(this.element, { x: m.e, y: m.f });
    this.onShift();
  }
  get dim(): number {
    return this._dim;
  }
  set dim(d: number) {
    this._dim = d;
    if (this.dimEl) this.dimEl.style.opacity = String(d);
  }
  invalidate(): void {}
  remove(): void {}
}

export function Screen({
  title,
  largeTitle = false,
  hideNavBar = false,
  leading,
  trailing,
  backButton,
  scrollEdge,
  background,
  toolbar,
  searchable,
  className,
  style,
  children,
  ...aria
}: ScreenProps) {
  const { safeArea, viewport } = useLiquid();
  const entry = useContext(StackEntryContext);
  const parentChannel = useContext(ScrollChannelContext);
  const parentInsets = useContext(BarInsetsContext);
  const zBase = useContext(ZBaseContext);
  const inSheet = useContext(InSheetContext);
  const bgSetting = background ?? (inSheet ? 'transparent' : 'grouped');
  const isTopRef = useRef(entry?.isTop ?? true);
  isTopRef.current = entry?.isTop ?? true;
  const channel = useMemo(() => new ScrollChannel(parentChannel, () => isTopRef.current), [parentChannel]);
  const barTop = inSheet ? SHEET_BAR_TOP : safeArea.top;
  const restTop = hideNavBar ? (inSheet ? 0 : safeArea.top) : navBarHeight(barTop, largeTitle);
  const search = useSearchable(searchable, { safeTop: barTop, barShift: restTop - barTop });
  const searching = !!search?.presented;
  const bottomBar = !!toolbar || !!searchable;
  const insets = useMemo<BarInsets>(
    () => ({
      top: search?.presented ? search.presentedTop : restTop,
      detents: largeTitle && !hideNavBar && !searching ? [0, metrics.largeTitleBand] : undefined,
      bottom: bottomBar ? Math.max(TOOLBAR.contentInsetBottom, parentInsets.bottom > 0 ? parentInsets.bottom + TOOLBAR.height + 12 : 0) : Math.max(parentInsets.bottom, inSheet ? 0 : safeArea.bottom),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [restTop, searching, search?.presentedTop, hideNavBar, safeArea.bottom, largeTitle, bottomBar, parentInsets.bottom, inSheet],
  );
  // Search presentation changes the top inset: the content follows on the search bar spring.
  const prevTop = useRef(insets.top);
  useLayoutEffect(() => {
    const d = prevTop.current - insets.top;
    prevTop.current = insets.top;
    search?.insetChanged(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insets.top]);
  const value = useMemo<ScreenContextValue>(
    () => ({ key: entry?.key ?? 'root', index: entry?.index ?? 0, channel, insets }),
    [entry?.key, entry?.index, channel, insets],
  );
  const [layer, setLayer] = useState<Layer | null>(null);
  const register = entry?.registerLayer;
  const entryKey = entry?.key;
  const bg =
    bgSetting === 'grouped'
      ? 'var(--lq-system-grouped-background)'
      : bgSetting === 'plain'
        ? 'var(--lq-system-background)'
        : bgSetting;

  // Register the layer with the stack once it exists.
  useEffect(() => {
    if (!register || !entryKey) return;
    register(entryKey, layer);
    return () => register(entryKey, null);
  }, [register, entryKey, layer]);

  const inlineRef = useRef<HTMLDivElement | null>(null);
  // Inline screens move by CSS translation: tell nested glass (bar buttons) to re-measure on every shift.
  const shiftListeners = useMemo(() => new Set<() => void>(), []);
  const shift = useMemo<LayoutShiftContextValue>(
    () => ({
      subscribe(fn) {
        shiftListeners.add(fn);
        return () => void shiftListeners.delete(fn);
      },
    }),
    [shiftListeners],
  );
  const inlineDimRef = useRef<HTMLDivElement | null>(null);
  const nested = zBase !== null;
  useEffect(() => {
    if (!nested || !inlineRef.current) return;
    const l = new InlineLayer(inlineRef.current, inlineDimRef.current, () => shiftListeners.forEach((f) => f())) as unknown as Layer;
    if (entry?.initialX) l.transform = new DOMMatrix().translate(entry.initialX, 0);
    setLayer(l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nested]);

  const body = (
    <ScreenContext.Provider value={value}>
      <ScrollChannelContext.Provider value={channel}>
        <BarInsetsContext.Provider value={insets}>
          <div ref={search?.bodyRef} className="lq-screen-body" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
            {children}
          </div>
          {!hideNavBar &&
            (search ? (
              <div ref={search.barRef} style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
                <NavBar title={title} large={largeTitle} leading={searching ? undefined : leading} trailing={searching ? undefined : trailing} backButton={backButton && !searching} scrollEdge={scrollEdge} />
              </div>
            ) : (
              <NavBar title={title} large={largeTitle} leading={leading} trailing={trailing} backButton={backButton} scrollEdge={scrollEdge} />
            ))}
          {toolbar}
          {search?.ui}
        </BarInsetsContext.Provider>
      </ScrollChannelContext.Provider>
    </ScreenContext.Provider>
  );

  if (nested) {
    // Inside a sheet: an absolutely placed div in the sheet's layer (moves with the sheet).
    return (
      <div
        ref={inlineRef}
        className={['lq-screen-inline', className].filter(Boolean).join(' ')}
        role="region"
        aria-label={aria['aria-label'] ?? (typeof title === 'string' ? title : undefined)}
        style={{
          ['--lq-screen-bg' as string]: bg,
          position: 'absolute',
          inset: 0,
          background: bg,
          overflow: 'hidden',
          display: entry && !entry.visible ? 'none' : undefined,
          zIndex: entry?.index ?? 0,
          ...style,
        }}
      >
        <LayoutShiftContext.Provider value={shift}>{body}</LayoutShiftContext.Provider>
        <div ref={inlineDimRef} aria-hidden style={{ position: 'absolute', inset: 0, background: '#000', opacity: 0, pointerEvents: 'none', zIndex: 10 }} />
      </div>
    );
  }

  return (
    <LayerView
      ref={setLayer}
      z={zBase === null ? zBands.screen(entry?.index ?? 0) : zBase + 10 + 10 * (entry?.index ?? 0)}
      x={entry?.initialX ?? 0}
      visible={entry?.visible ?? true}
      className={['lq-screen', className].filter(Boolean).join(' ')}
      role="region"
      aria-label={aria['aria-label'] ?? (typeof title === 'string' ? title : undefined)}
      style={{
        ['--lq-screen-bg' as string]: bg,
        background: bg,
        color: 'var(--lq-label)',
        overflow: 'hidden',
        width: viewport.width,
        height: viewport.height,
        ...style,
      }}
    >
      {body}
    </LayerView>
  );
}
