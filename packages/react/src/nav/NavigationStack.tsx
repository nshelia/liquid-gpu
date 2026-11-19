/**
 * NavigationStack: UINavigationController push/pop with the parallax transition, rebuilt on layers.
 *
 * - Each screen is its own layer; the transition only changes layer transforms and dim (GPU-only in webgpu mode).
 * - Push/pop spring: ζ 1, response 0.30 with retargetImpulse 0.02 (≈ 8.8 × distance/s kick) [TR §1], `springs.push`.
 * - Parallax: the screen below ends at −0.3·W [TR §1]; dimming black α 0.10 × progress [TR §1].
 * - Card shadow: `_UIParallaxTransitionCardView` shadowOpacity 0.04, radius 12 [TR §1], drawn as a 24 pt gradient
 *   strip left of the incoming screen (layers have no shadow).
 * - Interactive back swipe from the edge (46.6 pt, hysteresis 15) or the full width (hysteresis 10), tracked with
 *   (0.85, 0.08) [TR §2], decided by `PopGestureTracker`/`popShouldFinish` [GS §3], finished or cancelled with
 *   (0.85, 0.30) and the hand-off velocity (incl. the ×4.25 edge-flick boost) [TR §2].
 *
 * TR = findings/transitions.md, GS = deep/gestures/findings.md.
 */
