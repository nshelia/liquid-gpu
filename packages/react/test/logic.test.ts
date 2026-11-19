import { describe, expect, it } from 'vitest';
import { metrics, popThreshold } from '@liquid-gpu/core';
import { classifyWheel, indicatorGeometry, ScrollChannel, splitOffset, wheelDeltaPixels } from '../src/logic/scroll';
import { largeTitleCollapse, navBarHeight, popGestureDecision, popPercent, scrollEdgeHeight, stackTransforms } from '../src/logic/nav';
import { swipeButtonWidth, swipeDecision, swipeDragOffset, swipeOpenThreshold } from '../src/logic/list';
import { minimizeSqueeze, scaleRect, tabBarLayout } from '../src/logic/tabbar';
import { LensFlex, TabLens } from '../src/logic/tablens';
import {
  constrainSheetTop,
  detentTop,
  sheetDimming,
  sheetExpansion,
  sheetOpaque,
  sheetScale,
  sheetTopRadius,
  sheetVisualOffset,
} from '../src/logic/sheet';
import { affineScale, multiply, transformRect, translation } from '../src/root/geometry';
import { GestureArena } from '../src/root/gestures';

describe('scroll logic', () => {
  it('splits offsets into native scroll and rubber band', () => {
    expect(splitOffset(-30, 500)).toEqual({ native: 0, over: -30 });
    expect(splitOffset(200, 500)).toEqual({ native: 200, over: 0 });
    expect(splitOffset(540, 500)).toEqual({ native: 500, over: 40 });
  });
  it('indicator sits inside the insets, 3 pt from the edges (SMG §5) and shrinks when rubber-banding', () => {
    const top = indicatorGeometry(0, 2000, 956, 116, 34);
    expect(top.pos).toBeCloseTo(116 + 3);
    const end = indicatorGeometry(1044, 2000, 956, 116, 34);
    expect(end.pos + end.length).toBeCloseTo(956 - 34 - 3);
    const banded = indicatorGeometry(-40, 2000, 956, 116, 34);
    expect(banded.length).toBeLessThan(top.length);
    expect(indicatorGeometry(0, 500, 956, 0, 0).visible).toBe(false);
  });
  it('classifies wheel input', () => {
    expect(classifyWheel(1, 3)).toBe('discrete');
    expect(classifyWheel(0, 100)).toBe('discrete');
    expect(classifyWheel(0, 4.5)).toBe('pixel');
    expect(classifyWheel(0, 12)).toBe('pixel');
    expect(wheelDeltaPixels(1, 3, 900)).toBe(120);
  });
  it('channels forward only while allowed', () => {
    const root = new ScrollChannel();
    let allow = true;
    const child = new ScrollChannel(root, () => allow);
    const seen: number[] = [];
    root.subscribe((e) => seen.push(e.offset));
    child.publish({ offset: 5, delta: 5, tracking: true, max: 100 });
    allow = false;
    child.publish({ offset: 6, delta: 1, tracking: true, max: 100 });
    expect(seen).toEqual([5]);
  });
});

describe('navigation logic', () => {
  it('push/pop geometry: parallax −0.3·W and 10 % dimming (TR §1)', () => {
    expect(stackTransforms(1, 440)).toEqual({ topX: 0, belowX: -132, belowDim: 0.1 });
    expect(stackTransforms(0, 440).topX).toBe(440);
    expect(stackTransforms(0.5, 440).belowDim).toBeCloseTo(0.05);
  });
  it('rubber-bands over-drag past the start with range 0.5 (TR §2)', () => {
    expect(popPercent(220, 440)).toBeCloseTo(0.5);
    const over = popPercent(-200, 440);
    expect(over).toBeLessThan(0);
    expect(over).toBeGreaterThan(-0.5);
  });
  it('recognizes edge (15 pt) and full-width (10 pt) back swipes', () => {
    expect(popGestureDecision(14, 0, 10, true)).toBe('wait');
    expect(popGestureDecision(15, 2, 10, true)).toBe('claim');
    expect(popGestureDecision(10, 0, 200, true)).toBe('claim');
    expect(popGestureDecision(10, 0, 200, false)).toBe('fail');
    expect(popGestureDecision(2, 12, 200, true)).toBe('fail');
    expect(popGestureDecision(-12, 0, 200, true)).toBe('fail');
    expect(popThreshold(440)).toBeCloseTo(0.4261, 4);
  });
  it('bar heights and the large-title collapse (BR §1.1, TR §6)', () => {
    expect(navBarHeight(62, false)).toBe(116);
    expect(navBarHeight(62, true)).toBe(168);
    expect(scrollEdgeHeight(62)).toBe(156);
    expect(largeTitleCollapse(26)).toBeCloseTo(0.5);
    expect(largeTitleCollapse(60)).toBe(1);
  });
});

