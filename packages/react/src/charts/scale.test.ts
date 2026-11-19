import { describe, expect, it } from 'vitest';
import {
  areaPath,
  bandScale,
  barPath,
  extent,
  extractSeries,
  formatValue,
  linePath,
  linearScale,
  nearestIndex,
  niceStep,
  niceTicks,
  pieAngles,
  pointScale,
  sectorPath,
  segments,
  stack,
  stackExtent,
  summarize,
} from './scale';

describe('extractSeries', () => {
  const data = [
    { m: 'Jan', v: 10, s: 'A' },
    { m: 'Feb', v: 20, s: 'A' },
    { m: 'Jan', v: 5, s: 'B' },
    { m: 'Mar', v: '7', s: 'B' },
    { m: 'Mar', v: 3, s: 'B' },
  ];
  it('pivots rows into series × categories, summing duplicates and keeping order', () => {
    const t = extractSeries(data, 'm', 'v', 's');
    expect(t.categories).toEqual(['Jan', 'Feb', 'Mar']);
    expect(t.series).toEqual(['A', 'B']);
    expect(t.values[0]).toEqual([10, 20, NaN]);
    expect(t.values[1]).toEqual([5, NaN, 10]);
    expect(t.numericX).toBeNull();
  });
  it('detects numeric x', () => {
    expect(extractSeries([{ x: 1, y: 2 }, { x: 3, y: 4 }], 'x', 'y').numericX).toEqual([1, 3]);
  });
});

describe('nice ticks', () => {
  it('picks 1/2/5 steps', () => {
    expect(niceStep(100, 4)).toBe(20);
    expect(niceStep(1, 5)).toBe(0.2);
    expect(niceStep(37, 4)).toBe(10);
  });
  it('extends the domain to nice bounds', () => {
    const t = niceTicks(0, 87, 4);
    expect(t.min).toBe(0);
    expect(t.max).toBe(100);
    expect(t.ticks).toEqual([0, 20, 40, 60, 80, 100]);
  });
  it('handles negatives, decimals and degenerate domains', () => {
    expect(niceTicks(-13, 42, 4).ticks).toEqual([-20, 0, 20, 40, 60]);
    expect(niceTicks(0, 0.3, 3).ticks).toEqual([0, 0.1, 0.2, 0.3]);
    expect(niceTicks(0, 0, 4).ticks.at(-1)).toBe(1);
    const flat = niceTicks(50, 50, 4);
    expect(flat.min).toBe(0);
    expect(flat.max).toBeGreaterThanOrEqual(50);
  });
  it('extent optionally includes zero', () => {
    expect(extent([[3, 9, NaN]], false)).toEqual([3, 9]);
    expect(extent([[3, 9]], true)).toEqual([0, 9]);
  });
});

describe('scales', () => {
  it('linear maps and inverts', () => {
    const s = linearScale([0, 100], [200, 0]);
    expect(s(25)).toBe(150);
    expect(s.invert(150)).toBe(25);
  });
  it('band scale lays out bands with padding', () => {
    const b = bandScale(4, [0, 400], 0.2, 0.1);
    expect(b.step).toBeCloseTo(100);
    expect(b.bandwidth).toBeCloseTo(80);
    expect(b(0)).toBeCloseTo(10);
    expect(b.center(3)).toBeCloseTo(350);
    expect(b.index(355)).toBe(3);
    expect(b.index(-50)).toBe(0);
    expect(b.index(1000)).toBe(3);
  });
  it('point scale and nearest index', () => {
    const p = pointScale(3, [0, 100]);
    expect([p(0), p(1), p(2)]).toEqual([0, 50, 100]);
    expect(nearestIndex([0, 50, 100], 70)).toBe(1);
    expect(nearestIndex([], 1)).toBe(-1);
  });
});

describe('stacking', () => {
  it('stacks positives up and negatives down, skipping NaN', () => {
    const c = stack([
      [10, -5, NaN],
      [20, -10, 4],
    ]);
    expect(c[0]).toEqual([{ y0: 0, y1: 10 }, { y0: 0, y1: -5 }, { y0: 0, y1: 0 }]);
    expect(c[1]).toEqual([{ y0: 10, y1: 30 }, { y0: -5, y1: -15 }, { y0: 0, y1: 4 }]);
    expect(stackExtent(c)).toEqual([-15, 30]);
  });
});

