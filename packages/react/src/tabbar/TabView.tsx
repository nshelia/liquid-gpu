// Portions adapted from robinWongM/liquid-glass (Apache-2.0): src/glass/tabView.tsx (layout, lens interaction).
/**
 * TabView + TabBar: the iOS 27 floating tab bar.
 *
 * - Platter: regular glass 62 tall (r 31), bottom 21 above the screen edge; width and buttons from the measured
 *   label widths (logic/tabbar.ts `tabBarLayout`). Group smoothness 6 (BR §0). Pressed, it lifts and stretches with
 *   the regular flex interaction and glows at the finger.
 * - Liquid lens (logic/tablens.ts): one 'lens' glass shape. At rest the pill (button W × 54) shows the blurred,
 *   colour-matrixed backdrop; pressed it lifts to (W + 16) × 70 (q 0 → 1) and follows the finger, squashing with its
 *   acceleration. The tinted copy of the items draws above the lens, clipped to it and warped at its rim
 *   (`Layer.lens`: amount −H/4·q, band 0.2·H·q, rim 11.2), each item magnified 1 + 0.16·q; the plain items have a
 *   matching hole. Badges sit above the resting pill and under the lifted lens (demo-audit/tabbar §6 press shots).
 * - Colours: native iOS 27 (demo-audit/tabbar §4): selected #0080F5 / #0697FF, unselected #0E0D0F / #F9F9F9.
 * - Minimize on scroll (`minimizeBehavior="onScrollDown"`): squeeze to 0.959 over 10…60 pt of downward drag about
 *   the group anchor (TX), collapse at ~58 pt into a 48 × 48 glass circle at (28, bottom − 28) with (0.76, 0.42).
 *   It expands only on tapping the circle: on iOS 27.0 scrolling back up, even to the top, keeps it minimized
 *   (TX rec/noacc_scroll.jsonl, rec/accessory_scroll3.jsonl).
 * - `Tab role="search" | "prominent"` (TX): the tab leaves the platter for a 62 × 62 glass circle at the trailing
 *   edge, the platter is leading-aligned at x 21. The circle presses 62 → 78 with a white flood. Selecting a prominent
 *   tab tints its glyph and fades the lens out; selecting search morphs the platter into the 48 pt tab button and
 *   the circle into the search field, then shows a close button (iOS 26 `tabViewSearchActivation(.searchTabSelection)`).
 * - `bottomAccessory` (TX): a 398 × 48 glass capsule 8 above the platter (which widens to 398); when minimized it
 *   moves inline beside the tab button (90, 880, 322, 48).
 *
 * TX = deep/demo-audit/tabbar-extras (logic/tabbar.ts `TABX`).
 */
