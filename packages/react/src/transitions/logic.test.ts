import { describe, expect, it } from 'vitest';
import {
  fitRect,
  glassMorphContentOpacity,
  glassMorphDragRect,
  glassMorphRadius,
  glassMorphRect,
  swipeDownOffset,
  swipeDownScale,
  swipeDownShouldDismiss,
  ONE_UP_PAGE_SPACING,
  pageDragOffset,
  pageReleaseStep,
  zoomModes,
} from './logic';

describe('swipe-down scale (photos-transition §3, §5)', () => {
  it('.zoom hits every measured point', () => {
    expect(swipeDownScale('zoom', 0)).toBe(1);
    expect(swipeDownScale('zoom', 98)).toBeCloseTo(0.954, 9);
    expect(swipeDownScale('zoom', 222)).toBeCloseTo(0.866, 9);
    expect(swipeDownScale('zoom', 300)).toBeCloseTo(0.806, 9);
    expect(swipeDownScale('zoom', 5000)).toBe(0.6);
  });
  it('Photos tile mode', () => {
    expect(swipeDownScale('tile', 76)).toBeCloseTo(0.972, 9);
    expect(swipeDownScale('tile', 281)).toBeCloseTo(0.789, 9);
    expect(swipeDownScale('tile', -50)).toBe(1);
  });
});

describe('swipe-down follow', () => {
  it('nothing within the 15 pt hysteresis, then 1:1 (tile) / 0.6× (zoom)', () => {
    expect(swipeDownOffset('tile', 0, 10)).toEqual({ x: 0, y: 0 });
    expect(swipeDownOffset('tile', 0, 300).y).toBeCloseTo(285, 9); // PT §5: finger 300 → centre +281
    expect(swipeDownOffset('zoom', 0, 148).y).toBeCloseTo(0.6 * 133, 9); // TR §4: 148 → +78.6
  });
});

describe('swipe-down decision (photos-transition §3 outcomes)', () => {
  const cases: [number, number, boolean][] = [
    [60, 300, false],
    [120, 300, false],
    [200, 300, true],
    [300, 300, true],
    [60, 1500, false],
    [120, 1500, true],
    [40, 3000, false],
    [58, 50, false], // TR §4
    [148, 200, true],
    [280, 200, true],
  ];
  for (const [travel, v, out] of cases) {
    it(`.zoom ${travel}@${v} → ${out ? 'dismiss' : 'cancel'}`, () => {
      expect(swipeDownShouldDismiss('zoom', travel, v)).toBe(out);
    });
  }
  it('upward release cancels', () => {
    expect(swipeDownShouldDismiss('zoom', 200, -600)).toBe(false);
    expect(swipeDownShouldDismiss('tile', 200, -600)).toBe(false);
  });
  it('Photos: a short slow drag with downward velocity dismisses', () => {
    expect(swipeDownShouldDismiss('tile', 80, 120)).toBe(true);
    expect(swipeDownShouldDismiss('tile', 80, 0)).toBe(false);
  });
});

describe('zoom constants', () => {
  it('presenter recedes to 0.9212, dim 0.15, shadow 0.4/40/10', () => {
    expect(zoomModes.zoom.presenterScale).toBeCloseTo(0.9212, 4);
    expect(zoomModes.zoom.dim).toBe(0.15);
    expect(zoomModes.zoom.shadow).toEqual({ opacity: 0.4, radius: 40, offsetY: 10 });
    expect(zoomModes.tile.open).toEqual({ dampingRatio: 1, response: 0.3 });
    expect(zoomModes.tile.destinationRadius).toBe(0);
  });
  it('fitRect', () => {
    expect(fitRect({ x: 0, y: 0, width: 440, height: 956 }, 1)).toEqual({ x: 0, y: 258, width: 440, height: 440 });
  });
});

describe('glass morph (sheets §6)', () => {
  const src = { x: 170, y: 527, width: 100, height: 34 };
  const dst = { x: 0, y: 0, width: 440, height: 956 };
  it('ends at the destination with radius 62', () => {
    expect(glassMorphRect(src, dst, 1, 1)).toEqual(dst);
    expect(glassMorphRadius(17, 440, 956, 1, 1)).toBeCloseTo(62, 9);
    expect(glassMorphRadius(17, 100, 34, 0, 0)).toBe(17);
  });
  it('bulges mid-flight', () => {
    expect(glassMorphRadius(17, 300, 600, 0.5, 0.5)).toBeCloseTo(96, 6);
  });
  it('drag: top follows, width shrinks 0.23 pt/pt', () => {
    const r = glassMorphDragRect(dst, 400);
    expect(r.y).toBe(400);
    expect(r.width).toBeCloseTo(440 - 92, 9);
    expect(r.radius).toBeCloseTo(48, 9);
  });
  it('content fade 0.2 s after 0.07 s', () => {
    expect(glassMorphContentOpacity(0.05)).toBe(0);
    expect(glassMorphContentOpacity(0.17)).toBeCloseTo(0.5, 9);
    expect(glassMorphContentOpacity(0.5)).toBe(1);
  });
});

describe('one-up paging (PUOneUpSettings.interpageSpacing, SMG §4)', () => {
  const pitch = 440 + ONE_UP_PAGE_SPACING;
  it('follows the finger 1:1 toward an existing neighbour, rubber-bands at the ends', () => {
    expect(pageDragOffset(-120, true, true, 440)).toBe(-120);
    expect(pageDragOffset(120, true, true, 440)).toBe(120);
    const edge = pageDragOffset(-120, true, false, 440);
    expect(edge).toBeLessThan(0);
    expect(edge).toBeGreaterThan(-120);
    expect(pageDragOffset(80, false, true, 440)).toBeLessThan(80);
  });
  it('pages past half a pitch or on a 300 pt/s flick, else stays', () => {
    expect(pageReleaseStep(-250, 0, pitch, true, true)).toBe(1);
    expect(pageReleaseStep(-200, 0, pitch, true, true)).toBe(0);
    expect(pageReleaseStep(-40, -400, pitch, true, true)).toBe(1);
    expect(pageReleaseStep(40, 400, pitch, true, true)).toBe(-1);
    expect(pageReleaseStep(-40, -200, pitch, true, true)).toBe(0);
    expect(pageReleaseStep(-300, -900, pitch, true, false)).toBe(0);
  });
});
