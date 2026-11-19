import { describe, expect, it } from 'vitest';
import {
  activitySpokeAlpha,
  buttonColors,
  buttonMetrics,
  hitsEdge,
  segmentAt,
  sliderOvershoot,
  sliderThumbX,
  sliderTickCentres,
  sliderTrack,
  stepperRepeatInterval,
  stepperRepeatTimes,
  stepperStep,
  switchKnobCentre,
  switchValueOnRelease,
  ticksCrossed,
  withAlpha,
} from './logic';

describe('button metrics (controls.md §1.3)', () => {
  it('heights and insets', () => {
    expect(buttonMetrics.mini.height).toBe(28);
    expect(buttonMetrics.small.height).toBe(28);
    expect(buttonMetrics.medium.height).toBe(34.33);
    expect(buttonMetrics.large.height).toBe(50.33);
    expect([buttonMetrics.medium.insetV, buttonMetrics.medium.insetH]).toEqual([7, 12]);
    expect(buttonMetrics.large.radius).toBe(25);
  });
  it('colours (§1.5)', () => {
    expect(buttonColors('tinted', 'light', '#0088FF').fill).toBe('rgba(0, 136, 255, 0.18)');
    expect(buttonColors('tinted', 'light', '#0088FF', { highlighted: true }).fill).toBe('rgba(0, 136, 255, 0.117)');
    expect(buttonColors('gray', 'light', '#0088FF', { highlighted: true }).fill).toBe('rgba(120, 120, 128, 0.12)');
    expect(buttonColors('filled', 'dark', '#0091FF').foreground).toBe('#FFFFFF');
    expect(buttonColors('glass', 'dark', '#0091FF').foreground).toBe('#FFFFFF');
    expect(withAlpha('rgba(1, 2, 3, 0.5)', 0.5)).toBe('rgba(1, 2, 3, 0.25)');
  });
});

describe('switch (controls.md §2, motion §1)', () => {
  it('rest centres 20.5 / 42.5 (22 pt travel)', () => {
    expect(switchKnobCentre(false, 0)).toBe(20.5);
    expect(switchKnobCentre(true, 0)).toBe(42.5);
    expect(switchKnobCentre(false, 11)).toBe(31.5);
  });
  it('rubber-bands past the end with range 12, c 0.55', () => {
    const o = 30;
    expect(switchKnobCentre(true, o)).toBeCloseTo(42.5 + 12 * (1 - 1 / ((o / 12) * 0.55 + 1)), 9);
    expect(switchKnobCentre(true, 1000)).toBeLessThan(42.5 + 12);
    expect(switchKnobCentre(false, -30)).toBeCloseTo(20.5 - (42.5 + 12 * (1 - 1 / ((30 / 12) * 0.55 + 1)) - 42.5), 9);
  });
  it('RTL swaps the ends', () => {
    expect(switchKnobCentre(true, 0, true)).toBe(20.5);
  });
  it('tap toggles, drag commits by side', () => {
    expect(switchValueOnRelease(false, false, 20.5)).toBe(true);
    expect(switchValueOnRelease(false, true, 30)).toBe(false);
    expect(switchValueOnRelease(false, true, 35)).toBe(true);
  });
});

describe('slider (controls.md §3)', () => {
  it('thumb x = v·(W − 37): 0 / 131.5 / 263 at W 300', () => {
    expect(sliderThumbX(0, 300)).toBe(0);
    expect(sliderThumbX(0.5, 300)).toBe(131.5);
    expect(sliderThumbX(1, 300)).toBe(263);
  });
  it('ticks at 18.5 + k·263/4', () => {
    expect(sliderTickCentres(300, 5)).toEqual([18.5, 84.25, 150, 215.75, 281.5]);
  });
  it('relative tracking: 90 pt → +0.3 of 300 (measured +0.2667 incl. 10 pt slop)', () => {
    expect(sliderTrack(0.5, 90, 300, true)).toBeCloseTo(0.8, 9);
    expect(sliderTrack(0.5, 80, 300, true) - 0.5).toBeCloseTo(0.2667, 3);
    expect(sliderTrack(0.5, 5, 300, false)).toBe(0.5);
  });
  it('overshoot reproduces the measured end values at 150 pt', () => {
    const o = sliderOvershoot(150);
    expect(o.stretch).toBeCloseTo(7.6, 6);
    expect(o.squish * 6).toBeCloseTo(2.54, 6);
    expect(o.thumb).toBeCloseTo(12, 6);
    expect(sliderOvershoot(0)).toEqual({ stretch: 0, squish: 1, thumb: 0 });
  });
  it('tick crossing and edge haptics', () => {
    expect(ticksCrossed(0.1, 0.6, 5)).toEqual([1, 2]);
    expect(ticksCrossed(0.6, 0.1, 5)).toEqual([2, 1]);
    expect(ticksCrossed(0.25, 0.3, 5)).toEqual([]);
    expect(hitsEdge(0.9, 1)).toBe('max');
    expect(hitsEdge(1, 1)).toBe(null);
    expect(hitsEdge(0.1, 0)).toBe('min');
  });
});

describe('stepper auto-repeat (controls.md §4.2)', () => {
  it('measured timeline: six 0.5 s repeats, then 0.1 s, then 0.05 s', () => {
    expect([1, 2, 3, 4, 5].map(stepperRepeatInterval)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(stepperRepeatInterval(6)).toBe(0.1);
    expect(stepperRepeatInterval(35)).toBe(0.1);
    expect(stepperRepeatInterval(36)).toBe(0.05);
  });
  it('schedule matches the 3.8 s hold (+0.50 … +3.01, then 0.1 s)', () => {
    const t = stepperRepeatTimes(3.8);
    expect(t.slice(0, 7)).toEqual([0.5, 1, 1.5, 2, 2.5, 3, 3.1]);
    const gaps = t.slice(1).map((x, i) => +(x - t[i]!).toFixed(6));
    expect(gaps.slice(-1)[0]).toBe(0.1);
    const long = stepperRepeatTimes(8);
    const g2 = long.slice(1).map((x, i) => +(x - long[i]!).toFixed(6));
    expect(g2.slice(-1)[0]).toBe(0.05);
  });
  it('clamps and wraps', () => {
    expect(stepperStep(10, 1, { min: 0, max: 10, step: 1 })).toBe(10);
    expect(stepperStep(10, 1, { min: 0, max: 10, step: 1, wraps: true })).toBe(0);
    expect(stepperStep(0.1, 1, { min: 0, max: 1, step: 0.2 })).toBe(0.3);
  });
});

describe('segmented and activity', () => {
  it('segment hit test', () => {
    expect(segmentAt(10, 195, 3)).toBe(0);
    expect(segmentAt(100, 195, 3)).toBe(1);
    expect(segmentAt(500, 195, 3)).toBe(2);
  });
  it('activity frames (controls.md §8): frame 0 ramp 130/108/86/64 then 42, frame 1 half step', () => {
    const f0 = [0, 7, 6, 5, 4].map((s) => Math.round(activitySpokeAlpha(0, s) * 255));
    expect(f0).toEqual([130, 108, 86, 64, 42]);
    const f1 = [0, 7, 6, 5].map((s) => Math.round(activitySpokeAlpha(1, s) * 255));
    expect(f1).toEqual([119, 97, 75, 53]);
  });
});