describe('swipe actions', () => {
  it('open threshold for Delete + More is −156.67 (LS §1.7)', () => {
    expect(swipeButtonWidth(39.33)).toBeCloseTo(63.33);
    expect(swipeButtonWidth(20)).toBe(60);
    expect(swipeOpenThreshold([63.33, 63.33], 'trailing')).toBeCloseTo(-156.66, 1);
    expect(swipeOpenThreshold([60], 'leading')).toBe(80);
  });
  it('drag offset: 25 pt hysteresis, clamped sides, rubber band past the row', () => {
    expect(swipeDragOffset(0, -40, -26, 400, false, true)).toBeCloseTo(-15);
    expect(swipeDragOffset(0, 60, 26, 400, false, true)).toBe(0);
    expect(swipeDragOffset(-156, -10, 0, 400, false, true)).toBe(-166);
    const far = swipeDragOffset(0, -600, -26, 400, false, true);
    expect(far).toBeLessThan(-400);
    expect(far).toBeGreaterThan(-460);
  });
  it('decides between swipe, scroll and back swipe', () => {
    expect(swipeDecision(-20, 2, 300, false, false, true)).toBe('wait');
    expect(swipeDecision(-25, 2, 300, false, false, true)).toBe('claim');
    expect(swipeDecision(12, 1, 300, false, false, true)).toBe('fail'); // no leading actions → let the pop take it
    expect(swipeDecision(30, 1, 20, false, true, true)).toBe('fail'); // edge region belongs to the pop
    expect(swipeDecision(2, 15, 300, false, true, true)).toBe('fail');
    expect(swipeDecision(12, 0, 300, true, false, true)).toBe('claim');
  });
});

describe('tab bar', () => {
  const short = (n: number) => Array.from({ length: n }, () => 26);
  it('matches the measured platter and button frames (BR §3.2)', () => {
    const l3 = tabBarLayout(short(3), 440, 956);
    expect(l3.platter).toEqual({ x: 83, y: 873, width: 274, height: 62 });
    expect(l3.buttons[1]).toEqual({ x: 90, y: 4, width: 94, height: 54 });
    const l2 = tabBarLayout(short(2), 440, 956);
    expect(l2.platter.x).toBe(126);
    expect(l2.platter.width).toBe(188);
    const l4 = tabBarLayout(short(4), 440, 956);
    expect(l4.platter).toEqual({ x: 21, y: 873, width: 398, height: 62 });
    expect(l4.buttons[3]!.x + l4.buttons[3]!.width).toBeCloseTo(394, 0);
    expect(l3.minimized).toEqual({ x: 28, y: 880, width: 48, height: 48 });
  });
  it('sizes the platter to long labels', () => {
    const l = tabBarLayout([80, 50, 70], 440, 956);
    expect(l.platter.width).toBe(48 + 64 + 3 * 80);
    expect(l.buttons[0]!.width).toBe(120);
    expect(tabBarLayout([200, 200, 200], 440, 956).platter.width).toBe(398);
  });
  it('minimize squeeze reaches 0.959 at 60 pt (TR §5)', () => {
    expect(minimizeSqueeze(0)).toBe(1);
    expect(minimizeSqueeze(10)).toBeCloseTo(0.992, 2);
    expect(minimizeSqueeze(60)).toBeCloseTo(0.959);
    expect(Math.abs(minimizeSqueeze(48) - 0.962)).toBeLessThan(0.006);
    expect(scaleRect({ x: 0, y: 0, width: 100, height: 50 }, 0.5)).toEqual({ x: 25, y: 12.5, width: 50, height: 25 });
  });
  it('lens: lifts on press, follows the finger anchor-relative, settles and drops after the gate', () => {
    const l = tabBarLayout(short(3), 440, 956);
    const lens = new TabLens(l.buttons, l.platter.width, 0);
    expect(lens.down(30, 0)).toBe(true); // anchor (30 − 4) / 94
    let f = lens.frame(0.5);
    expect(f.q).toBeCloseTo(1, 2);
    expect(f.rect.width).toBeCloseTo(110, 1);
    lens.move(130, 0.5);
    f = lens.frame(1.5);
    expect(f.rect.x + f.rect.width / 2).toBeCloseTo(130 - 26 + 47, 1);
    expect(lens.up(1.5)).toBe(1);
    lens.select(1, 1.5);
    expect(lens.frame(1.6).q).toBeCloseTo(1, 1); // still lifted while settling
    f = lens.frame(4);
    expect(f.active).toBe(false);
    expect(f.rect.x).toBeCloseTo(90, 3);
    expect(f.rect.width).toBe(94);
  });
  it('lens flex stretches while accelerating and narrows while braking', () => {
    const fl = new LensFlex([110, 70]);
    fl.down();
    let wide = 0;
    let narrow = 2;
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      const x = 100 * (t < 0.25 ? 8 * t * t : 1 - 8 * Math.max(0, 0.5 - t) ** 2);
      const p = fl.frame(t, [x, 31]);
      if (t < 0.25) wide = Math.max(wide, p.sx);
      else narrow = Math.min(narrow, p.sx);
    }
    expect(wide).toBeGreaterThan(1.02);
    expect(narrow).toBeLessThan(0.98);
  });
});

