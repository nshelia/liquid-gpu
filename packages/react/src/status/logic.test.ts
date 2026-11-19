import { describe, expect, it } from 'vitest';
import { arcPath, circularIndicatorAngle, dotLeft, dotScale, dotScaleAt, pageWindowStart, gaugeFraction, pageControlWidth, pageForOffset, ringPoint, scrubPage } from './logic';

describe('gauge geometry', () => {
  it('normalises and clamps the value', () => {
    expect(gaugeFraction(40, 0, 100)).toBeCloseTo(0.4);
    expect(gaugeFraction(-5, 0, 100)).toBe(0);
    expect(gaugeFraction(5, 5, 5)).toBe(0);
  });
  it('places the circular indicator like SwiftUI (v 0.4 → dot centre (17.09, 5.62))', () => {
    const [x, y] = ringPoint(circularIndicatorAngle(0.4));
    expect(x).toBeCloseTo(17.088, 2);
    expect(y).toBeCloseTo(5.622, 2);
  });
  it('starts the 270° arc at the measured point (10.447, 47.553)', () => {
    expect(arcPath(-135, 135)).toMatch(/^M10\.44\d+ 47\.55\d+A/);
  });
});

describe('page control', () => {
  it('matches the UIPageControl size table', () => {
    expect(pageControlWidth(4)).toBeCloseTo(90.667, 2);
    expect(pageControlWidth(5)).toBeCloseTo(108.333, 2);
    expect(pageControlWidth(9)).toBeCloseTo(179, 2);
    expect(pageControlWidth(30)).toBeCloseTo(196.667, 2);
    expect(dotLeft(3)).toBeCloseTo(67, 0);
  });
  it('slides a 10-slot window like TabView(.page) with 12 pages', () => {
    const seq = (pages: number[]) => pages.reduce<number[]>((acc, p) => [...acc, pageWindowStart(acc.at(-1) ?? 0, p, 12)], []);
    expect(seq([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])).toEqual([0, 0, 0, 0, 0, 0, 0, 1, 2, 2, 2]);
    expect(seq([11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0]).slice(1)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0]);
    expect([0, 8, 9, 10].map((i) => dotScale(i, 0, 12))).toEqual([1, 0.759, 0.446, 0]);
    expect([0, 1, 2, 3, 9, 10, 11].map((i) => dotScale(i, 1, 12))).toEqual([0, 0.446, 0.759, 1, 0.759, 0.446, 0]);
    expect([1, 2, 3, 11].map((i) => dotScale(i, 2, 12))).toEqual([0, 0.446, 0.759, 1]);
    expect(dotScaleAt(1, 0.5, 12)).toBeCloseTo(0.723, 3);
  });
  it('scrubs to the dot about ¾ of a pitch past the start', () => {
    const c = dotLeft(0) + 4.83;
    expect(scrubPage(c + 10, c, 4)).toBe(0);
    expect(scrubPage(c + 16, c, 4)).toBe(1);
    expect(scrubPage(c + 500, c, 4)).toBe(3);
  });
  it('follows the scroll: midpoint while tracking, heading after release', () => {
    expect(pageForOffset(210, 440, 4, true, -1)).toBe(0);
    expect(pageForOffset(234, 440, 4, true, 1)).toBe(1);
    expect(pageForOffset(228, 440, 4, false, 18)).toBe(1);
    expect(pageForOffset(184, 440, 4, false, -13)).toBe(0);
    expect(pageForOffset(-30, 440, 4, true, 0)).toBe(0);
  });
});
