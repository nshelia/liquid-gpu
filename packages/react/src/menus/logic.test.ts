import { describe, expect, it } from 'vitest';
import {
  liftedRect,
  menuListHeight,
  menuRowAt,
  menuRowFrames,
  morphBlur,
  morphShape,
  placeButtonMenu,
  placeContextMenu,
  popGeometry,
  popKeyframes,
  preLiftScale,
  previewSize,
} from './logic';

describe('menu list layout (text_overlays §10.1)', () => {
  it('3 rows → 146 pt', () => {
    expect(menuListHeight([[{}, {}, {}]])).toBe(146);
  });
  it('sections add a 21 pt gap; subtitles 60', () => {
    expect(menuListHeight([[{}, {}], [{ subtitle: true }]])).toBe(20 + 84 + 21 + 60);
  });
  it('row frames and hit test', () => {
    const f = menuRowFrames([[{}, {}], [{}]]);
    expect(f.map((r) => r.y)).toEqual([10, 52, 115]);
    expect(menuRowAt(f, 60)).toBe(1);
    expect(menuRowAt(f, 100)).toBe(-1);
    expect(menuRowAt(f, 120)).toBe(2);
  });
});

describe('placement', () => {
  it('button menu: 250 wide, centred on the button, top at the button top', () => {
    const r = placeButtonMenu({ x: 160, y: 300, width: 120, height: 34 }, 146, { width: 440, height: 956 });
    expect(r).toEqual({ x: 95, y: 300, width: 250, height: 146 });
  });
  it('controls.md §1.8 capture: button [178, 300, 84] → menu x 95 (centred)', () => {
    expect(placeButtonMenu({ x: 178, y: 300, width: 84, height: 34.33 }, 146, { width: 440, height: 956 }).x).toBe(95);
  });
  it('text_overlays §10.1 capture: button [40, 200, 100] → menu x 40 (leading-aligned)', () => {
    expect(placeButtonMenu({ x: 40, y: 200, width: 100, height: 44 }, 416, { width: 440, height: 956 }).x).toBe(40);
  });
  it('trailing button aligns trailing edges; kept inside the 8 pt insets', () => {
    const r = placeButtonMenu({ x: 380, y: 900, width: 44, height: 44 }, 146, { width: 440, height: 956 });
    expect(r.x).toBe(424 - 250);
    expect(r.y + r.height).toBe(956 - 8);
  });
  it('context menu: lift scale min(1.15, (w+26)/w): 200×120 → 226×135.67, menu 20 below', () => {
    const p = liftedRect({ x: 120, y: 200, width: 200, height: 120 });
    expect(p.width).toBeCloseTo(226, 6);
    expect(p.height).toBeCloseTo(135.6, 1);
    const placed = placeContextMenu(p, 146, { width: 440, height: 956 });
    expect(placed.menu.y).toBeCloseTo(p.y + p.height + 20, 6);
    expect(placed.menu.x).toBe(95); // centred under a centred preview (TO §10.2)
  });
  it('pushes the preview up when there is no room below', () => {
    const p = { x: 20, y: 700, width: 400, height: 225.67 };
    const placed = placeContextMenu(p, 188, { width: 440, height: 956, safeTop: 62, safeBottom: 34 });
    expect(placed.preview.y).toBeLessThan(700);
    expect(placed.menu.y + placed.menu.height).toBeLessThanOrEqual(956 - 34 - 8 + 1e-9);
  });
  it('native Photos long press: square preview held up by the bottom limit (photos-p2.mp4 @60 s)', () => {
    // Cell (147.33, 430.67, 145.33²); the 400 × 400 preview starts centred on it; menu with the accessory row.
    const src = { x: 147.33, y: 430.67, width: 145.33, height: 145.33 };
    const p = { x: 20, y: src.y + src.height / 2 - 200, width: 400, height: 400 };
    const placed = placeContextMenu(p, menuListHeight([[{}, {}], [{}, {}], [{}]], true), { width: 440, height: 956, safeTop: 62, safeBottom: 34 });
    expect(placed.preview.y).toBeCloseTo(132, 6); // native 132.0; menu 350 (552…902)
    expect(placed.menu.height).toBeCloseTo(350, 6);
    expect(placed.menu.y + placed.menu.height).toBeCloseTo(902, 6);
    expect(placed.menu.y - (placed.preview.y + placed.preview.height)).toBeCloseTo(20, 6);
  });
  it('UIKit lab lifted frames (photos-transition raw/r1…r5): preview + menu 188, menu follows the source third', () => {
    const scr = { width: 440, height: 956, safeTop: 62, safeBottom: 34 };
    // 9:16: 353.67 × 628.33 at (43.33, 82), menu (95.33, 730.33) — the pair runs past 902 instead of overlapping.
    const tall = previewSize(scr, 9 / 16);
    expect(tall.height).toBeCloseTo(628.33, 1);
    const t = placeContextMenu({ x: 220 - tall.width / 2, y: 500, width: tall.width, height: tall.height }, 188, scr, 220);
    expect(t.preview.y).toBe(82);
    expect(t.menu.y).toBeCloseTo(82 + 628.33 + 20, 1);
    expect(t.menu.x).toBeCloseTo(95.33, 0);
    // 400-wide preview at x 20: menu x 20 / 95 / 170 for sources in the left / middle / right column.
    const p = { x: 20, y: 222.667, width: 400, height: 225.667 };
    expect(placeContextMenu(p, 188, scr, 72.67).menu.x).toBe(20);
    expect(placeContextMenu(p, 188, scr, 220).menu.x).toBe(95);
    expect(placeContextMenu(p, 188, scr, 367.33).menu.x).toBe(170);
  });
  it('Photos portrait long press: menu one spacing below, never over the preview (deep/ctxmenu-fit)', () => {
    const menuH = menuListHeight([[{}, {}], [{}, {}], [{}]], true);
    // 440 × 956, Photos caps the preview at the screen width: orange 3:4 in the left column → 330 × 440 at (20, 92).
    const big = { width: 440, height: 956, safeTop: 62, safeBottom: 34 };
    const s1 = previewSize(big, 3 / 4, 440);
    expect(s1).toEqual({ width: 330, height: 440 });
    const a = placeContextMenu({ x: 72.67 - 165, y: 503 - 220, width: 330, height: 440 }, menuH, big, 72.67);
    expect(a.preview).toEqual({ x: 20, y: 92, width: 330, height: 440 });
    expect(a.menu.x).toBe(20);
    expect(a.menu.y).toBe(552);
    // 9:16 in the middle column: 247.5 × 440 centred on x 220; menu centred under it.
    const s2 = previewSize(big, 9 / 16, 440);
    const b = placeContextMenu({ x: 220 - s2.width / 2, y: 283, width: s2.width, height: s2.height }, menuH, big, 220);
    expect(b.preview.x).toBeCloseTo(96.25, 2); // native 96.33
    expect(b.menu.x).toBeCloseTo(95, 2); // native 95.5
    // 402 × 874 (spacing 16): orange 3:4 in the right column → 301.5 × 402 at (84.5, 78), menu 16 below, trailing.
    const small = { width: 402, height: 874, safeTop: 62, safeBottom: 34 };
    const s3 = previewSize(small, 3 / 4, 402);
    expect(s3).toEqual({ width: 301.5, height: 402 });
    const c = placeContextMenu({ x: 335 - s3.width / 2, y: 444 - 201, width: s3.width, height: s3.height }, menuH, small, 335);
    expect(c.preview.x).toBeCloseTo(84.5, 2); // native 84.33…386
    expect(c.preview.y).toBe(78);
    expect(c.menu.y).toBe(78 + 402 + 16); // native 496
    expect(c.menu.x + c.menu.width).toBeCloseTo(386, 2); // trailing-aligned with the preview
    for (const r of [a, b, c]) expect(r.menu.y).toBeGreaterThanOrEqual(r.preview.y + r.preview.height);
    // Without an app cap a 3:4 preview (400 × 533.33) and the 350 menu cannot fit: the preview shrinks so the menu
    // ends at H − spacing (guard), keeping its aspect.
    const u = placeContextMenu({ x: 20, y: 236, width: 400, height: 533.33 }, menuH, big, 220);
    expect(u.menu.y + u.menu.height).toBeCloseTo(936, 6);
    expect(u.preview.width / u.preview.height).toBeCloseTo(0.75, 4);
    expect(u.menu.y - (u.preview.y + u.preview.height)).toBeCloseTo(20, 6);
  });
  it('preview size rule (photos-transition §1)', () => {
    const s = { width: 440, height: 956 };
    expect(previewSize(s, 16 / 9)).toEqual({ width: 400, height: 225 });
    expect(previewSize(s, 1)).toEqual({ width: 400, height: 400 });
    const tall = previewSize(s, 9 / 16);
    expect(tall.height).toBeCloseTo(628.33, 2);
    expect(tall.width).toBeCloseTo(353.4, 1);
    expect(previewSize(s).height).toBeCloseTo(571.33, 2);
  });
});

