/**
 * `PageView`: SwiftUI `TabView { … }.tabViewStyle(.page)`: a horizontally paging `ScrollView` with the index dots
 * overlaid. Sources: SUI = deep/swiftui-components/out/raw/tab.page*, ST = deep/demo-audit/status/raw.
 *
 * - Full screen the pager fills the safe area (0, 62, 440, 860); the page control (25.667 tall) sits 12 pt above the
 *   pager's bottom edge (frame y 884.33, dots y 892.33), centred.
 * - Dots follow the scroll (ST swipe/cross): while dragging the page whose half the offset is in; after release the
 *   page the paging motion is heading to.
 * - Tapping the dots pages with the scroll view's animated `scrollTo` (0.3 s sin², ST tap: 3.3, 13.3, 29.3 … 440);
 *   scrubbing jumps without animation (ST scrub: offset 0 → 440 in one frame).
 */
import { Children, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ScrollView, type ScrollViewHandle } from '../scroll/ScrollView';
import { PageControl, type PageControlBackground } from './PageControl';
import { pageForOffset } from './logic';

export interface PageViewProps {
  children: ReactNode;
  /** Controlled page index. */
  page?: number;
  onPageChange?(page: number): void;
  /** SwiftUI `indexDisplayMode`: `automatic` (shown for 2+ pages), `always`, `never`. */
  indexDisplayMode?: 'automatic' | 'always' | 'never';
  /** SwiftUI `indexViewStyle(.page(backgroundDisplayMode:))`: `automatic`/`interactive` (while scrubbing), `always`, `never`. */
  backgroundDisplayMode?: 'automatic' | 'interactive' | 'always' | 'never';
  /** Distance of the dots' bottom edge from the pager's bottom. Default 12 (SUI tab.page). */
  indexBottom?: number;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

const backgroundStyle: Record<NonNullable<PageViewProps['backgroundDisplayMode']>, PageControlBackground> = {
  automatic: 'automatic',
  interactive: 'automatic',
  always: 'prominent',
  never: 'minimal',
};

export function PageView({
  children,
  page,
  onPageChange,
  indexDisplayMode = 'automatic',
  backgroundDisplayMode = 'automatic',
  indexBottom = 12,
  className,
  style,
  ...aria
}: PageViewProps) {
  const pages = Children.toArray(children);
  const n = pages.length;
  const boxRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<ScrollViewHandle | null>(null);
  const [width, setWidth] = useState(0);
  const [shown, setShown] = useState(page ?? 0);
  const motion = useRef({ last: 0, page: page ?? 0, target: null as number | null });

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Keep the offset on the shown page across resizes and controlled changes.
  useLayoutEffect(() => {
    if (width > 0) scrollRef.current?.scrollTo(motion.current.page * width, false);
  }, [width]);
  useLayoutEffect(() => {
    if (page === undefined || page === motion.current.page || width <= 0) return;
    motion.current.page = page;
    motion.current.target = page * width;
    setShown(page);
    scrollRef.current?.scrollTo(page * width, true);
  }, [page, width]);

  const onScroll = (offset: number) => {
    const m = motion.current;
    const tracking = scrollRef.current?.physics.tracking ?? false;
    // A dots-driven scroll keeps its page until it lands (or a drag takes over).
    if (m.target !== null && !tracking && Math.abs(offset - m.target) > 0.5) {
      m.last = offset;
      return;
    }
    m.target = null;
    const p = pageForOffset(offset, width, n, tracking, offset - m.last);
    m.last = offset;
    if (p !== m.page) {
      m.page = p;
      setShown(p);
      onPageChange?.(p);
    }
  };

  const onDots = (p: number, source: 'tap' | 'scrub' | 'key') => {
    motion.current.page = p;
    motion.current.target = p * width;
    setShown(p);
    onPageChange?.(p);
    scrollRef.current?.scrollTo(p * width, source !== 'scrub');
  };

  const showDots = indexDisplayMode === 'always' || (indexDisplayMode === 'automatic' && n > 1);
  return (
    <div ref={boxRef} className={className} style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', ...style }}>
      <ScrollView
        ref={scrollRef}
        axis="horizontal"
        paging
        showsIndicator={false}
        publish={false}
        onScroll={onScroll}
        aria-label={aria['aria-label']}
        style={{ position: 'absolute', inset: 0 }}
        contentStyle={{ display: 'flex', width: n * width, height: '100%' }}
      >
        {pages.map((child, i) => (
          <div key={i} role="group" aria-roledescription="page" aria-label={`${i + 1} of ${n}`} style={{ width, height: '100%', flex: 'none', position: 'relative' }}>
            {child}
          </div>
        ))}
      </ScrollView>
      {showDots && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: indexBottom, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <PageControl
            numberOfPages={n}
            currentPage={shown}
            onChange={onDots}
            backgroundStyle={backgroundStyle[backgroundDisplayMode]}
            style={{ pointerEvents: 'auto' }}
          />
        </div>
      )}
    </div>
  );
}
