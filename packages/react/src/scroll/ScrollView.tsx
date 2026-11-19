/**
 * ScrollView: UIScrollView physics from core `ScrollPhysics` (touch/mouse drag with rubber band 0.55, deceleration
 * 0.998, bounce, paging), wheel and trackpad input, a scroll indicator and an optional refresh control.
 *
 * DOM: wrap (clips) › scroller (`overflow: auto`, native scrollbar hidden) › content. In-bounds offsets are the
 * native `scrollTop`, so focus scrolling, `scrollIntoView` and keyboard scrolling keep working; the rubber-band part
 * is a translation of the content. Pointer and wheel input are taken over (no native panning).
 *
 * Sources: SMG = findings/scroll-motion-gestures.md (§1 deceleration, §3 rubber band incl. per-device c, §4 paging,
 * §5 indicator and refresh, §7 pan hysteresis 10), GS = deep/gestures/findings.md §5 (refresh), SH =
 * deep/sheets/findings.md §1 (sheet hand-off through `SheetScrollContext`).
 */
import {
  forwardRef,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  DECELERATION_RATE_FAST,
  DECELERATION_RATE_NORMAL,
  RUBBER_BAND_COEFFICIENTS,
  RUBBER_BAND_TOUCH,
  REFRESH_CONTROL_HEIGHT,
  ScrollPhysics,
  VelocityTracker,
  gestureThresholds,
  metrics,
  playHaptic,
  refreshRevealedFraction,
  refreshShouldTrigger,
  refreshSnappingHeight,
} from '@liquid-gpu/core';
import type { Rect } from '@liquid-gpu/gpu';
import { ScrollContext, useLayerContext, useLiquid, type ScrollContextValue } from '../root/context';
import { extraTranslation, measureInLayer, transformRect } from '../root/geometry';
import { classifyWheel, indicatorGeometry, ScrollChannel, splitOffset, wheelDeltaPixels } from '../logic/scroll';
import { SheetScrollContext } from '../sheet/bridge';
import { BarInsetsContext, ScrollChannelContext } from './context';

export interface ScrollViewHandle {
  scrollTo(offset: number, animated?: boolean): void;
  readonly offset: number;
  readonly physics: ScrollPhysics;
  readonly element: HTMLElement | null;
}

export interface ScrollViewProps {
  axis?: 'vertical' | 'horizontal';
  /** Page by the viewport size (SMG §4). */
  paging?: boolean;
  /** `normal` 0.998 (default) or `fast` 0.99 (SMG §1). */
  decelerationRate?: 'normal' | 'fast';
  /** Extra content padding (added to the bar insets from the enclosing screen). */
  contentInset?: { top?: number; bottom?: number; left?: number; right?: number };
  /** Ignore the enclosing screen's bar insets. */
  ignoreBarInsets?: boolean;
  /** Pull to refresh. The promise ends the refresh. */
  onRefresh?: () => Promise<unknown> | void;
  /** Show the scroll indicator. Default true. */
  showsIndicator?: boolean;
  /** Bounce at the edges (also when content fits, like `alwaysBounceVertical`). Default true. */
  bounces?: boolean;
  /** Called on every offset change (inside the frame; no React state). */
  onScroll?(offset: number): void;
  /** Publish to the enclosing scroll channel (NavBar title collapse, TabBar minimize). Default true. */
  publish?: boolean;
  /**
   * Where a released drag comes to rest (UIScrollView `scrollViewWillEndDragging(_:withVelocity:targetContentOffset:)`):
   * gets the projected resting offset (clamped to the scroll range) and the release velocity (content pt/s) and returns the offset to decelerate to,
   * e.g. the nearest card for a snapping carousel. Overrides `paging`.
   */
  targetContentOffset?(projected: number, velocity: number): number;
  /**
   * Resting offsets for a released drag whose projected target lies between them, e.g. `[0, 52]` for a large-title
   * band: UINavigationController `_scrollOffsetRetargettedToDetentOffsetIfNecessary:…` +184…+432 picks the detent
   * nearer the projected target (midpoint rule). Offsets are relative to the top rest position.
   */
  scrollDetents?: readonly number[];
  className?: string;
  style?: CSSProperties;
  contentClassName?: string;
  contentStyle?: CSSProperties;
  'aria-label'?: string;
  children?: ReactNode;
}