describe('long-press pre-lift (photos-transition §1)', () => {
  it('starts at 0.18 s and grows 19 pt/s', () => {
    expect(preLiftScale(145, 0.1)).toBe(1);
    expect(preLiftScale(145, 0.68)).toBeCloseTo((145 + 9.5) / 145, 9);
    expect(preLiftScale(145, 5)).toBeCloseTo((145 + 19 * (0.725 - 0.18)) / 145, 9);
  });
});

describe('morph (motion §2)', () => {
  it('starts as a 22×22 blob and ends as the menu with radius 32', () => {
    const menu = { x: 95, y: 300, width: 250, height: 188 };
    const s0 = morphShape({ x: 300, y: 320 }, menu, 0);
    expect([s0.width, s0.height, s0.radius]).toEqual([22, 22, 11]);
    const s1 = morphShape({ x: 300, y: 320 }, menu, 1);
    expect(s1).toEqual({ ...menu, radius: 32 });
  });
  it('blur = 4·(1 − opacity), clamped at 0 on overshoot', () => {
    expect(morphBlur(0)).toBe(4);
    expect(morphBlur(0.5)).toBe(2);
    expect(morphBlur(1.028)).toBe(0);
  });
});

describe('.pop commit (photos-transition §2)', () => {
  it('keyframes: preview fades over 0–40 %, background over 30–70 % of 0.35 s', () => {
    expect(popKeyframes(0)).toEqual({ preview: 1, background: 1 });
    expect(popKeyframes(0.07).preview).toBeCloseTo(0.5, 9);
    expect(popKeyframes(0.14).preview).toBe(0);
    expect(popKeyframes(0.105).background).toBe(1);
    expect(popKeyframes(0.175).background).toBeCloseTo(0.5, 9);
    expect(popKeyframes(0.245).background).toBeCloseTo(0, 9);
  });
  it('geometry: radius 32 → 62, uniform scale by the width ratio', () => {
    const src = { x: 20, y: 200, width: 400, height: 225.67 };
    const dst = { x: 0, y: 0, width: 440, height: 956 };
    const a = popGeometry(src, dst, 0, 0);
    expect(a.container.radius).toBe(32);
    expect(a.previewScale).toBe(1);
    const b = popGeometry(src, dst, 1, 1);
    expect(b.container).toEqual({ ...dst, radius: 62 });
    expect(b.previewScale).toBeCloseTo(1.1, 9);
    expect(b.destScale).toBe(1);
  });
});

import { orderActions } from './logic';
describe('alert action order (text_overlays §9.2)', () => {
  const acts = [{ title: 'OK', preferred: true }, { title: 'Cancel', role: 'cancel' as const }, { title: 'Delete', role: 'destructive' as const }];
  it('cancel goes left when side by side', () => {
    expect(orderActions(acts.slice(0, 2), true).map((a) => a.title)).toEqual(['Cancel', 'OK']);
  });
  it('cancel goes last when stacked', () => {
    expect(orderActions(acts, false).map((a) => a.title)).toEqual(['OK', 'Delete', 'Cancel']);
  });
});
