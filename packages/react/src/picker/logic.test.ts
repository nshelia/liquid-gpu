import { describe, expect, it } from 'vitest';
import {
  ROW_ANGLE,
  indexAtPoint,
  indexForOffset,
  keyboardTarget,
  nearestEnabled,
  outerMaskStops,
  shouldTick,
  snapOffset,
  visibleRowRange,
  wheelMetrics as W,
  wheelRowTransform,
} from './logic';

const deg = (r: number) => (r * 180) / Math.PI;

describe('wheel cylinder (TO §6.5)', () => {
  it('rotates 18.85° per row', () => {
    expect(deg(ROW_ANGLE)).toBeCloseTo(18.85, 1);
    // TO §6.5: rows 1…4 above the selected row 5 at 75.691°, 56.743°, 37.796°, 18.849°.
    const sel = 5 * W.rowHeight;
    expect(deg(-wheelRowTransform(4, sel).angle)).toBeCloseTo(18.849, 1);
    // The captured angles step 18.947° (−0.098° phase); θ = rowHeight / R (TO §6.5) drifts ≤ 0.3° by row 1.
    expect(deg(-wheelRowTransform(3, sel).angle)).toBeCloseTo(37.796, 0);
    expect(deg(-wheelRowTransform(2, sel).angle)).toBeCloseTo(56.743, 0);
    expect(deg(-wheelRowTransform(1, sel).angle)).toBeCloseTo(75.691, 0);
  });
  it('satisfies m43 = −R(1 − cos θ) for the captured rows', () => {
    const m43 = [-5.2155, -20.405, -43.923, -73.221];
    const angles = [18.849, 37.796, 56.743, 75.691];
    m43.forEach((z, k) => {
      // Exact with the captured angles (R = 97.26) …
      expect(-W.radius * (1 - Math.cos((angles[k]! * Math.PI) / 180))).toBeCloseTo(z, 2);
      // … and within 1 pt with the model's θ = rowHeight / R.
      const t = wheelRowTransform(k + 1, 0);
      expect(Math.abs(-W.radius * (1 - Math.cos(t.angle)) - z)).toBeLessThan(1);
    });
  });
  it('projects orthographically and hides rows past the horizon', () => {
    const c = wheelRowTransform(3, 3 * 32);
    expect(c).toEqual({ angle: 0, y: 0, scaleY: 1, visible: true });
    const t = wheelRowTransform(1, 0);
    expect(t.y).toBeCloseTo(W.radius * Math.sin(ROW_ANGLE), 6);
    expect(t.scaleY).toBeCloseTo(Math.cos(ROW_ANGLE), 6);
    expect(wheelRowTransform(5, 0).visible).toBe(false); // 94.25° > 90°
    expect(wheelRowTransform(4, 0).visible).toBe(true);
  });
  it('limits the rows to update per frame', () => {
    expect(visibleRowRange(0, 100)).toEqual([0, 5]);
    expect(visibleRowRange(10 * 32, 100)).toEqual([5, 15]);
    expect(visibleRowRange(10 * 32, 12)).toEqual([5, 11]);
  });
});

describe('snapping', () => {
  it('snaps a projected offset to the nearest row inside the bounds', () => {
    expect(snapOffset(47, 10)).toBe(32);
    expect(snapOffset(49, 10)).toBe(64);
    expect(snapOffset(-80, 10)).toBe(0);
    expect(snapOffset(5000, 10)).toBe(288);
    expect(indexForOffset(798.333, 30)).toBe(25); // round(24.95)
    expect(indexForOffset(0, 0)).toBe(-1);
  });
  it('maps a tap back through the cylinder', () => {
    expect(indexAtPoint(0, 64, 10)).toBe(2);
    expect(indexAtPoint(W.radius * Math.sin(ROW_ANGLE), 64, 10)).toBe(3);
    expect(indexAtPoint(-W.radius * Math.sin(2 * ROW_ANGLE), 64, 10)).toBe(0);
    expect(indexAtPoint(-W.radius * Math.sin(3 * ROW_ANGLE), 64, 10)).toBeNull();
    expect(indexAtPoint(100, 0, 10)).toBeNull();
  });
  it('skips disabled rows', () => {
    expect(nearestEnabled(1, [true, false, true])).toBe(2);
    expect(nearestEnabled(1, [true, false, true], -1)).toBe(0);
    expect(nearestEnabled(0, [false, false])).toBe(-1);
  });
});

describe('keyboard', () => {
  it('moves like a listbox', () => {
    expect(keyboardTarget('ArrowDown', 2, 5)).toBe(3);
    expect(keyboardTarget('ArrowDown', 4, 5)).toBe(4);
    expect(keyboardTarget('ArrowUp', 0, 5)).toBe(0);
    expect(keyboardTarget('PageDown', 1, 20)).toBe(6);
    expect(keyboardTarget('Home', 3, 5)).toBe(0);
    expect(keyboardTarget('End', 0, 5)).toBe(4);
    expect(keyboardTarget('a', 0, 5)).toBeNull();
  });
});

describe('magnifier and fade mask (TO §6.3–6.4)', () => {
  it('cuts the 34 pt band out of the fade gradient', () => {
    const s = outerMaskStops();
    expect(s[0]).toEqual({ y: 10, alpha: 0 });
    expect(s[s.length - 1]!.y).toBeCloseTo(206, 6);
    const zero = s.filter((x) => x.alpha === 0).map((x) => x.y);
    expect(zero).toContain(91);
    expect(zero).toContain(125);
    expect(s.find((x) => x.y === 91 && x.alpha > 0)!.alpha).toBeCloseTo(0.8, 6);
    // monotonic y
    for (let i = 1; i < s.length; i++) expect(s[i]!.y).toBeGreaterThanOrEqual(s[i - 1]!.y);
  });
});

describe('haptic tick (HF §1/§4)', () => {
  it('ticks per row change, throttled to 0.04 s', () => {
    expect(shouldTick(1, 2, 1.0, 0.9)).toBe(true);
    expect(shouldTick(1, 2, 1.0, 0.98)).toBe(false);
    expect(shouldTick(2, 2, 5, 0)).toBe(false);
  });
});