describe('sheet', () => {
  it('detents and medium geometry (TR §3a)', () => {
    expect(detentTop('large', 956, 62)).toBe(62);
    expect(detentTop('medium', 956, 62)).toBeCloseTo(440.4);
    expect(sheetScale(0)).toBeCloseTo(metrics.sheetMediumScale);
    expect(sheetScale(1)).toBe(1);
    expect(sheetTopRadius(0)).toBe(38);
    expect(sheetTopRadius(1)).toBe(38);
    expect(440.4 + sheetVisualOffset(sheetScale(0))).toBeCloseTo(451.08, 1);
    expect(sheetExpansion(251.2, 440.4, 62)).toBeCloseTo(0.5);
  });
  it('no travel above the largest detent, 200 pt rubber band below (SH §2)', () => {
    expect(constrainSheetTop(10, 62, 956)).toBe(62);
    expect(constrainSheetTop(500, 62, 956)).toBe(500);
    const below = constrainSheetTop(1300, 62, 956);
    expect(below).toBeGreaterThan(956);
    expect(below).toBeLessThan(956 + 200);
  });
  it('glass at medium, opaque past the midpoint (SH §4); dimming (SH §5)', () => {
    expect(sheetOpaque(440.4, 440.4, 62)).toBe(false);
    expect(sheetOpaque(250, 440.4, 62)).toBe(true);
    expect(sheetOpaque(440, null, 62)).toBe(true);
    expect(sheetDimming(440.4, 956, 62, 440.4, 440.4, false)).toBe(1);
    expect(sheetDimming(440.4, 956, 62, 440.4, 440.4, true)).toBe(0);
    expect(sheetDimming(62, 956, 62, 440.4, 440.4, true)).toBe(1);
    expect(sheetDimming(956, 956, 62, 440.4, 440.4, false)).toBe(0);
  });
});

describe('geometry', () => {
  it('maps rects through affine transforms', () => {
    const m = multiply(translation(100, 50), { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
    expect(transformRect(m, { x: 10, y: 10, width: 20, height: 10 })).toEqual({ x: 120, y: 70, width: 40, height: 20 });
    expect(affineScale(m)).toBe(2);
  });
});

describe('gesture arena', () => {
  it('inner candidates must fail before outer ones claim; taps reach undecided candidates', () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    (globalThis as unknown as { window: unknown }).window = {
      addEventListener: (t: string, f: (e: unknown) => void) => (listeners[t] = f),
      removeEventListener: () => {},
    };
    const arena = new GestureArena();
    const log: string[] = [];
    const inner = { decide: (s: { dx: number; dy: number }) => (Math.abs(s.dy) >= 10 ? ('fail' as const) : Math.abs(s.dx) >= 25 ? ('claim' as const) : ('wait' as const)), onBegin: () => log.push('inner'), onCancel: () => log.push('inner-cancel') };
    const outer = { decide: (s: { dy: number }) => (Math.abs(s.dy) >= 10 ? ('claim' as const) : ('wait' as const)), onBegin: () => log.push('outer'), onTap: () => log.push('outer-tap') };
    const ev = (type: string, x: number, y: number, t: number) => ({ type, pointerId: 1, clientX: x, clientY: y, timeStamp: t, pointerType: 'touch', button: 0 }) as unknown as PointerEvent;
    const down = ev('pointerdown', 100, 100, 0);
    arena.track(down, inner);
    arena.track(down, outer);
    listeners.pointermove!(ev('pointermove', 100, 105, 10));
    expect(log).toEqual([]);
    listeners.pointermove!(ev('pointermove', 101, 115, 20));
    expect(log).toEqual(['inner-cancel', 'outer']);
    listeners.pointerup!(ev('pointerup', 101, 115, 30));
    // tap
    const d2 = ev('pointerdown', 10, 10, 100);
    arena.track(d2, outer);
    listeners.pointerup!(ev('pointerup', 10, 10, 110));
    expect(log).toContain('outer-tap');
  });
});
