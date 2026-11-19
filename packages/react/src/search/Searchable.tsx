/**
 * `.searchable` for a `<Screen>` (iPhone, default placement): the bottom search field (SearchBar), the scope bar and the
 * navigation-bar hand-off while search is presented. SL = deep/demo-audit/search.
 *
 * Presenting (tap the field, or `isPresented`): the navigation bar (title, large title, items) moves up by its own
 * height and fades (bar spring ζ 0.80 / 0.335; fades ζ 0.92 / 0.15); the content top inset becomes the safe area
 * (+ 36 with scopes) and the content follows on the bar spring; the field narrows ≈ 80 ms later.
 * Dismissing (close button, Escape): without scopes the bar and content snap back in the first frame while the field
 * widens (SL); with scopes the bar slides back on the bar spring and the scope bar rides down with it, fading on
 * ζ 0.91 / 0.15.
 */
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LayoutShiftContext, useLiquid, type LayoutShiftContextValue } from '../root/context';
import type { GlassHandle } from '../root/Glass';
import { useSpring } from '../root/useSpring';
import { SCOPE, SCOPE_APPEAR_MS, SEARCH_SPRINGS } from './logic';
import { ScopeBar, type ScopeOption } from './ScopeBar';
import { SearchBar } from './SearchBar';

export interface SearchableProps<T = string> {
  /** Search text (controlled); omit for an uncontrolled field. */
  text?: string;
  onTextChange?(text: string): void;
  /** Placeholder. Default "Search". */
  prompt?: string;
  /** Presentation (controlled); omit to let the field manage it. */
  isPresented?: boolean;
  onPresentedChange?(presented: boolean): void;
  /** `searchScopes(_, activation: .onSearchPresentation)`: shown while presented. */
  scopes?: readonly ScopeOption<T>[];
  scope?: T;
  onScopeChange?(scope: T): void;
  /** `searchToolbarBehavior(.minimize)`: a 48 pt circle until presented. */
  minimize?: boolean;
  onSubmit?(text: string): void;
}

export interface SearchableState {
  presented: boolean;
  /** Content top inset while presented (safe area + scope bar). */
  presentedTop: number;
  /** Attach to the navigation bar wrapper (moved and faded while presented). */
  barRef(el: HTMLDivElement | null): void;
  /** Attach to the screen body (content follows the inset change on the bar spring). */
  bodyRef(el: HTMLDivElement | null): void;
  /** Call from a layout effect when the top inset changed, with the old minus the new inset. */
  insetChanged(delta: number): void;
  /** Bottom field, close button and scope bar. */
  ui: ReactNode;
}

function useControlled<V>(value: V | undefined, initial: V, onChange?: (v: V) => void): [V, (v: V) => void] {
  const [inner, setInner] = useState(initial);
  const v = value === undefined ? inner : value;
  return [
    v,
    (n: V) => {
      if (value === undefined) setInner(n);
      onChange?.(n);
    },
  ];
}

