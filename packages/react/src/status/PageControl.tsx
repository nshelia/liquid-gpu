/**
 * `PageControl` (UIPageControl; also SwiftUI `TabView(.page)`'s index dots). Sources: CT = components/controls.md §6,
 * SUI = deep/swiftui-components/out/raw/tab.page*, ST = deep/demo-audit/status/raw (StatusLab, iOS 27 per-frame
 * timelines: swipe, cross, tap, scrub; screenshots al_*, ad_*, auto_*).
 *
 * - Geometry: width 20 + 17.667·n, height 25.667, capsule r 12.833; dot frames 9.667 at x 14 + 17.667·i, y 8
 *   (visible disc 8.02). At most 10 slots (TabView(.page), ST many*): with more pages a window slides (ζ 0.9,
 *   response 0.215 s) and the two outer slots on a side with hidden pages shrink to 0.759 / 0.446.
 * - Colours: current #FFFFFF; others #FFFFFF@0.45 without a background, #000000@0.25 (dark #FFFFFF@0.25) while the
 *   background shows (ST al_white 184 on 245, ad_black 88 on 31).
 * - Background: systemThinMaterial (filters blur, colorSaturate 1.35, …). Fitted from ST over white / black:
 *   light = 0.404·backdrop + 142, dark = 0.369·backdrop + 31. `automatic`: hidden at rest, shown while scrubbing;
 *   `prominent`: always (SwiftUI `backgroundDisplayMode: .always`); `minimal`: never.
 * - Page change: the new current dot switches at once (0.0156 s); the old one fades over 0.125 s after a tap and
 *   0.25 s otherwise, curve (0, 0, 0.58, 1) (ST tap / swipe / scrub, CT `contentsMultiplyColor`).
 * - Tap: at touch-up, one page toward the side of the current dot that was tapped.
 * - Scrub: after a 0.17 s hold (ST scrub: 1.236 → 1.403) the background fades in, critically damped, response 0.09 s
 *   (ST: 0.368, 0.677, 0.851, 0.935 per 60 Hz frame); dragging selects the dot under the finger
 *   (`scrubPage`); on release the background fades out the same way.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { playHaptic } from '@liquid-gpu/core';
import { useLiquid, useSpring } from '../root';
import { dotLeft, dotScaleAt, pageControlWidth, pageDots as D, pageWindowStart, scrubPage } from './logic';

export type PageControlBackground = 'automatic' | 'prominent' | 'minimal';

export interface PageControlProps {
  numberOfPages: number;
  currentPage: number;
  /** A tap or scrub asks for a page. `tap` should animate the content (SwiftUI pages it over 0.3 s); `scrub` jumps. */
  onChange?(page: number, source: 'tap' | 'scrub' | 'key'): void;
  backgroundStyle?: PageControlBackground;
  currentPageIndicatorTintColor?: string;
  pageIndicatorTintColor?: string;
  hidesForSinglePage?: boolean;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

const FADE_CURVE = 'cubic-bezier(0, 0, 0.58, 1)';
const LONG_PRESS_S = 0.17;
const BG_SPRING = { dampingRatio: 1, response: 0.09 };
/** ST many_taps: strip offset 135.67 → 118 and edge-dot scales fit ζ 0.92 / 0.88, response 0.200 / 0.230 s. */
const WINDOW_SPRING = { dampingRatio: 0.9, response: 0.215 };
/** ST al_* / ad_*: material fits (see header). */
const material = {
  light: 'rgba(238,238,238,0.596)',
  dark: 'rgba(49,49,49,0.631)',
} as const;

/** circlebadge.fill: a 13 pt disc in its 15.67 pt image, drawn into the 9.667 frame → 8.02 pt visible (ST auto_red: 7.67 at the 50 % threshold). */
const DOT_INK = (D.dot * 13) / 15.6667;
const snap = (v: number) => Math.round(v * 3) / 3;