export const ScrollView = forwardRef<ScrollViewHandle, ScrollViewProps>(function ScrollView(
  {
    axis = 'vertical',
    paging = false,
    decelerationRate = 'normal',
    contentInset,
    ignoreBarInsets = false,
    onRefresh,
    showsIndicator = true,
    bounces = true,
    onScroll,
    publish = true,
    targetContentOffset,
    scrollDetents,
    className,
    style,
    contentClassName,
    contentStyle,
    children,
    ...aria
  },
  ref,
) {
  const ctx = useLiquid();
  const layerCtx = useLayerContext();
  const barInsets = useContext(BarInsetsContext);
  const channel = useContext(ScrollChannelContext);
  const sheet = useContext(SheetScrollContext);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLDivElement | null>(null);
  const refreshRef = useRef<HTMLDivElement | null>(null);
  const vertical = axis === 'vertical';
  const [refreshing, setRefreshing] = useState(false);

  const insetStart = (ignoreBarInsets || !vertical ? 0 : barInsets.top) + ((vertical ? contentInset?.top : contentInset?.left) ?? 0);
  const insetEnd = (ignoreBarInsets || !vertical ? 0 : barInsets.bottom) + ((vertical ? contentInset?.bottom : contentInset?.right) ?? 0);

  const physics = useMemo(
    () =>
      new ScrollPhysics({
        decelerationRate: decelerationRate === 'fast' ? DECELERATION_RATE_FAST : DECELERATION_RATE_NORMAL,
        paging,
        rubberBand: RUBBER_BAND_TOUCH,
        pixelRatio: typeof devicePixelRatio === 'number' ? devicePixelRatio : 3,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  physics.paging = paging;

  const listeners = useMemo(() => new Set<() => void>(), []);
  const state = useRef({
    viewport: 0,
    content: 0,
    maxNative: 0,
    lastNative: -1,
    lastOver: NaN,
    lastPublished: 0,
    tracking: false,
    refreshing: false,
    refreshEnabled: false,
    indicatorTimer: 0 as ReturnType<typeof setTimeout> | 0,
    insetStart: 0,
    insetEnd: 0,
  });
  const st = state.current;
  st.insetStart = insetStart;
  st.insetEnd = insetEnd;
  st.refreshEnabled = !!onRefresh;
  const onScrollRef = useRef(onScroll);
  onScrollRef.current = onScroll;
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const publishRef = useRef(publish);
  publishRef.current = publish;
  const targetRef = useRef(targetContentOffset);
  targetRef.current = targetContentOffset;
  const detentsRef = useRef(scrollDetents ?? barInsets.detents);
  detentsRef.current = scrollDetents ?? barInsets.detents;

  const showIndicator = () => {
    const ind = indicatorRef.current;
    if (!ind || !showsIndicator) return;
    ind.style.opacity = '1';
    if (st.indicatorTimer) clearTimeout(st.indicatorTimer);
    // SMG §5: fade is a 0.5 s easeInEaseOut opacity animation. TODO(unknown): the delay before it starts; 0.5 s here.
    st.indicatorTimer = setTimeout(() => {
      if (!st.tracking && !physics.active && indicatorRef.current) indicatorRef.current.style.opacity = '0';
    }, 500);
  };

  /** Write an offset to the DOM: native scroll for the in-bounds part, translation for the rubber band. */
  const apply = (offset: number, fromNative = false) => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const { native, over } = splitOffset(offset, st.maxNative);
    if (!fromNative && Math.abs(native - st.lastNative) > 0.001) {
      st.lastNative = native;
      if (vertical) scroller.scrollTop = native;
      else scroller.scrollLeft = native;
    }
    if (over !== st.lastOver) {
      st.lastOver = over;
      const t = Math.abs(over) < 0.001 ? '' : vertical ? `translate3d(0, ${-over}px, 0)` : `translate3d(${-over}px, 0, 0)`;
      content.style.transform = t;
      if (t) extraTranslation.set(content, vertical ? { x: 0, y: -over } : { x: -over, y: 0 });
      else extraTranslation.delete(content);
    }
    // Indicator.
    const ind = indicatorRef.current;
    if (ind && showsIndicator) {
      const g = indicatorGeometry(offset, st.content, st.viewport, vertical ? st.insetStart : 0, vertical ? st.insetEnd : 0);
      if (g.visible) {
        if (vertical) {
          ind.style.transform = `translate3d(0, ${g.pos}px, 0)`;
          ind.style.height = `${g.length}px`;
        } else {
          ind.style.transform = `translate3d(${g.pos}px, 0, 0)`;
          ind.style.width = `${g.length}px`;
        }
      }
    }
    // Refresh control reveal (GS §5).
    const rc = refreshRef.current;
    if (rc && st.refreshEnabled) {
      const visible = Math.max(0, -offset);
      const frac = st.refreshing ? 1 : refreshRevealedFraction(visible, refreshSnappingHeight(st.viewport));
      rc.style.opacity = String(Math.min(1, frac * 1.5));
      rc.style.transform = `translate3d(-50%, ${st.insetStart + Math.max(0, visible - REFRESH_CONTROL_HEIGHT) / 2 + 15}px, 0) rotate(${frac * 300}deg)`;
      if (!st.refreshing && refreshShouldTrigger(visible, refreshSnappingHeight(st.viewport), st.tracking)) beginRefresh();
    }
    const delta = offset - st.lastPublished;
    st.lastPublished = offset;
    for (const fn of listeners) fn();
    onScrollRef.current?.(offset);
    if (publishRef.current) channel?.publish({ offset, delta, tracking: st.tracking, max: st.maxNative });
    if (delta !== 0) showIndicator();
    ctx.requestFrame();
  };
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const beginRefresh = () => {
    st.refreshing = true;
    setRefreshing(true);
    playHaptic('refresh'); // HF §4 pull to refresh
    // GS §5: the content inset grows by the 60 pt control height while refreshing.
    physics.bounds = { ...physics.bounds, min: -REFRESH_CONTROL_HEIGHT };
    const done = () => {
      st.refreshing = false;
      setRefreshing(false);
      physics.bounds = { ...physics.bounds, min: 0 };
      if (!st.tracking && physics.offset < 0) {
        physics.dragEnd(0);
        ctx.animator.wake();
      }
    };
    Promise.resolve(onRefreshRef.current?.()).then(done, done);
  };

  // Measure bounds.
  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const measure = () => {
      const vp = vertical ? scroller.clientHeight : scroller.clientWidth;
      const cs = vertical ? content.offsetHeight : content.offsetWidth;
      st.viewport = vp;
      st.content = cs;
      st.maxNative = Math.max(0, cs - vp);
      physics.viewportSize = vp || physics.viewportSize;
      physics.pageSize = vp;
      physics.boundsWidth = scroller.clientWidth;
      physics.bounds = { min: st.refreshing ? -REFRESH_CONTROL_HEIGHT : 0, max: st.maxNative };
      if (!physics.active && !st.tracking) {
        const clamped = Math.min(st.maxNative, Math.max(physics.bounds.min, physics.offset));
        if (clamped !== physics.offset) physics.offset = clamped;
      }
      applyRef.current(physics.offset);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    // Border box: the insets are padding, so inset-only changes must re-measure too.
    ro.observe(content, { box: 'border-box' });
    return () => ro.disconnect();
  }, [physics, vertical, st]);

  // Physics stepping.
  useEffect(() => ctx.animator.add(physics, () => applyRef.current(physics.offset)), [ctx.animator, physics]);

  // Native scroll (keyboard, focus, scrollIntoView): adopt the offset unless we wrote it.
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const onNative = () => {
      const n = vertical ? scroller.scrollTop : scroller.scrollLeft;
      // Ignore the browser's sub-pixel clamp of a value we wrote (a fractional max would otherwise stop a bounce).
      if (Math.abs(n - st.lastNative) < 1) return;
      st.lastNative = n;
      if (!st.tracking) physics.stop();
      physics.offset = n;
      applyRef.current(n, true);
    };
    scroller.addEventListener('scroll', onNative, { passive: true });
    return () => scroller.removeEventListener('scroll', onNative);
  }, [physics, vertical, st]);

  // Pointer drag through the gesture arena.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const tracker = new VelocityTracker();
    let lastMoveT = 0;
    let startPos = 0;
    let startOffset = 0;
    let startScroll = 0;
    let sheetTook = false;
    let zeroVelocity = false;
    const pos = (e: PointerEvent) => (vertical ? e.clientY : e.clientX);
    const recognizer = {
      decide(s: { dx: number; dy: number; event: PointerEvent }) {
        track(s.event);
        const along = vertical ? s.dy : s.dx;
        const across = vertical ? s.dx : s.dy;
        const h = gestureThresholds.panHysteresis; // SMG §7: 10 pt
        if (Math.abs(along) >= h && Math.abs(along) >= Math.abs(across)) return 'claim' as const;
        if (Math.abs(across) >= h && Math.abs(across) > Math.abs(along)) return 'fail' as const;
        return 'wait' as const;
      },
      onBegin(s: { event: PointerEvent; dx: number; dy: number; startX: number; startY: number }) {
        st.tracking = true;
        physics.dragBegin();
        // Resume from the unbanded position so a drag that catches a bounce continues smoothly.
        startOffset = physics.unbandedOffset;
        startScroll = physics.offset;
        // UIKit's translation starts at the hysteresis point, 10 pt past the touch-down (traces: offset = drag − 10).
        const along = vertical ? s.dy : s.dx;
        startPos = (vertical ? s.startY : s.startX) + Math.sign(along) * Math.min(Math.abs(along), gestureThresholds.panHysteresis);
        // SMG §3 touch coefficient 0.55; mouse drags are treated as touches in this kit.
        physics.rubberBandCoefficient = RUBBER_BAND_TOUCH;
        sheetTook = false;
        zeroVelocity = false;
        if (sheet && vertical) sheet.scrollDragBegin();
      },
      onMove(s: { event: PointerEvent }) {
        const p = pos(s.event);
        track(s.event);
        const proposed = startOffset - (p - startPos);
        if (sheet && vertical) {
          const r = sheet.scrollDragMove({
            proposedOffset: proposed,
            startOffset: startScroll,
            maxTopOffset: 0,
            canScroll: st.maxNative > 0.5,
            panVelocity: tracker.velocity(),
            decelerating: false,
            hasRefreshControl: st.refreshEnabled,
            scrollsHorizontally: false,
          });
          if (r) {
            sheetTook = true;
            zeroVelocity = r.zeroScrollVelocity;
            physics.offset = r.scrollOffset;
            applyRef.current(physics.offset);
            return;
          }
        }
        physics.bounces = bounces;
        physics.dragMove(proposed);
        applyRef.current(physics.offset);
      },
      onEnd(s: { event: PointerEvent }, cancelled: boolean) {
        st.tracking = false;
        const outside = physics.offset < physics.bounds.min || physics.offset > physics.bounds.max;
        const fingerV = cancelled ? 0 : tracker.releaseVelocity(outside);
        let v = -fingerV; // content velocity = −finger velocity
        if (sheet && vertical) {
          const took = sheet.scrollDragEnd(fingerV);
          if (took && (zeroVelocity || sheetTook)) v = zeroVelocity ? 0 : v;
        }
        const target = targetRef.current;
        const detents = detentsRef.current;
        const retarget = target
          ? (projected: number) => target(projected, v)
          : detents && detents.length > 1
            ? (projected: number) => snapToDetent(projected, detents, physics.bounds.min)
            : undefined;
        physics.dragEnd(v, retarget, (s.event.timeStamp - lastMoveT) / 1000);
        ctx.animator.wake();
        applyRef.current(physics.offset);
      },
      onCancel() {
        if (st.tracking) {
          st.tracking = false;
          physics.dragEnd(0);
          ctx.animator.wake();
        }
      },
    };
    // Pan samples come from every move since touch-down, as UIPanGestureRecognizer's do.
    const track = (e: PointerEvent) => {
      if (e.timeStamp === lastMoveT) return;
      if (lastMoveT >= 0) physics.observeFrame((e.timeStamp - lastMoveT) / 1000);
      lastMoveT = e.timeStamp;
      tracker.add(e.timeStamp, pos(e));
    };
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      tracker.reset();
      lastMoveT = -1;
      track(e);
      ctx.gestures.track(e, recognizer);
      // A touch on a moving scroll view stops it and owns the gesture (no tap on the row underneath).
      if (physics.active && Math.abs(physics.velocity) > 50) {
        physics.stop();
        ctx.gestures.claim(e, recognizer);
      }
    };
    wrap.addEventListener('pointerdown', onDown);
    return () => wrap.removeEventListener('pointerdown', onDown);
  }, [ctx, physics, vertical, sheet, bounces, st]);

  // Wheel and trackpad.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let unbanded = 0;
    let active = false;
    let endTimer: ReturnType<typeof setTimeout> | 0 = 0;
    // Wheel velocity (content pt/s, smoothed) and the momentum hand-off state, see below.
    let vel = 0;
    let lastT = 0;
    let lastAbs = 0;
    let handedOff = false;
    const onWheel = (e: WheelEvent) => {
      const raw = vertical ? e.deltaY || (e.shiftKey ? e.deltaX : 0) : e.deltaX || e.deltaY;
      if (!raw) return;
      // Let an inner scroll view in the same axis have it first.
      e.preventDefault();
      e.stopPropagation();
      // Once a continuous (trackpad) gesture is running, every event belongs to it: a fast flick and the macOS
      // momentum after it reach integer deltas ≥ 100, which on their own read as mouse notches and would start
      // 0.3 s animated scrolls in the middle of the gesture (visible stutter).
      const kind = active ? 'pixel' : classifyWheel(e.deltaMode, raw);
      const delta = wheelDeltaPixels(e.deltaMode, raw, st.viewport);
      if (kind === 'discrete') {
        // SMG §5 setContentOffset(animated): 0.3 s sin² — used for mouse-wheel notches.
        const base = physics.active && physics.tracking === false ? physics.offset : physics.offset;
        const target = Math.min(st.maxNative, Math.max(0, base + delta));
        physics.scrollTo(target, true);
        ctx.animator.wake();
        return;
      }
      const dt = e.timeStamp - lastT;
      lastT = e.timeStamp;
      const abs = Math.abs(delta);
      // A fresh push after a hand-off (deltas grow again instead of decaying): a new gesture.
      if (handedOff && abs > lastAbs * 1.5 + 2) {
        handedOff = false;
        active = false;
      }
      lastAbs = abs;
      if (handedOff) {
        // The rest of the macOS momentum belongs to the flick UIKit is already decelerating: swallow it.
        if (endTimer) clearTimeout(endTimer);
        endTimer = setTimeout(() => {
          active = false;
          handedOff = false;
        }, 90);
        return;
      }
      if (!active) {
        vel = 0;
      } else if (dt > 0) {
        vel = 0.5 * vel + 0.5 * ((delta / dt) * 1000);
        // Wheel events arrive once per frame: they tell the physics the display rate, as touch moves do.
        physics.observeFrame(dt / 1000);
      }
      if (!active) {
        active = true;
        physics.dragBegin();
        unbanded = physics.unbandedOffset;
        // SMG §3: rubber-band coefficient per input device: a Mac trackpad is a large trackpad (0.17).
        physics.rubberBandCoefficient = RUBBER_BAND_COEFFICIENTS.hiResMouseOrLargeTrackpad;
      }
      const { min, max } = physics.bounds;
      const inside = physics.offset >= min - 0.01 && physics.offset <= max + 0.01;
      unbanded += delta;
      physics.bounces = bounces;
      // A fast wheel stream reaching an edge from inside is (almost always) the momentum of a flick. UIKit runs a
      // flick that reaches the edge through its bouncing deceleration (SMG §1/§3), so the velocity carries into the
      // overshoot and spring-back. Feeding the momentum deltas through the stiff trackpad band (c 0.17) instead cut
      // the speed to 17% in one frame (a visible wall). Hand it to the physics at the edge.
      // TODO(unknown): web-only; the browser does not expose the momentum phase. 800 pt/s separates it from a slow
      // deliberate push into the edge, which keeps the rubber band.
      const crossing = inside && (unbanded < min || unbanded > max);
      if (crossing && Math.abs(vel) > 800 && bounces) {
        physics.dragMove(Math.min(max, Math.max(min, unbanded)));
        // This frame's delta travels in full (past the edge); the bouncing deceleration continues from there.
        physics.offset = unbanded;
        physics.rubberBandCoefficient = RUBBER_BAND_TOUCH;
        // No immediate step: this frame already moved by the full delta.
        physics.dragEnd(vel);
        handedOff = true;
        ctx.animator.wake();
        applyRef.current(physics.offset);
        if (endTimer) clearTimeout(endTimer);
        endTimer = setTimeout(() => {
          active = false;
          handedOff = false;
        }, 90);
        return;
      }
      physics.dragMove(unbanded);
      applyRef.current(physics.offset);
      if (endTimer) clearTimeout(endTimer);
      // TODO(unknown): wheel-gesture end detection is web-only; 90 ms of silence ends it and starts the bounce-back.
      endTimer = setTimeout(() => {
        active = false;
        physics.rubberBandCoefficient = RUBBER_BAND_TOUCH;
        physics.dragEnd(0);
        ctx.animator.wake();
      }, 90);
    };
    wrap.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      wrap.removeEventListener('wheel', onWheel);
      if (endTimer) clearTimeout(endTimer);
    };
  }, [ctx, physics, vertical, bounces, st]);

  useImperativeHandle(
    ref,
    () => ({
      scrollTo(offset: number, animated = true) {
        physics.scrollTo(offset, animated);
        if (!animated) applyRef.current(offset);
        ctx.animator.wake();
      },
      get offset() {
        return physics.offset;
      },
      physics,
      get element() {
        return scrollerRef.current;
      },
    }),
    [physics, ctx.animator],
  );

  const scrollCtx = useMemo<ScrollContextValue>(
    () => ({
      subscribe(fn) {
        listeners.add(fn);
        return () => {
          listeners.delete(fn);
        };
      },
      viewportRect(): Rect | undefined {
        const wrap = wrapRef.current;
        if (!wrap) return undefined;
        const local = measureInLayer(wrap, layerCtx.element);
        const lt = layerCtx.layer?.transform;
        return lt ? transformRect(lt, local) : local;
      },
    }),
    [listeners, layerCtx.element, layerCtx.layer],
  );

  // Child scroll views publish into a channel that forwards here.
  const childChannel = useMemo(() => (channel ? new ScrollChannel(channel, () => false) : null), [channel]);

  // Insets are written only when non-zero, so padding from `contentClassName` applies otherwise.
  const pad: CSSProperties = vertical
    ? { ...(insetStart ? { paddingTop: insetStart } : null), ...(insetEnd ? { paddingBottom: insetEnd } : null), minHeight: '100%' }
    : { ...(insetStart ? { paddingLeft: insetStart } : null), ...(insetEnd ? { paddingRight: insetEnd } : null), minWidth: '100%', display: 'inline-flex', verticalAlign: 'top' };

  return (
    <div
      ref={wrapRef}
      className={['lq-scroll', className].filter(Boolean).join(' ')}
      // A horizontal scroll view takes its content's height (a row of chips or cards); a vertical one fills its parent.
      style={{ position: 'relative', overflow: 'hidden', flex: vertical ? '1 1 0' : 'none', minHeight: 0, minWidth: 0, ...style }}
    >
      <div
        ref={scrollerRef}
        className="lq-scroller"
        role={aria['aria-label'] ? 'region' : undefined}
        aria-label={aria['aria-label']}
        style={{
          position: vertical ? 'absolute' : 'relative',
          inset: vertical ? 0 : undefined,
          height: vertical ? undefined : '100%',
          overflowX: vertical ? 'hidden' : 'auto',
          overflowY: vertical ? 'auto' : 'hidden',
          overscrollBehavior: 'none',
          // The physics owns touch panning; the browser would otherwise pan natively and cancel the pointer.
          touchAction: 'none',
          scrollbarWidth: 'none',
        }}
      >
        <div ref={contentRef} className={contentClassName} style={{ boxSizing: 'border-box', ...pad, ...contentStyle }}>
          <ScrollContext.Provider value={scrollCtx}>
            <ScrollChannelContext.Provider value={childChannel}>{children}</ScrollChannelContext.Provider>
          </ScrollContext.Provider>
        </div>
      </div>
      {onRefresh && (
        <div
          ref={refreshRef}
          aria-hidden={!refreshing}
          role={refreshing ? 'progressbar' : undefined}
          aria-label={refreshing ? 'Refreshing' : undefined}
          className={refreshing ? 'lq-refresh lq-refreshing' : 'lq-refresh'}
          style={{ position: 'absolute', left: '50%', top: 0, width: 28, height: 28, opacity: 0, pointerEvents: 'none' }}
        >
          <Spinner />
        </div>
      )}
      {showsIndicator && (
        <div
          ref={indicatorRef}
          aria-hidden="true"
          style={{
            position: 'absolute',
            pointerEvents: 'none',
            opacity: 0,
            // SMG §5: 3 pt thick, radius 1.5, 3 pt from the edge, 0.5 s easeInEaseOut fade. Colour: bars-appearances.
            transition: 'opacity 0.5s ease-in-out',
            borderRadius: metrics.scrollIndicatorThickness / 2,
            background: 'var(--lq-scroll-indicator)',
            ...(vertical
              ? { right: metrics.scrollIndicatorInset, top: 0, width: metrics.scrollIndicatorThickness, height: 0 }
              : { bottom: metrics.scrollIndicatorInset, left: 0, height: metrics.scrollIndicatorThickness, width: 0 }),
          }}
        />
      )}
    </div>
  );
});

/** Nearest detent to the projected target when it lies inside the detent range (offsets relative to `rest`). */
function snapToDetent(projected: number, detents: readonly number[], rest: number): number {
  const p = projected - rest;
  let prev: number | undefined;
  for (const d of detents) {
    if (prev !== undefined && p > prev && p < d) return rest + (p > (prev + d) / 2 ? d : prev);
    prev = d;
  }
  return projected;
}

/** UIActivityIndicatorView-like spinner (8 spokes). TODO(unknown): spinner geometry is not in the extraction. */
function Spinner() {
  return (
    <svg viewBox="0 0 28 28" width="28" height="28" className="lq-spinner" style={{ display: 'block' }}>
      {Array.from({ length: 8 }, (_, i) => (
        <rect
          key={i}
          x="12.75"
          y="3"
          width="2.5"
          height="7"
          rx="1.25"
          fill="var(--lq-secondary-label)"
          opacity={0.25 + (i / 8) * 0.75}
          transform={`rotate(${i * 45} 14 14)`}
        />
      ))}
    </svg>
  );
}