import {
  Children,
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
import { componentType, metrics, springs } from '@liquid-gpu/core';
import type { GlassShape, Layer, Rect } from '@liquid-gpu/gpu';
import { LayerContext, useLayerContext, useLiquid } from '../root/context';
import { LayerView } from '../root/Layer';
import { useSpring } from '../root/useSpring';
import { zBands } from '../root/zBands';
import { ScrollChannel } from '../logic/scroll';
import { lerpRect, MINIMIZE, minimizeSqueeze, scaleRect, scaleRectAbout, TABX, tabBarLayout } from '../logic/tabbar';
import { LENS, TabLens } from '../logic/tablens';
import { useFlex } from '../root/useFlex';
import { BarInsetsContext, ScrollChannelContext, TabBarPresentContext } from '../scroll/context';
import { MagnifyingGlassGlyph, XMarkGlyph } from './glyphs';

export type TabRole = 'search' | 'prominent';

export interface TabProps {
  id: string;
  /** Defaults to "Search" for `role="search"`. */
  label?: string;
  /** Defaults to magnifyingglass for `role="search"`. */
  icon?: ReactNode;
  badge?: string | number;
  /** `search` / `prominent`: the tab sits in its own glass circle at the trailing edge (iOS 27). */
  role?: TabRole;
  children?: ReactNode;
}

/** A tab of a `<TabView>` (configuration only; TabView renders it). */
export function Tab(_props: TabProps): null {
  return null;
}

export interface TabViewProps {
  selection?: string;
  defaultSelection?: string;
  onSelectionChange?(id: string): void;
  minimizeBehavior?: 'never' | 'onScrollDown';
  /** `tabViewBottomAccessory`: content of a glass capsule above the tab bar (e.g. a mini player). */
  bottomAccessory?: ReactNode;
  /** Search field text while the search tab is selected. */
  searchText?: string;
  onSearchTextChange?(text: string): void;
  /** Placeholder of the search field. Default "Search". */
  searchPrompt?: string;
  children?: ReactNode;
}

export function TabView({
  selection,
  defaultSelection,
  onSelectionChange,
  minimizeBehavior = 'never',
  bottomAccessory,
  searchText,
  onSearchTextChange,
  searchPrompt,
  children,
}: TabViewProps) {
  const tabs = Children.toArray(children).filter((c): c is ReactElement<TabProps> => isValidElement(c) && (c.props as TabProps).id !== undefined);
  const [inner, setInner] = useState(defaultSelection ?? (tabs[0]?.props.id as string | undefined) ?? '');
  const selected = selection ?? inner;
  const select = useCallback(
    (id: string) => {
      if (selection === undefined) setInner(id);
      onSelectionChange?.(id);
    },
    [selection, onSelectionChange],
  );
  const parentChannel = useContext(ScrollChannelContext);
  const rootChannel = useMemo(() => new ScrollChannel(parentChannel, () => false), [parentChannel]);
  const parentLayer = useLayerContext();
  const insets = useMemo(() => ({ top: 0, bottom: metrics.tabBarHeight }), []);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  return (
    <>
      <BarInsetsContext.Provider value={insets}>
        <TabBarPresentContext.Provider value={true}>
          {tabs.map((t) => (
            <TabContent key={t.props.id} id={t.props.id} selected={t.props.id === selected} rootChannel={rootChannel} parentLayer={parentLayer} selectedRef={selectedRef}>
              {t.props.children}
            </TabContent>
          ))}
        </TabBarPresentContext.Provider>
      </BarInsetsContext.Provider>
      <TabBar
        items={tabs.map((t) => ({
          id: t.props.id,
          label: t.props.label ?? (t.props.role === 'search' ? 'Search' : ''),
          icon: t.props.icon ?? (t.props.role === 'search' ? <MagnifyingGlassGlyph /> : null),
          badge: t.props.badge,
          role: t.props.role,
        }))}
        selected={selected}
        onSelect={select}
        minimizeBehavior={minimizeBehavior}
        channel={rootChannel}
        accessory={bottomAccessory}
        searchText={searchText}
        onSearchTextChange={onSearchTextChange}
        searchPrompt={searchPrompt}
      />
    </>
  );
}

function TabContent({
  id,
  selected,
  rootChannel,
  parentLayer,
  selectedRef,
  children,
}: {
  id: string;
  selected: boolean;
  rootChannel: ScrollChannel;
  parentLayer: ReturnType<typeof useLayerContext>;
  selectedRef: React.RefObject<string>;
  children?: ReactNode;
}) {
  const channel = useMemo(() => new ScrollChannel(rootChannel, () => selectedRef.current === id), [rootChannel, id, selectedRef]);
  const layerValue = useMemo(() => ({ ...parentLayer, visible: parentLayer.visible && selected }), [parentLayer, selected]);
  return (
    <LayerContext.Provider value={layerValue}>
      <ScrollChannelContext.Provider value={channel}>{children}</ScrollChannelContext.Provider>
    </LayerContext.Provider>
  );
}

export interface TabBarItem {
  id: string;
  label: string;
  icon: ReactNode;
  badge?: string | number;
  role?: TabRole;
}

export interface TabBarProps {
  items: TabBarItem[];
  selected: string;
  onSelect(id: string): void;
  minimizeBehavior?: 'never' | 'onScrollDown';
  /** Scroll activity that drives minimizing. */
  channel?: ScrollChannel;
  accessory?: ReactNode;
  searchText?: string;
  onSearchTextChange?(text: string): void;
  searchPrompt?: string;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const inflate = (r: Rect, g: number): Rect => ({ x: r.x - g, y: r.y - g, width: r.width + 2 * g, height: r.height + 2 * g });
const inside = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height;
/** Search field text inset (TX: placeholder at field x + 40.67, magnifier at + 12). */
const FIELD_TEXT_X = 40.667;
const FIELD_GLYPH_X = 12;
/** Native iOS 27 item colours, light / dark (demo-audit/tabbar §4; the reference's Vibrant tones land near them). */
const TAB_COLORS = { selected: ['#0080F5', '#0697FF'], unselected: ['#0E0D0F', '#F9F9F9'] } as const;
/** Aux content box: fits the pressed circle (62 + 2·8, plus overshoot). */
const AUX_BOX = 84;

export function TabBar({
  items: allItems,
  selected,
  onSelect,
  minimizeBehavior = 'never',
  channel,
  accessory,
  searchText,
  onSearchTextChange,
  searchPrompt = 'Search',
}: TabBarProps) {
  const ctx = useLiquid();
  const { viewport, renderer } = ctx;
  const auxItem = allItems.find((t) => t.role === 'search' || t.role === 'prominent');
  const items = useMemo(() => allItems.filter((t) => t !== auxItem), [allItems, auxItem]);
  const n = items.length;
  const hasAccessory = accessory !== undefined && accessory !== null && accessory !== false;
  // Label widths (Medium 10) measured in the DOM, rounded up to device pixels.
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [labelW, setLabelW] = useState<number[]>([]);
  const measure = useCallback(() => {
    const el = measureRef.current;
    if (!el) return;
    const dpr = window.devicePixelRatio || 1;
    const w = Array.from(el.children, (c) => Math.ceil(c.getBoundingClientRect().width * dpr - 1e-6) / dpr);
    setLabelW((s) => (s.length === w.length && s.every((v, i) => Math.abs(v - w[i]!) < 1e-3) ? s : w));
  }, []);
  useLayoutEffect(measure);
  useEffect(() => {
    void document.fonts?.ready.then(measure);
  }, [measure]);
  const layout = useMemo(
    () => tabBarLayout(items.map((_, i) => labelW[i] ?? 0), viewport.width, viewport.height, { aux: !!auxItem, accessory: hasAccessory }),
    [items, labelW, viewport.width, viewport.height, auxItem, hasAccessory],
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const auxSelected = !!auxItem && auxItem.id === selected;
  const searchActive = auxSelected && auxItem?.role === 'search';
  // The lens stays on the last platter tab while the aux tab is selected; search exits back to it.
  const lastPlatter = useRef(items[0]?.id ?? '');
  const platterIdx = items.findIndex((t) => t.id === selected);
  if (platterIdx >= 0) lastPlatter.current = selected;
  const selIndex = Math.max(0, platterIdx >= 0 ? platterIdx : items.findIndex((t) => t.id === lastPlatter.current));
  const engine = useRef<TabLens | null>(null);
  engine.current ??= new TabLens(layout.buttons, layout.platter.width, selIndex);
  engine.current.buttons = layout.buttons;
  engine.current.width = layout.platter.width;
  const unselRef = useRef<Layer | null>(null);
  const selCopyRef = useRef<Layer | null>(null);
  const miniRef = useRef<Layer | null>(null);
  const badgeRef = useRef<Layer | null>(null);
  const auxRef = useRef<Layer | null>(null);
  const fieldRef = useRef<Layer | null>(null);
  const closeRef = useRef<Layer | null>(null);
  const accRef = useRef<Layer | null>(null);
  const auxFloodRef = useRef<SVGCircleElement | null>(null);
  const auxGlyphRef = useRef<HTMLDivElement | null>(null);
  const platter = useRef<GlassShape | null>(null);
  const lens = useRef<GlassShape | null>(null);
  const auxGlass = useRef<GlassShape | null>(null);
  const closeGlass = useRef<GlassShape | null>(null);
  const accGlass = useRef<GlassShape | null>(null);
  const selItemsRef = useRef<HTMLDivElement | null>(null);
  const platterFlex = useFlex();
  const [minimized, setMinimized] = useState(false);
  const minimizedRef = useRef(false);
  const searchRef = useRef(searchActive);
  searchRef.current = searchActive;
  const lastZoom = useRef(1);
  const lastAccW = useRef(0);
  const dark = ctx.appearance === 'dark';
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const z = zBands.tabBar;

  const minim = useSpring(0, springs.minimizeCollapse);
  const squeeze = useSpring(1, springs.scrollAwayTracking);
  const lensVis = useSpring(auxSelected ? 0 : 1, springs.tabLensDematerialize);
  const morph = useSpring(searchActive ? 1 : 0, TABX.searchMorph);
  const closeIn = useSpring(searchActive ? 1 : 0, TABX.searchMorph);
  const auxPress = useSpring(0, TABX.auxPress);
  const accX = useSpring(0, TABX.accessoryCollapseX);
  const accY = useSpring(0, TABX.accessoryCollapseY);

  // Glass shapes (written every frame below). One group: platter, aux circle, close button and accessory (TX).
  useLayoutEffect(() => {
    const g = `lq-tabbar-${Math.random().toString(36).slice(2)}`;
    const L = layoutRef.current;
    const common = { group: g, z, spacing: metrics.tabGlassSmoothness, interactive: true };
    platter.current = renderer.addGlass({ ...common, rect: L.platter, radius: L.platter.height / 2 });
    lens.current = renderer.addGlass({ group: `${g}-lens`, rect: L.platter, radius: metrics.tabButtonHeight / 2, style: 'lens', z: z + 2 });
    if (L.aux) auxGlass.current = renderer.addGlass({ ...common, rect: L.aux, radius: L.aux.height / 2 });
    if (L.aux) {
      closeGlass.current = renderer.addGlass({ ...common, rect: L.search.close, radius: L.search.close.height / 2 });
      closeGlass.current.visible = false;
    }
    if (L.accessory) accGlass.current = renderer.addGlass({ ...common, rect: L.accessory.full, radius: L.accessory.full.height / 2 });
    ctx.requestFrame();
    const shapes = [platter, lens, auxGlass, closeGlass, accGlass];
    return () => {
      for (const s of shapes) {
        s.current?.remove();
        s.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, !!layout.aux, !!layout.accessory]);

  /** Platter-local → canvas: squeeze about the group anchor, then the platter's flex. */
  const placement = () => {
    const L = layoutRef.current;
    const full = scaleRectAbout(L.platter, squeeze.value, L.squeezeAnchor);
    return { full, m: platterFlex.contentMatrix(full).translate(full.x, full.y).scale(squeeze.value) };
  };

  const apply = useCallback(() => {
    const L = layoutRef.current;
    const m = clamp01(minim.value);
    const s = clamp01(morph.value);
    const collapse = Math.max(m, s);
    const sqz = squeeze.value;
    const { full, m: place } = placement();
    const pr = lerpRect(full, L.minimized, collapse);
    const p = platter.current;
    if (p) {
      platterFlex.apply(p);
      p.rect = pr;
      p.radius = pr.height / 2;
    }
    const contentOpacity = Math.max(0, 1 - 2 * collapse);
    const lv = clamp01(lensVis.value);
    const eng = engine.current!;
    const f = eng.frame(performance.now() / 1000);
    if (f.moving) ctx.requestFrame();
    (window as { __lqTabLens?: unknown[] }).__lqTabLens?.push({ t: performance.now(), q: f.q, ...f.rect, ...f.flex, px: full.x, cs: L.buttons.map((b) => b.x + b.width / 2) }); // capture tools
    const q = f.q;
    // Lens rect in canvas pt (k: platter scale).
    const k = place.a;
    const o = place.transformPoint(new DOMPoint(f.rect.x, f.rect.y));
    const lr = { x: o.x, y: o.y, width: f.rect.width * k, height: f.rect.height * k };
    const lflex = { sx: f.flex.sx, sy: f.flex.sy, tx: f.flex.tx * k, ty: f.flex.ty * k };
    const shown = contentOpacity > 0.001 && lv > 0.001;
    const ln = lens.current;
    if (ln) {
      ln.rect = lr;
      ln.radius = lr.height / 2;
      ln.flex = lflex;
      ln.pressAmount = q;
      ln.pressed = q > 0.02;
      ln.opacity = lv;
      ln.visible = shown;
    }
    // At rest the badge sits above the pill; once the lens lifts it is portaled above the badge, so the badge shows
    // through the clear glass (≈10 % white face) and under the magnified tinted copy (demo-audit/tabbar press shots).
    if (badgeRef.current) badgeRef.current.z = q > 0.02 ? z + 1.5 : z + 6;
    for (const [l, op] of [
      [unselRef.current, contentOpacity],
      [selCopyRef.current, contentOpacity * lv],
      [badgeRef.current, contentOpacity],
    ] as const) {
      if (!l) continue;
      l.transform = place;
      l.opacity = op;
      l.visible = op > 0.001;
    }
    const sw = lr.width * lflex.sx;
    const sh = lr.height * lflex.sy;
    const hole = { x: lr.x + lr.width / 2 + lflex.tx - sw / 2, y: lr.y + lr.height / 2 + lflex.ty - sh / 2, width: sw, height: sh };
    if (unselRef.current) unselRef.current.cutout = lv > 0.999 ? hole : undefined;
    const H = (L.buttons[eng.index]?.height ?? metrics.tabButtonHeight) + 2 * LENS.lift;
    if (selCopyRef.current) {
      selCopyRef.current.lens = { rect: lr, flex: lflex, amount: (-H / 4) * q * k, height: 0.2 * H * q * k, rimHeight: LENS.rimHeight * k };
    }
    // Tinted items are magnified 1 + 0.16·q about their own centres.
    const zoom = 1 + LENS.contentScale * q;
    const its = selItemsRef.current?.children;
    if (its && Math.abs(zoom - lastZoom.current) > 1e-4) {
      lastZoom.current = zoom;
      const tf = zoom === 1 ? '' : `scale(${zoom.toFixed(4)})`;
      for (const it of Array.from(its)) (it as HTMLElement).style.transform = tf;
    }
    const mini = miniRef.current;
    if (mini) {
      mini.transform = new DOMMatrix().translate(pr.x, pr.y).scale(pr.width / L.minimized.width, pr.height / L.minimized.height);
      mini.opacity = collapse;
      mini.visible = collapse > 0.001;
    }

    // Aux circle: press growth (+8 per side), squeeze with the group, morph into the search field.
    if (L.aux) {
      const ap = auxPress.value;
      const base = lerpRect(scaleRectAbout(L.aux, sqz, L.squeezeAnchor), L.search.field, s);
      const ar = inflate(base, TABX.auxPressGrowth * Math.max(-1, ap) * (1 - s));
      const ag = auxGlass.current;
      if (ag) {
        ag.rect = ar;
        ag.radius = ar.height / 2; // no LittleGlow: the measured press is a uniform flood (TABX.auxPressedFill)
      }
      const al = auxRef.current;
      if (al) {
        // Content box centred on the circle; the glyph slides to the field's leading magnifier as it morphs.
        const cx = lerp(ar.x + ar.width / 2, ar.x + FIELD_GLYPH_X + 10.167, s);
        const cy = ar.y + ar.height / 2;
        al.transform = new DOMMatrix().translate(cx - AUX_BOX / 2, cy - AUX_BOX / 2);
        const pa = clamp01(ap) * (1 - s);
        const fc = auxFloodRef.current;
        if (fc) {
          fc.setAttribute('opacity', (pa * TABX.auxPressedFill[darkRef.current ? 'dark' : 'light']).toFixed(3));
          fc.setAttribute('r', Math.min(AUX_BOX, ar.width) / 2 + '');
        }
        if (auxGlyphRef.current) auxGlyphRef.current.style.opacity = (1 - pa * (1 - TABX.auxPressedGlyph[darkRef.current ? 'dark' : 'light'])).toFixed(3);
      }
      const fl = fieldRef.current;
      if (fl) {
        fl.transform = new DOMMatrix().translate(ar.x + FIELD_TEXT_X, ar.y);
        const fo = clamp01(2 * s - 1);
        fl.opacity = fo;
        fl.visible = fo > 0.001;
      }
      const ci = clamp01(closeIn.value);
      const cg = closeGlass.current;
      const cr = scaleRect(L.search.close, 0.6 + 0.4 * ci);
      if (cg) {
        cg.rect = cr;
        cg.radius = cr.height / 2;
        cg.opacity = ci;
        cg.visible = ci > 0.001;
      }
      const cl = closeRef.current;
      if (cl) {
        cl.transform = new DOMMatrix().translate(cr.x, cr.y).scale(cr.width / L.search.close.width);
        cl.opacity = ci;
        cl.visible = ci > 0.001;
      }
    }

    // Accessory: squeezes with the group, collapses beside the tab button (x/width and y on separate springs).
    if (L.accessory) {
      const af = scaleRectAbout(L.accessory.full, sqz, L.squeezeAnchor);
      const am = L.accessory.minimized;
      const tx = accX.value;
      const ty = accY.value;
      const r = { x: lerp(af.x, am.x, tx), y: lerp(af.y, am.y, ty), width: lerp(af.width, am.width, tx), height: lerp(af.height, am.height, ty) };
      const o = 1 - s;
      const g = accGlass.current;
      if (g) {
        g.rect = r;
        g.radius = r.height / 2;
        g.opacity = o;
        g.visible = o > 0.001;
      }
      const l = accRef.current;
      if (l) {
        const k = r.height / am.height;
        const w = r.width / k;
        if (Math.abs(w - lastAccW.current) > 0.01) {
          lastAccW.current = w;
          l.element.style.width = `${w}px`;
        }
        l.transform = new DOMMatrix().translate(r.x, r.y).scale(k);
        l.opacity = o;
        l.visible = o > 0.001;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minim, morph, squeeze, platterFlex, lensVis, auxPress, closeIn, accX, accY]);

  useEffect(() => ctx.onBeforeFrame(apply), [ctx, apply]);
  useEffect(() => {
    lastAccW.current = 0;
    apply();
    ctx.requestFrame();
  }, [apply, ctx, layout]);

  // Selection changes (release, tap, keyboard, programmatic): the lens settles there.
  useEffect(() => {
    engine.current!.select(selIndex, performance.now() / 1000);
    ctx.requestFrame();
  }, [selIndex, ctx]);

  // Aux selection: the lens fades (TX video/prominent_press); search morphs, then the close button appears.
  useEffect(() => {
    lensVis.set(auxSelected ? 0 : 1, { params: springs.tabLensDematerialize });
    morph.set(searchActive ? 1 : 0, { params: TABX.searchMorph });
    if (!searchActive) {
      closeIn.set(0, { params: TABX.searchMorph });
      return;
    }
    const t = setTimeout(() => closeIn.set(1, { params: TABX.searchMorph }), TABX.closeDelay * 1000);
    return () => clearTimeout(t);
  }, [auxSelected, searchActive, lensVis, morph, closeIn]);

  const exitSearch = useCallback(() => {
    if (lastPlatter.current) onSelect(lastPlatter.current);
  }, [onSelect]);

  // Press / drag the lens (logic/tablens.ts); the platter lifts and stretches with the regular flex.
  useEffect(() => {
    const el = unselRef.current?.element;
    if (!el) return;
    const now = () => performance.now() / 1000;
    const localX = (clientX: number) => placement().m.inverse().transformPoint(new DOMPoint(clientX, 0)).x;
    const move = (e: PointerEvent) => {
      engine.current!.move(localX(e.clientX), now());
      platterFlex.move(e.clientX, e.clientY);
      ctx.requestFrame();
    };
    const finish = (cancelled: boolean) => {
      const to = engine.current!.up(now(), cancelled);
      platterFlex.release();
      ctx.requestFrame();
      if (items[to] && items[to]!.id !== selected) onSelect(items[to]!.id);
    };
    const rec = {
      decide(s: { dx: number; dy: number; event: PointerEvent }) {
        move(s.event);
        return Math.hypot(s.dx, s.dy) >= 10 ? ('claim' as const) : ('wait' as const);
      },
      onMove: (s: { event: PointerEvent }) => move(s.event),
      onEnd: (_: unknown, cancelled: boolean) => finish(cancelled),
      onTap: () => finish(false),
      onCancel: () => finish(true),
    };
    const onDown = (e: PointerEvent) => {
      if (minimizedRef.current || searchRef.current) return;
      if (!engine.current!.down(localX(e.clientX), now())) return;
      ctx.gestures.track(e, rec);
      platterFlex.begin(e, placement().full);
      ctx.requestFrame();
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.gestures, items, selected, onSelect, unselRef.current]);

  // Press the aux circle: grow 62 → 78 with a white flood; selects on release inside (TX rec/prominent_press).
  useEffect(() => {
    const el = auxRef.current?.element;
    if (!el || !auxItem) return;
    const release = () => {
      auxPress.set(0, { params: TABX.auxRelease });
    };
    const finish = ({ event: e }: { event: PointerEvent }) => {
      const L = layoutRef.current;
      release();
      if (L.aux && inside(inflate(L.aux, TABX.auxPressGrowth), e.clientX, e.clientY) && auxItem.id !== selected) onSelect(auxItem.id);
    };
    const rec = {
      decide(s: { dx: number; dy: number }) {
        return Math.hypot(s.dx, s.dy) >= 10 ? ('claim' as const) : ('wait' as const);
      },
      onEnd: finish,
      onTap: finish,
      onCancel: release,
      keepClick: () => false,
    };
    const onDown = (e: PointerEvent) => {
      if (searchRef.current) return;
      ctx.gestures.track(e, rec);
      auxPress.set(1, { params: TABX.auxPress });
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.gestures, auxItem, selected, onSelect, auxRef.current]);

  // Minimize on scroll. Accessory: x/width (0.72, 0.36), y (0.76, 0.42) 35 ms later (TX).
  const accTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const collapse = useCallback(() => {
    if (minimizedRef.current) return;
    minimizedRef.current = true;
    setMinimized(true);
    minim.set(1, { params: springs.minimizeCollapse });
    squeeze.set(1, { params: springs.scrollAwayHintReset });
    accX.set(1, { params: TABX.accessoryCollapseX });
    clearTimeout(accTimer.current);
    accTimer.current = setTimeout(() => accY.set(1, { params: TABX.accessoryCollapseY }), TABX.accessoryCollapseYDelay * 1000);
  }, [minim, squeeze, accX, accY]);
  const expand = useCallback(() => {
    if (!minimizedRef.current) return;
    minimizedRef.current = false;
    setMinimized(false);
    minim.set(0, { params: springs.minimizeExpand });
    clearTimeout(accTimer.current);
    accX.set(0, { params: springs.minimizeExpand });
    accY.set(0, { params: springs.minimizeExpand });
  }, [minim, accX, accY]);
  useEffect(() => () => clearTimeout(accTimer.current), []);
  useEffect(() => {
    if (minimizeBehavior !== 'onScrollDown' || !channel) return;
    let down = 0;
    let wasTracking = false;
    return channel.subscribe((e) => {
      if (e.tracking && !searchRef.current) {
        if (e.delta > 0) down += e.delta;
        else if (e.delta < 0) down = Math.max(0, down + e.delta);
        if (!minimizedRef.current) {
          squeeze.set(minimizeSqueeze(down), { params: springs.scrollAwayTracking });
          if (down >= MINIMIZE.collapseAt) collapse();
        }
      } else if (wasTracking) {
        down = 0;
        if (!minimizedRef.current && squeeze.target !== 1) squeeze.set(1, { params: springs.scrollAwayHintReset });
      }
      wasTracking = e.tracking;
    });
  }, [minimizeBehavior, channel, squeeze, collapse]);

  const pw = layout.platter.width;
  const ph = layout.platter.height;
  const itemsMarkup = (selectedCopy: boolean, badgesOnly = false) =>
    items.map((t, i) => {
      const b = layout.buttons[i]!;
      const isSel = t.id === selected;
      const style = {
        position: 'absolute' as const,
        left: b.x,
        top: b.y,
        width: b.width,
        height: b.height,
        display: 'flex',
        flexDirection: 'column' as const,
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 6,
        boxSizing: 'border-box' as const,
        color: TAB_COLORS[selectedCopy ? 'selected' : 'unselected'][dark ? 1 : 0],
        fontSize: componentType.tabLabel.size,
        fontWeight: selectedCopy ? componentType.tabLabel.selectedWeight : componentType.tabLabel.weight,
        lineHeight: '12px',
        letterSpacing: 0.1,
      };
      const inner = (
        <>
          <span style={{ height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <span style={{ display: 'contents', visibility: badgesOnly ? 'hidden' : undefined }}>{t.icon}</span>
            {t.badge !== undefined && badgesOnly && (
              <span
                style={{
                  position: 'absolute',
                  left: '100%',
                  top: -4,
                  marginLeft: -5,
                  minWidth: 18.33,
                  height: 18.33,
                  borderRadius: 9.17,
                  padding: '0 4px',
                  boxSizing: 'border-box',
                  background: 'var(--lq-bar-badge)',
                  color: '#fff',
                  fontSize: 12,
                  fontWeight: 510,
                  lineHeight: '18.33px',
                  textAlign: 'center',
                }}
              >
                {t.badge}
              </span>
            )}
          </span>
          <span style={{ marginTop: 1, whiteSpace: 'nowrap', visibility: badgesOnly ? 'hidden' : undefined }}>{t.label}</span>
        </>
      );
      return selectedCopy || badgesOnly ? (
        <div key={t.id} style={style}>
          {inner}
        </div>
      ) : (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={isSel}
          aria-label={t.label}
          tabIndex={isSel || (auxSelected && i === selIndex) ? 0 : -1}
          onClick={() => onSelect(t.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
              const j = (i + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
              onSelect(items[j]!.id);
              (e.currentTarget.parentElement?.children[j] as HTMLElement | undefined)?.focus();
            }
          }}
          style={style}
        >
          {inner}
        </button>
      );
    });

  const collapsed = minimized || searchActive;
  // Minimized: the selected tab's glyph in tint; search: the tab search returns to, in the label colour (TX).
  const miniItem = searchActive ? items[selIndex] : (allItems.find((t) => t.id === selected) ?? items[selIndex]);
  const circle = { width: '100%', height: '100%', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' } as const;
  return (
    <>
      <LayerView
        ref={(l) => {
          unselRef.current = l;
        }}
        z={z + 1}
        width={pw}
        height={ph}
        visible={!collapsed}
        role="tablist"
        aria-label="Tabs"
        className="lq-tabbar"
      >
        {/* Hit area under the lens hole, so pressing the selected tab reaches the bar. */}
        <div style={{ position: 'absolute', inset: 0, borderRadius: ph / 2 }} />
        {itemsMarkup(false)}
        <div ref={measureRef} aria-hidden style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', fontSize: componentType.tabLabel.size, fontWeight: componentType.tabLabel.weight, letterSpacing: 0.1 }}>
          {items.map((t) => (
            <span key={t.id} style={{ position: 'absolute' }}>
              {t.label}
            </span>
          ))}
        </div>
      </LayerView>
      <LayerView
        ref={(l) => {
          selCopyRef.current = l;
        }}
        z={z + 5}
        width={pw}
        height={ph}
        visible={!collapsed}
        aria-hidden="true"
      >
        <div ref={selItemsRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {itemsMarkup(true)}
        </div>
      </LayerView>
      {/* Badges: above the resting pill, under the lifted lens (z switched in apply). */}
      <LayerView
        ref={(l) => {
          badgeRef.current = l;
        }}
        z={z + 6}
        width={pw}
        height={ph}
        visible={!collapsed}
        aria-hidden="true"
      >
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>{itemsMarkup(false, true)}</div>
      </LayerView>
      <LayerView
        ref={(l) => {
          miniRef.current = l;
        }}
        z={z + 4}
        width={layout.minimized.width}
        height={layout.minimized.height}
        visible={collapsed}
      >
        <button
          type="button"
          aria-label={searchActive ? `${miniItem?.label ?? ''}, close search` : miniItem ? `${miniItem.label}, show tab bar` : 'Show tab bar'}
          onClick={searchActive ? exitSearch : expand}
          style={{ ...circle, color: searchActive ? 'var(--lq-label)' : 'var(--lq-tint)' }}
        >
          {miniItem?.icon}
        </button>
      </LayerView>
      {auxItem && layout.aux && (
        <LayerView
          ref={(l) => {
            auxRef.current = l;
          }}
          z={z + 1}
          width={AUX_BOX}
          height={AUX_BOX}
          visible={true}
        >
          <svg width={AUX_BOX} height={AUX_BOX} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
            <circle ref={auxFloodRef} cx={AUX_BOX / 2} cy={AUX_BOX / 2} r={31} fill="#fff" opacity={0} />
          </svg>
          <button
            type="button"
            role="tab"
            aria-selected={auxSelected}
            aria-label={auxItem.label}
            disabled={searchActive}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelect(auxItem.id);
            }}
            style={{ ...circle, position: 'absolute', left: (AUX_BOX - 62) / 2, top: (AUX_BOX - 62) / 2, width: 62, height: 62, color: auxSelected && !searchActive ? 'var(--lq-tint)' : 'var(--lq-label)' }}
          >
            <div ref={auxGlyphRef} style={{ display: 'flex' }}>
              {auxItem.icon}
            </div>
          </button>
        </LayerView>
      )}
      {auxItem?.role === 'search' && layout.aux && (
        <>
          <LayerView
            ref={(l) => {
              fieldRef.current = l;
            }}
            z={z + 1}
            width={layout.search.field.width - FIELD_TEXT_X - 12}
            height={layout.search.field.height}
            visible={searchActive}
          >
            <input
              type="search"
              value={searchText}
              onChange={(e) => onSearchTextChange?.(e.target.value)}
              placeholder={searchPrompt}
              aria-label={searchPrompt}
              className="lq-tab-search-input"
              tabIndex={searchActive ? 0 : -1}
              style={{
                width: '100%',
                height: '100%',
                border: 0,
                padding: 0,
                margin: 0,
                background: 'transparent',
                outline: 'none',
                font: 'inherit',
                fontSize: 17,
                fontWeight: 510, // TX: .SFUI-Medium 17
                color: 'var(--lq-label)',
                caretColor: 'var(--lq-tint)',
              }}
            />
            <style>{`.lq-tab-search-input::placeholder{color:var(--lq-secondary-label);opacity:1}.lq-tab-search-input::-webkit-search-cancel-button{display:none}`}</style>
          </LayerView>
          <LayerView
            ref={(l) => {
              closeRef.current = l;
            }}
            z={z + 1}
            width={layout.search.close.width}
            height={layout.search.close.height}
            visible={searchActive}
          >
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                onSearchTextChange?.('');
                exitSearch();
              }}
              style={{ ...circle, color: 'var(--lq-label)' }}
            >
              <XMarkGlyph />
            </button>
          </LayerView>
        </>
      )}
      {layout.accessory && (
        <LayerView
          ref={(l) => {
            accRef.current = l;
          }}
          z={z + 1}
          width={layout.accessory.full.width}
          height={layout.accessory.full.height}
          visible={true}
          className="lq-tab-accessory"
        >
          <div style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '0 16px', boxSizing: 'border-box', color: 'var(--lq-label)', overflow: 'hidden' }}>
            {accessory}
          </div>
        </LayerView>
      )}
    </>
  );
}

export type { Rect };