export function PageControl({
  numberOfPages,
  currentPage,
  onChange,
  backgroundStyle = 'automatic',
  currentPageIndicatorTintColor = '#FFFFFF',
  pageIndicatorTintColor,
  hidesForSinglePage,
  className,
  style,
  ...aria
}: PageControlProps) {
  const ctx = useLiquid();
  const bgRef = useRef<HTMLDivElement | null>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const bgVisible = backgroundStyle === 'prominent' || (backgroundStyle === 'automatic' && scrubbing);
  const bg = useSpring(bgVisible ? 1 : 0, BG_SPRING, (v) => {
    if (bgRef.current) bgRef.current.style.opacity = String(Math.min(1, Math.max(0, v)));
  });
  useEffect(() => {
    if (backgroundStyle === 'prominent') bg.snap(1);
    else bg.set(bgVisible ? 1 : 0);
  }, [bgVisible, backgroundStyle, bg]);

  // Fade of the dot that stops being current.
  const shown = useRef(currentPage);
  const nextFade = useRef(0.25);
  const leaving = useRef<{ index: number; duration: number } | null>(null);
  if (shown.current !== currentPage) {
    leaving.current = { index: shown.current, duration: nextFade.current };
    shown.current = currentPage;
    nextFade.current = 0.25;
  }

  const n = numberOfPages;
  const width = pageControlWidth(n);
  const page = Math.min(Math.max(currentPage, 0), Math.max(0, n - 1));
  // More than 10 pages: a sliding 10-slot window with shrunk edge dots (ST many_taps / many_back).
  const windowStart = useRef(0);
  windowStart.current = pageWindowStart(windowStart.current, page, n);
  const first = windowStart.current;
  const dotRefs = useRef<(HTMLDivElement | null)[]>([]);
  const placeDots = (w: number) => {
    dotRefs.current.forEach((el, i) => {
      if (!el) return;
      const k = dotScaleAt(i, w, n);
      el.style.transform = `translateX(${snap((i - w) * D.pitch)}px) scale(${k})`;
      el.style.visibility = k < 0.001 ? 'hidden' : '';
    });
  };
  const slide = useSpring(first, WINDOW_SPRING, placeDots);
  useLayoutEffect(() => {
    if (slide.target !== first) slide.set(first);
    else placeDots(slide.value);
  });
  const latest = useRef({ page, n, onChange, first });
  latest.current = { page, n, onChange, first };

  const request = (p: number, source: 'tap' | 'scrub' | 'key') => {
    const { page: cur, n: count, onChange: cb } = latest.current;
    const next = Math.min(count - 1, Math.max(0, p));
    if (next === cur) return;
    if (source === 'tap') nextFade.current = 0.125;
    if (source === 'scrub') playHaptic('selection');
    cb?.(next, source);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || n < 2) return;
    const el = e.currentTarget;
    const left = () => el.getBoundingClientRect().left;
    const x0 = e.clientX;
    let x = x0;
    let scrub = false;
    const timer = setTimeout(() => {
      if (backgroundStyle === 'minimal') return;
      scrub = true;
      setScrubbing(true);
    }, LONG_PRESS_S * 1000);
    const move = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      x = ev.clientX;
      if (scrub) {
        const { first: s0, n: count } = latest.current;
        request(s0 + scrubPage(x - left(), dotLeft(0) + D.dot / 2, Math.min(count, D.maxSlots)), 'scrub');
      }
    };
    const up = (ev: PointerEvent) => {
      if (ev.pointerId !== e.pointerId) return;
      clearTimeout(timer);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
      if (scrub) setScrubbing(false);
      else if (ev.type === 'pointerup' && Math.abs(x - x0) < 10) {
        const cur = latest.current.page;
        request(cur + (x - left() > dotLeft(cur - latest.current.first) + D.dot / 2 ? 1 : -1), 'tap');
      }
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    nextFade.current = 0.125;
    request(page + d, 'key');
  };

  if (n <= 0 || (hidesForSinglePage && n === 1)) return null;
  const dark = ctx.appearance === 'dark';
  const other = pageIndicatorTintColor ?? (bgVisible ? (dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.25)') : 'rgba(255,255,255,0.45)');

  return (
    <div
      role="slider"
      tabIndex={0}
      aria-valuemin={1}
      aria-valuemax={n}
      aria-valuenow={page + 1}
      aria-valuetext={`Page ${page + 1} of ${n}`}
      aria-label={aria['aria-label'] ?? 'Page'}
      className={className}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      style={{ position: 'relative', width, height: D.height, borderRadius: D.radius, touchAction: 'none', flex: 'none', ...style }}
    >
      <div
        ref={bgRef}
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: D.radius,
          opacity: bg.value,
          background: material[ctx.appearance],
          // A smaller blur than CA's 29.5: Chrome's backdrop samples beyond the pager edge and grades the capsule.
          backdropFilter: 'blur(6px) saturate(1.35)',
          WebkitBackdropFilter: 'blur(6px) saturate(1.35)',
          pointerEvents: 'none',
        }}
      />
      {Array.from({ length: n }, (_, i) => {
        const fade = leaving.current?.index === i && i !== page ? leaving.current.duration : 0;
        return (
          <div
            key={i}
            ref={(el) => {
              dotRefs.current[i] = el;
            }}
            aria-hidden
            style={{
              position: 'absolute',
              left: snap(dotLeft(0) + (D.dot - DOT_INK) / 2),
              top: 8 + (D.dot - DOT_INK) / 2,
              width: DOT_INK,
              height: DOT_INK,
              borderRadius: '50%',
              background: i === page ? currentPageIndicatorTintColor : other,
              transition: fade ? `background-color ${fade}s ${FADE_CURVE}` : 'none',
            }}
          />
        );
      })}
    </div>
  );
}