/** Screen-level search state. `barShift` = navigation bar height − safe top (106 with a large title). */
export function useSearchable<T>(opts: SearchableProps<T> | undefined, geom: { safeTop: number; barShift: number }): SearchableState | null {
  const ctx = useLiquid();
  const [text, setText] = useControlled(opts?.text, '', opts?.onTextChange);
  const [presented, setPresented] = useControlled(opts?.isPresented, false, opts?.onPresentedChange);
  const [innerScope, setInnerScope] = useState<T | undefined>(opts?.scopes?.[0]?.value);
  const scope = opts?.scope ?? innerScope;
  const hasScopes = !!opts?.scopes?.length;
  const barEl = useRef<HTMLDivElement | null>(null);
  const bodyEl = useRef<HTMLDivElement | null>(null);
  const scopeEl = useRef<HTMLDivElement | null>(null);
  const scopeGlass = useRef<GlassHandle | null>(null);
  const shiftRef = useRef(geom.barShift);
  shiftRef.current = geom.barShift;

  // Glass inside the scope bar re-measures when the bar moves (positions are not observed otherwise).
  const parentShift = useContext(LayoutShiftContext);
  const listeners = useMemo(() => new Set<() => void>(), []);
  const shift = useMemo<LayoutShiftContextValue>(
    () => ({
      subscribe(fn) {
        listeners.add(fn);
        const off = parentShift?.subscribe(fn);
        return () => {
          listeners.delete(fn);
          off?.();
        };
      },
    }),
    [listeners, parentShift],
  );

  const writeBar = () => {
    const el = barEl.current;
    if (!el) return;
    const y = -shiftRef.current * bar.value;
    el.style.transform = y ? `translate3d(0, ${y.toFixed(2)}px, 0)` : '';
    el.style.opacity = String(Math.min(1, Math.max(0, barAlpha.value)));
    ctx.requestFrame();
  };
  const bar = useSpring(presented ? 1 : 0, SEARCH_SPRINGS.bar, writeBar);
  const barAlpha = useSpring(presented ? 0 : 1, SEARCH_SPRINGS.fade, writeBar);
  const body = useSpring(0, SEARCH_SPRINGS.bar, (v) => {
    if (bodyEl.current) bodyEl.current.style.transform = Math.abs(v) > 0.01 ? `translate3d(0, ${v.toFixed(2)}px, 0)` : '';
    ctx.requestFrame();
  });
  const writeScope = () => {
    const el = scopeEl.current;
    const a = Math.min(1, Math.max(0, scopeAlpha.value));
    if (el) el.style.top = `${geom.safeTop + scopeY.value}px`;
    const g = scopeGlass.current;
    if (g?.shape) g.shape.opacity = a;
    if (g?.layer) {
      g.layer.opacity = a;
      g.layer.visible = a > 0.001;
    }
    listeners.forEach((f) => f());
    ctx.requestFrame();
  };
  const scopeY = useSpring(0, SEARCH_SPRINGS.bar, writeScope);
  const scopeAlpha = useSpring(presented ? 1 : 0, SEARCH_SPRINGS.fade, writeScope);
  // Initial placement (presented from the start).
  useLayoutEffect(() => {
    writeBar();
    writeScope();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [scopeShown, setScopeShown] = useState(presented && hasScopes);
  const presentedRef = useRef(presented);
  useEffect(() => {
    const was = presentedRef.current;
    presentedRef.current = presented;
    if (was === presented) return;
    const instant = ctx.reducedMotion;
    if (presented) {
      if (instant) {
        bar.snap(1);
        barAlpha.snap(0);
      } else {
        bar.set(1);
        barAlpha.set(0);
      }
      scopeY.snap(0);
      scopeAlpha.snap(0);
      if (!hasScopes) return;
      const t = setTimeout(
        () => {
          setScopeShown(true);
          scopeAlpha.snap(1);
        },
        instant ? 0 : SCOPE_APPEAR_MS,
      );
      return () => clearTimeout(t);
    }
    if (hasScopes && !instant) {
      bar.set(0);
      barAlpha.set(1, { params: SEARCH_SPRINGS.bar });
      scopeY.set(shiftRef.current);
      scopeAlpha.set(0, { params: { dampingRatio: 0.91, response: 0.15 } });
      const t = setTimeout(() => setScopeShown(false), 400);
      return () => clearTimeout(t);
    }
    bar.snap(0);
    barAlpha.snap(1);
    scopeAlpha.snap(0);
    setScopeShown(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presented]);

  const insetChanged = (delta: number) => {
    if (!delta) return;
    // Snap back on a scope-less dismiss (SL: list at its rest position in the first frame).
    if (ctx.reducedMotion || (!presented && !hasScopes)) {
      body.snap(0);
      return;
    }
    body.snap(body.value + delta);
    body.set(0);
  };

  if (!opts) return null;
  const width = ctx.viewport.width - 2 * SCOPE.margin;
  const ui = (
    <>
      {hasScopes && (
        <div
          ref={scopeEl}
          style={{ position: 'absolute', left: SCOPE.margin, top: geom.safeTop, width, height: SCOPE.height, zIndex: 3 }}
        >
          <LayoutShiftContext.Provider value={shift}>
            <ScopeBar
              glassRef={scopeGlass}
              hidden={!scopeShown}
              scopes={opts.scopes!}
              selection={scope as T}
              onChange={(v) => {
                setInnerScope(v);
                opts.onScopeChange?.(v);
              }}
              width={width}
            />
          </LayoutShiftContext.Provider>
        </div>
      )}
      <SearchBar
        text={text}
        onTextChange={setText}
        prompt={opts.prompt ?? 'Search'}
        presented={presented}
        minimize={opts.minimize}
        onSubmit={opts.onSubmit}
        onPresent={() => setPresented(true)}
        onCancel={() => {
          setText('');
          setPresented(false);
        }}
      />
    </>
  );
  return {
    presented,
    presentedTop: geom.safeTop + (hasScopes ? SCOPE.height : 0),
    barRef: (el) => {
      barEl.current = el;
    },
    bodyRef: (el) => {
      bodyEl.current = el;
    },
    insetChanged,
    ui,
  };
}