describe('paths', () => {
  const pts = [
    [0, 10],
    [10, 0],
    [20, 10],
  ] as const;
  it('linear', () => {
    expect(linePath(pts)).toBe('M0 10L10 0L20 10');
  });
  it('breaks lines at gaps', () => {
    expect(segments([[0, 1], [1, NaN], [2, 3], [3, 4]]).length).toBe(2);
    expect(linePath([[0, 1], [1, NaN], [2, 3], [3, 4]])).toBe('M0 1M2 3L3 4');
  });
  it('catmullRom passes through every point', () => {
    const d = linePath(pts, 'catmullRom');
    expect(d.startsWith('M0 10C')).toBe(true);
    expect(d.endsWith(' 20 10')).toBe(true);
    expect(d.match(/C/g)!.length).toBe(2);
  });
  it('monotone never overshoots a peak (flat tangent at the extremum)', () => {
    const d = linePath(pts, 'monotone');
    // Second control point of segment 1 and first of segment 2 share y = 0 (horizontal tangent at the peak).
    const nums = d.match(/C([^C]+)/g)!.map((s) => s.slice(1).split(/[ ]/).map(Number));
    expect(nums[0]![3]).toBe(0);
    expect(nums[1]![1]).toBe(0);
    for (const seg of nums) for (let i = 1; i < seg.length; i += 2) expect(seg[i]).toBeGreaterThanOrEqual(0);
  });
  it('area closes along the baseline', () => {
    const d = areaPath(pts, pts.map(([x]) => [x, 20] as const));
    expect(d).toBe('M0 10L10 0L20 10L20 20L10 20L0 20Z');
  });
  it('bar with rounded top', () => {
    expect(barPath(0, 0, 10, 20, 0, 'vertical', false)).toBe('M0 0h10v20h-10Z');
    expect(barPath(0, 0, 10, 20, 4, 'vertical', false)).toContain('A4 4');
    expect(barPath(0, 0, 0, 20, 4, 'vertical', false)).toBe('');
  });
});

describe('pie', () => {
  it('splits the circle clockwise in data order', () => {
    const s = pieAngles([1, 3, 0, -2]);
    expect(s[0]!.start).toBe(0);
    expect(s[0]!.end).toBeCloseTo(Math.PI / 2);
    expect(s[1]!.end).toBeCloseTo(Math.PI * 2);
    expect(s[2]!.end - s[2]!.start).toBe(0);
    expect(s[3]!.value).toBe(0);
  });
  it('sector path starts at 12 o’clock and draws donut / full circles', () => {
    expect(sectorPath(50, 50, 0, 40, 0, Math.PI / 2)).toMatch(/^M50 10A40 40 0 0 1 90 50L50 50Z$/);
    expect(sectorPath(50, 50, 20, 40, 0, Math.PI * 2)).toContain('M50 30');
    expect(sectorPath(50, 50, 20, 40, 0, Math.PI / 2, 2)).toMatch(/^M51/);
    expect(sectorPath(50, 50, 0, 40, 1, 1)).toBe('');
  });
});

describe('formatting', () => {
  it('formats number, percent, currency and compact', () => {
    expect(formatValue(1234.5, 'number', { locale: 'en-US' })).toBe('1,234.5');
    expect(formatValue(0.256, 'percent', { locale: 'en-US' })).toBe('25.6%');
    expect(formatValue(12, 'currency', { locale: 'en-US' })).toBe('$12');
    expect(formatValue(12.5, 'currency', { locale: 'en-US', currency: 'EUR' })).toBe('€12.5');
    expect(formatValue(12300, 'compact', { locale: 'en-US' })).toBe('12.3K');
    expect(formatValue(-0, 'number')).toBe('0');
    expect(formatValue(NaN)).toBe('–');
  });
  it('summarises a table for screen readers', () => {
    const t = extractSeries(
      [
        { d: 'Mon', v: 3 },
        { d: 'Tue', v: 9 },
      ],
      'd',
      'v',
    );
    expect(summarize('Bar chart', t)).toBe('Bar chart, 2 points from Mon to Tue. minimum 3 at Mon, maximum 9 at Tue.');
  });
});