import {
  Children,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { PopGestureTracker, shadows, springs } from '@liquid-gpu/core';
import type { Layer } from '@liquid-gpu/gpu';
import { useLiquid, ZBaseContext } from '../root/context';
import { LayerView } from '../root/Layer';
import { useSpring } from '../root/useSpring';
import { zBands } from '../root/zBands';
import { popGestureDecision, popPercent, stackTransforms } from '../logic/nav';

export interface NavigationApi {
  push(screen: ReactElement): void;
  /**
   * Push the destination registered for `value` in the stack's `destinations`. With a controlled `path`, this
   * calls `onPathChange([...path, value])` and the push happens when the new path arrives.
   */
  pushValue(value: string): void;
  pop(): void;
  popToRoot(): void;
  readonly depth: number;
  readonly canGoBack: boolean;
  /** Values of the pushed value-based screens, bottom to top (element pushes are not included). */
  readonly path: string[];
}

/**
 * A destination for a string value: an element, or a function of the value. Lookup is by the exact value first, then
 * by its first `/` segment (so `"product/42"` can resolve through a `product` function).
 */
export type NavigationDestination = ReactElement | ((value: string) => ReactElement | null);
export type NavigationDestinations = Record<string, NavigationDestination>;

/** Resolve a value against a destinations map (null when nothing matches). */
export function resolveDestination(destinations: NavigationDestinations | undefined, value: string): ReactElement | null {
  if (!destinations) return null;
  const d = destinations[value] ?? destinations[value.split('/')[0]!];
  if (!d) return null;
  return typeof d === 'function' ? d(value) : d;
}

export const NavigationContext = createContext<NavigationApi | null>(null);

/** The nearest NavigationStack (null outside one). */
export function useNavigation(): NavigationApi | null {
  return useContext(NavigationContext);
}

export interface StackEntryContextValue {
  key: string;
  index: number;
  isTop: boolean;
  /** Visible in the current state (top, or the one below during a transition). */
  visible: boolean;
  /** x at which the screen's layer starts (the viewport width for a screen being pushed). */
  initialX: number;
  /** Stable: `register(key, layer)`. */
  registerLayer(key: string, layer: Layer | null): void;
}

export const StackEntryContext = createContext<StackEntryContextValue | null>(null);

interface Entry {
  key: string;
  el: ReactElement;
  /** Destination value for value-based pushes (`path`). */
  value?: string;
}

type Phase = 'idle' | 'push' | 'pop' | 'interactive';

export interface NavigationStackProps {
  /** The root screen (or pass it as the only child). */
  root?: ReactElement;
  children?: ReactNode;
  /** Mirror pushes into `history.pushState` and pop on the browser's back. Default false. */
  history?: boolean;
  /** Back swipe from anywhere on the screen, not only the edge. Default true (iOS 26+ content pop gesture). */
  fullWidthBackGesture?: boolean;
  /** Draw-order base index (stack i uses `zBands.screen(i)` upwards). */
  zIndexBase?: number;
  /** Screens for `NavigationLink value="…"` / `pushValue` (JSON-friendly navigation). */
  destinations?: NavigationDestinations;
  /**
   * Controlled stack: the values of the pushed screens (bottom to top), resolved through `destinations`. Growing it
   * by one pushes with the push animation, shrinking it by one pops with the pop animation, any other change
   * replaces the stack without animation. Pops by the user (back button, swipe) report through `onPathChange`.
   */
  path?: string[];
  onPathChange?(path: string[]): void;
}

let entrySeq = 0;

const pathOf = (es: readonly Entry[]): string[] => es.slice(1).flatMap((e) => (e.value === undefined ? [] : [e.value]));
const samePath = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((v, i) => v === b[i]);

export function NavigationStack({
  root,
  children,
  history = false,
  fullWidthBackGesture = true,
  zIndexBase = 0,
  destinations,
  path,
  onPathChange,
}: NavigationStackProps) {
  const ctx = useLiquid();
  const destinationsRef = useRef(destinations);
  destinationsRef.current = destinations;
  const pathRef = useRef(path);
  pathRef.current = path;
  const onPathChangeRef = useRef(onPathChange);
  onPathChangeRef.current = onPathChange;
  /** Report a path the stack reached by itself (user pop) to a controlled owner. */
  const reportPath = useCallback((es: readonly Entry[]) => {
    const p = pathRef.current;
    if (p === undefined) return;
    const next = pathOf(es);
    if (!samePath(next, p)) onPathChangeRef.current?.(next);
  }, []);
  const rootEl = root ?? (Children.only(children) as ReactElement);
  const [entries, setEntries] = useState<Entry[]>(() => [{ key: `s${entrySeq++}`, el: rootEl }]);
  const [phase, setPhase] = useState<Phase>('idle');
  const layers = useRef(new Map<string, Layer>());
  const [layerVersion, setLayerVersion] = useState(0);
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const shadowRef = useRef<Layer | null>(null);
  const W = ctx.viewport.width;
  const widthRef = useRef(W);
  widthRef.current = W;
  const ignorePopState = useRef(0);
  const zBase = useContext(ZBaseContext);

  // Root element updates (e.g. the app re-renders the root screen with new props).
  useLayoutEffect(() => {
    setEntries((es) => (es[0]!.el === rootEl ? es : [{ ...es[0]!, el: rootEl }, ...es.slice(1)]));
  }, [rootEl]);

  const apply = useCallback(() => {
    const es = entriesRef.current;
    const ph = phaseRef.current;
    const p = progress.value;
    const w = widthRef.current;
    const n = es.length;
    const t = stackTransforms(ph === 'idle' ? 1 : p, w);
    es.forEach((e, i) => {
      const l = layers.current.get(e.key);
      if (!l) return;
      if (i === n - 1) {
        l.transform = new DOMMatrix().translate(ph === 'idle' ? 0 : t.topX, 0);
        l.dim = 0;
      } else if (i === n - 2 && ph !== 'idle') {
        l.transform = new DOMMatrix().translate(t.belowX, 0);
        l.dim = t.belowDim;
      } else {
        l.transform = new DOMMatrix();
        l.dim = 0;
      }
    });
    const sh = shadowRef.current;
    if (sh) {
      sh.visible = ph !== 'idle' && n > 1;
      sh.transform = new DOMMatrix().translate(t.topX - SHADOW_WIDTH, 0);
      sh.opacity = Math.max(0, Math.min(1, p * 4));
    }
    ctx.requestFrame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const registerLayer = useCallback((key: string, layer: Layer | null) => {
    const prev = layers.current.get(key) ?? null;
    if (prev === layer) return;
    if (layer) layers.current.set(key, layer);
    else layers.current.delete(key);
    const es = entriesRef.current;
    if (layer && es[es.length - 1]?.key === key && phaseRef.current === 'push') {
      layer.transform = new DOMMatrix().translate(widthRef.current, 0);
    }
    setLayerVersion((v) => v + 1);
  }, []);

  const onSettle = useRef<(() => void) | null>(null);
  const progress = useSpring(1, springs.push, (_v, s) => {
    apply();
    if (s.settled && onSettle.current) {
      const f = onSettle.current;
      onSettle.current = null;
      f();
    }
  });

  const finishPop = useCallback(() => {
    const cur = entriesRef.current;
    const next = cur.length > 1 ? cur.slice(0, -1) : cur;
    entriesRef.current = next;
    setEntries(next);
    reportPath(next);
    setPhase('idle');
    phaseRef.current = 'idle';
    progress.snap(1);
  }, [progress, reportPath]);

  const animatePop = useCallback(() => {
    if (entriesRef.current.length < 2) return;
    setPhase('pop');
    phaseRef.current = 'pop';
    // TR §1: pop uses the same noninteractive spring with the retarget kick.
    progress.set(0, { params: springs.pop });
    onSettle.current = finishPop;
  }, [finishPop, progress]);

  const pushEntry = useCallback(
    (screen: ReactElement, value?: string) => {
      const key = `s${entrySeq++}`;
      if (history) window.history.pushState({ lqNav: entriesRef.current.length }, '');
      progress.snap(0);
      onSettle.current = () => {
        setPhase('idle');
        phaseRef.current = 'idle';
        apply();
      };
      phaseRef.current = 'push';
      setPhase('push');
      const next = [...entriesRef.current, { key, el: screen, value }];
      entriesRef.current = next;
      setEntries(next);
    },
    [history, progress, apply],
  );

  const api = useMemo<NavigationApi>(
    () => ({
      push(screen) {
        pushEntry(screen);
      },
      pushValue(value) {
        if (pathRef.current !== undefined) {
          onPathChangeRef.current?.([...pathRef.current, value]);
          return;
        }
        const el = resolveDestination(destinationsRef.current, value);
        if (!el) {
          console.warn(`[liquid-gpu] NavigationStack: no destination for "${value}"`);
          return;
        }
        pushEntry(el, value);
      },
      pop() {
        if (entriesRef.current.length < 2) return;
        if (history) {
          window.history.back();
          return;
        }
        animatePop();
      },
      popToRoot() {
        const n = entriesRef.current.length;
        if (n < 2) return;
        if (history) {
          ignorePopState.current += n - 2;
          window.history.go(-(n - 1));
          setEntries((es) => [es[0]!, es[es.length - 1]!]);
          return;
        }
        setEntries((es) => [es[0]!, es[es.length - 1]!]);
        requestAnimationFrame(() => animatePop());
      },
      get depth() {
        return entriesRef.current.length;
      },
      get canGoBack() {
        return entriesRef.current.length > 1;
      },
      get path() {
        return pathOf(entriesRef.current);
      },
    }),
    [history, animatePop, pushEntry],
  );

  // Controlled path: follow `path` (one push / one pop animate, anything else replaces the stack).
  const pathKey = path ? JSON.stringify(path) : null;
  useLayoutEffect(() => {
    const want = pathRef.current;
    if (want === undefined) return;
    const es = entriesRef.current;
    const cur = es.slice(1).map((e) => e.value);
    if (cur.length === want.length && cur.every((v, i) => v === want[i])) return;
    const prefix = (a: readonly (string | undefined)[], b: readonly (string | undefined)[]) => a.every((v, i) => v === b[i]);
    const idle = phaseRef.current === 'idle';
    if (idle && want.length === cur.length + 1 && prefix(cur, want)) {
      const el = resolveDestination(destinationsRef.current, want[want.length - 1]!);
      if (el) {
        pushEntry(el, want[want.length - 1]);
        return;
      }
    }
    if (idle && want.length === cur.length - 1 && prefix(want, cur)) {
      animatePop();
      return;
    }
    const next: Entry[] = [es[0]!];
    for (const v of want) {
      const el = resolveDestination(destinationsRef.current, v);
      if (el) next.push({ key: `s${entrySeq++}`, el, value: v });
      else console.warn(`[liquid-gpu] NavigationStack: no destination for "${v}"`);
    }
    onSettle.current = null;
    progress.snap(1);
    phaseRef.current = 'idle';
    setPhase('idle');
    entriesRef.current = next;
    setEntries(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathKey]);

  // Start the push spring once the new screen's layer exists.
  useLayoutEffect(() => {
    if (phase !== 'push') return;
    const top = entries[entries.length - 1]!;
    if (!layers.current.get(top.key)) return;
    if (progress.target === 0) {
      apply();
      // TR §1 noninteractiveSpring (1, 0.30), retargetImpulse 0.02 → initial kick.
      progress.set(1, { params: springs.push });
    }
  }, [phase, entries, layerVersion, progress, apply]);

  // Browser history.
  useEffect(() => {
    if (!history) return;
    window.history.replaceState({ lqNav: 0 }, '');
    const onPop = () => {
      if (ignorePopState.current > 0) {
        ignorePopState.current--;
        return;
      }
      if (phaseRef.current === 'interactive') return;
      animatePop();
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [history, animatePop]);

  // Interactive back swipe on the top screen.
  const topKey = entries[entries.length - 1]!.key;
  useEffect(() => {
    const layer = layers.current.get(topKey);
    const el = layer?.element;
    if (!el || entries.length < 2) return;
    let tracker: PopGestureTracker | null = null;
    let startDx = 0;
    const recognizer = {
      decide(s: { dx: number; dy: number; startX: number }) {
        if (phaseRef.current !== 'idle') return 'fail' as const;
        return popGestureDecision(s.dx, s.dy, s.startX, fullWidthBackGesture);
      },
      onBegin(s: { dx: number }) {
        tracker = new PopGestureTracker(widthRef.current);
        startDx = s.dx;
        phaseRef.current = 'interactive';
        setPhase('interactive');
        onSettle.current = null;
      },
      onMove(s: { dx: number; t: number }) {
        if (!tracker) return;
        const tr = s.dx - startDx; // TR §2: 1:1 with the translation since recognition
        tracker.add(s.t, tr);
        // TR §2 tracking spring (0.85, 0.08), retargeted every move.
        progress.set(1 - popPercent(tr, widthRef.current), { params: springs.navTracking });
      },
      onEnd(_s: unknown, cancelled: boolean) {
        if (!tracker) return;
        const finish = !cancelled && tracker.shouldFinish();
        const v = tracker.releaseVelocity(); // widths/s toward finishing (TR §2, with the edge-flick boost)
        tracker = null;
        if (finish) {
          if (history) ignorePopState.current++;
          progress.set(0, { params: springs.navInteractiveFinish, velocity: -v });
          onSettle.current = () => {
            finishPop();
            if (history) window.history.back();
          };
        } else {
          progress.set(1, { params: springs.navInteractiveFinish, velocity: -v });
          onSettle.current = () => {
            setPhase('idle');
            phaseRef.current = 'idle';
            apply();
          };
        }
      },
      onCancel() {
        if (tracker) recognizer.onEnd(null, true);
      },
    };
    const onDown = (e: PointerEvent) => ctx.gestures.track(e, recognizer);
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
  }, [topKey, entries.length, layerVersion, ctx.gestures, fullWidthBackGesture, progress, finishPop, apply, history]);

  useLayoutEffect(() => {
    apply();
  }, [entries, phase, layerVersion, apply, W]);

  const n = entries.length;
  return (
    <NavigationContext.Provider value={api}>
      {entries.map((e, i) => {
        const visible = i === n - 1 || (i === n - 2 && phase !== 'idle');
        const value: StackEntryContextValue = {
          key: e.key,
          index: zIndexBase + i,
          isTop: i === n - 1,
          visible,
          initialX: i === n - 1 && phase === 'push' ? W : 0,
          registerLayer,
        };
        return (
          <StackEntryContext.Provider key={e.key} value={value}>
            {isValidElement(e.el) ? e.el : null}
          </StackEntryContext.Provider>
        );
      })}
      {n > 1 && (
        <LayerView
          ref={(l) => {
            shadowRef.current = l;
          }}
          z={(zBase === null ? zBands.screen(zIndexBase + n - 1) : zBase + 10 + 10 * (zIndexBase + n - 1)) - 1}
          width={SHADOW_WIDTH}
          visible={phase !== 'idle'}
          aria-hidden="true"
          style={{
            pointerEvents: 'none',
            // TR §1 card shadow opacity 0.04, radius 12: a Gaussian falloff over 2 × radius.
            background: `linear-gradient(to left, rgba(0,0,0,${shadows.navCard.opacity * 2}), rgba(0,0,0,${shadows.navCard.opacity * 0.6}) 35%, rgba(0,0,0,0))`,
          }}
        />
      )}
    </NavigationContext.Provider>
  );
}

const SHADOW_WIDTH = shadows.navCard.radius * 2;
