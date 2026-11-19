import { describe, expect, it } from 'vitest';
import {
  ScrollPhysics,
  VelocityTracker,
  decayFactor,
  decelerationStep,
  pagingFriction,
  pagingSpringPull,
  pagingTargetPage,
  retargetDecelerationRate,
  snapDecelerationRate,
  uiAnimationCurve,
} from '../src/scroll';
import { rubberBand } from '../src/gestures';

function run(p: ScrollPhysics, maxSeconds = 10): number {
  let t = 0;
  while (p.active && t < maxSeconds) {
    p.step(1 / 120);
    t += 1 / 120;
  }
  return t;
}

describe('deceleration (scroll-motion-gestures §1)', () => {
  it('setter snaps < 0.994 → 0.99, else 0.998', () => {
    expect(snapDecelerationRate(0.993)).toBe(0.99);
    expect(snapDecelerationRate(0.994)).toBe(0.998);
    expect(snapDecelerationRate(0.5)).toBe(0.99);
  });

  it('uses the Taylor branch above x = −0.5 and exp below', () => {
    const x = Math.log(0.998) * 1;
    expect(decayFactor(0.998, 1)).toBe(1 + x + (x * x) / 2);
    expect(decayFactor(0.998, 1000)).toBe(Math.exp(Math.log(0.998) * 1000));
  });

  it('one ms step: offset += v·rate·(1−e)/(1−rate); v *= e', () => {
    const [o, v] = decelerationStep(0, 1, 0.998, 1);
    const e = decayFactor(0.998, 1);
    expect(o).toBeCloseTo((0.998 * (1 - e)) / 0.002, 12);
    expect(v).toBe(e);
  });

  it('a 1000 pt/s fling travels ≈ 0.5 × release velocity and stops under 10 pt/s', () => {
    const p = new ScrollPhysics({ bounds: { min: 0, max: 100000 } });
    p.dragBegin();
    p.dragEnd(1000);
    run(p);
    expect(p.active).toBe(false);
    // total 499 pt minus the tail cut at |v| < 0.01 pt/ms (≈ 5 pt)
    expect(p.offset).toBeGreaterThan(490);
    expect(p.offset).toBeLessThan(499);
  });

  it('rate 0.99 travels ≈ v·0.099', () => {
    const p = new ScrollPhysics({ decelerationRate: 0.99, bounds: { min: 0, max: 100000 } });
    p.dragEnd(1000);
    run(p);
    expect(p.offset).toBeGreaterThan(97);
    expect(p.offset).toBeLessThan(99);
  });
});

describe('release velocity (§2)', () => {
  it('VelocityTracker = 0.2·latest + 0.8·previous', () => {
    const t = new VelocityTracker();
    t.add(0, 0);
    t.add(10, 10); // 1000 pt/s
    t.add(20, 30); // 2000 pt/s
    expect(t.velocity()).toBeCloseTo(0.2 * 2000 + 0.8 * 1000, 9);
  });

  it('release: 0.75·previous + 0.25·latest pan velocity; < 250 pt/s inside the bounds → 0', () => {
    const t = new VelocityTracker();
    t.add(0, 0);
    t.add(10, 10); // pan 1000
    t.add(20, 30); // pan 0.2·2000 + 0.8·1000 = 1200
    expect(t.releaseVelocity()).toBeCloseTo(0.75 * 1000 + 0.25 * 1200, 9);
    const slow = new VelocityTracker();
    slow.add(0, 0);
    slow.add(16, 2);
    slow.add(32, 4); // 125 pt/s
    expect(slow.releaseVelocity()).toBe(0);
    expect(slow.releaseVelocity(true)).toBeCloseTo(125, 9);
  });

  it('single sample returns it as-is', () => {
    const t = new VelocityTracker();
    t.add(0, 0);
    t.add(16, 8);
    expect(t.velocity()).toBeCloseTo(500, 9);
  });

  it('retarget rate = exp(−(v − c)/Δ), c = ±0.01, capped at 0.999', () => {
    expect(retargetDecelerationRate(1, 500)).toBeCloseTo(Math.exp(-0.99 / 500), 12);
    expect(retargetDecelerationRate(-1, -500)).toBeCloseTo(Math.exp(-0.99 / 500), 12);
    expect(retargetDecelerationRate(0.1, 500)).toBe(0.999);
  });

  it('a still release retargeted 20 pt away creeps at 0.01 pt/ms instead of stopping', () => {
    const p = new ScrollPhysics({ bounds: { min: 0, max: 1000 }, offset: 20 });
    p.dragEnd(0, () => 0);
    expect(p.velocity).toBeCloseTo((0.01 - 20 * -Math.log(0.985)) * 1000, 9); // SWE: c − Δ·ln 0.985
    for (let i = 0; i < 18; i++) p.step(1 / 60);
    expect(p.active).toBe(true);
    expect(Math.abs(p.velocity)).toBeLessThanOrEqual(10);
    run(p);
    expect(p.offset).toBe(0);
  });

  it('retargeted deceleration lands on the target', () => {
    const p = new ScrollPhysics({ bounds: { min: 0, max: 10000 } });
    p.dragEnd(2000, () => 800);
    run(p);
    expect(p.offset).toBe(800);
  });
});

describe('rubber band and bounce-back (§3)', () => {
  it('formula with c = 0.55', () => {
    const r = rubberBand(1100, 0, 1000, 956, 0.55);
    expect(r).toBeCloseTo(1000 + (1 - 1 / ((100 / 956) * 0.55 + 1)) * 956, 10);
    expect(rubberBand(-100, 0, 1000, 956, 0.55)).toBeCloseTo(-(1000 + (1 - 1 / ((100 / 956) * 0.55 + 1)) * 956 - 1000), 10);
    expect(rubberBand(500, 0, 1000, 956, 0.55)).toBe(500);
    // never exceeds one range
    expect(rubberBand(1e9, 0, 1000, 956, 0.55)).toBeLessThan(1956);
  });

  it('dragMove applies the rubber band', () => {
    const p = new ScrollPhysics({ bounds: { min: 0, max: 1000 }, viewportSize: 956 });
    p.dragBegin();
    expect(p.dragMove(-100)).toBeCloseTo(rubberBand(-100, 0, 1000, 956, 0.55), 10);
    expect(p.tracking).toBe(true);
    expect(p.unbandedOffset).toBeCloseTo(-100, 6);
  });

  it('released overshoot shrinks by exp(−0.01005·ms) (0.99 per ms)', () => {
    const p = new ScrollPhysics({ bounds: { min: 0, max: 1000 }, offset: -100 });
    p.dragEnd(0);
    p.step(1 / 60); // the release frame's update is skipped
    p.step(0.001);
    const e = decayFactor(Math.exp(-0.01005), 1);
    expect(p.offset).toBeCloseTo(-100 * e, 9);
    expect(e).toBeCloseTo(0.99, 5);
    run(p);
    expect(p.offset).toBe(0);
  });

  it('touch velocity entering a bounce is not clamped', () => {
    const p = new ScrollPhysics({ bounds: { min: 0, max: 1000 }, offset: 0 });
    p.dragEnd(-10000);
    p.step(1 / 60);
    p.step(0.001);
    expect(p.velocity).toBeLessThan(-9000);
    run(p);
    expect(p.offset).toBe(0);
  });

  it('bounces back after overshooting max', () => {
    const p = new ScrollPhysics({ bounds: { min: 0, max: 500 }, offset: 400 });
    p.dragEnd(2000);
    let peak = 0;
    let t = 0;
    while (p.active && t < 5) {
      p.step(1 / 120);
      peak = Math.max(peak, p.offset);
      t += 1 / 120;
    }
    expect(peak).toBeGreaterThan(500);
    expect(p.offset).toBe(500);
  });
});

describe('paging (§4)', () => {
  it('friction: 0.970795 at 400 pt, 0.971193 at 440 pt', () => {
    expect(pagingFriction(400)).toBeCloseTo(0.970795, 6);
    expect(pagingFriction(440)).toBeCloseTo(0.971193, 6);
    expect(pagingFriction(2000)).toBe(pagingFriction(1024));
  });

  it('spring pull: 0.000285227 at 400 pt, 0.000277841 at 440 pt', () => {
    expect(pagingSpringPull(400)).toBeCloseTo(0.000285227, 8);
    expect(pagingSpringPull(440)).toBeCloseTo(0.000277841, 8);
  });

  it('flick threshold 0.3 pt/ms, else nearest page', () => {
    expect(pagingTargetPage(0, 0.31, 440)).toBe(1);
    expect(pagingTargetPage(0, 0.29, 440)).toBe(0);
    expect(pagingTargetPage(230, 0, 440)).toBe(1);
    expect(pagingTargetPage(210, 0, 440)).toBe(0);
    expect(pagingTargetPage(440, -0.31, 440)).toBe(0);
    expect(pagingTargetPage(100, -0.31, 440)).toBe(0);
    expect(pagingTargetPage(500, -0.31, 440)).toBe(1);
  });

  it('a 400 pt/s flick from page 0 settles exactly on page 1', () => {
    const p = new ScrollPhysics({ paging: true, pageSize: 440, bounds: { min: 0, max: 1320 } });
    p.dragBegin();
    p.dragMove(40);
    p.dragEnd(400);
    run(p);
    expect(p.active).toBe(false);
    expect(p.offset).toBe(440);
  });

  it('a slow release before halfway returns to the page', () => {
    const p = new ScrollPhysics({ paging: true, pageSize: 440, bounds: { min: 0, max: 1320 } });
    p.dragMove(200);
    p.dragEnd(100);
    run(p);
    expect(p.offset).toBe(0);
  });
});

describe('programmatic scroll (§5)', () => {
  it('curve 0 is sin²(t·π/2)', () => {
    expect(uiAnimationCurve(0, 0.5)).toBeCloseTo(0.5, 12);
    expect(uiAnimationCurve(1, 1)).toBeCloseTo(1, 12);
    expect(uiAnimationCurve(2, 1)).toBeCloseTo(1, 12);
  });

  it('scrollTo runs 0.3 s', () => {
    const p = new ScrollPhysics({ bounds: { min: 0, max: 1000 } });
    p.scrollTo(300);
    p.step(0.15);
    expect(p.offset).toBeCloseTo(150, 6);
    p.step(0.15);
    expect(p.active).toBe(false);
    expect(p.offset).toBe(300);
  });
});

/**
 * iOS 27.0 simulator traces (uikit-internals/deep/demo-audit/scroll/raw, 60 Hz): UIKit's release state and every 6th
 * displayed offset after the release (1/3 pt rounded). `since` = last move → touch up (s).
 */
const NATIVE = [
  { name: 'fling 1150 pt/s (release step)', o: 10590, v: 1151.633, since: 0.015674, frames: 143, every6: [10609, 10709.667, 10792.333, 10859.667, 10915, 10960.333, 10997.333, 11027.667, 11052.667, 11073, 11089.667, 11103.333, 11114.333, 11123.333, 11131, 11137, 11142, 11146.333, 11149.667, 11152.333, 11154.667, 11156.333, 11158, 11159, 11159.667] },
  { name: 'fling 2660 pt/s', o: 10690, v: 2657, since: 0, frames: 169, every6: [10690, 10930.667, 11127.333, 11288.667, 11420.333, 11528.333, 11617, 11689.333, 11748.667, 11797, 11836.667, 11869.333, 11895.667, 11917.667, 11935.333, 11950, 11962, 11971.667, 11979.667, 11986.333, 11991.667, 11996, 11999.667, 12002.667, 12005, 12007, 12008.667, 12010, 12011] },
  { name: 'fling 6600 pt/s (release step)', o: 10790, v: 6591.711, since: 0.017737, frames: 195, every6: [10898, 11475, 11947.333, 12334, 12650.667, 12910, 13122, 13295.667, 13437.667, 13554, 13649.333, 13727.333, 13791.333, 13843.333, 13886.333, 13921.333, 13950, 13973.333, 13992.667, 14008.333, 14021.333, 14031.667, 14040.333, 14047.333, 14053.333, 14058, 14061.667, 14065, 14067.667, 14069.667, 14071.333, 14073, 14074, 14074.333] },
  { name: 'fling 6100 pt/s into the end (bounce)', o: 28590, v: 6105, since: 0.016667, frames: 55, every6: [28690, 29170, 29202.667, 29136.333, 29088, 29063.333, 29052, 29047.333, 29045.333, 29044] },
  { name: 'rubber band release at −175', o: -175.333333, v: -1293.361, since: 0, frames: 45, every6: [-175.333, -107.667, -52.667, -23.333, -9.667, -4, -1.667, -0.667, 0] },
  { name: 'fling 3480 pt/s into the top', o: 510, v: -3479, since: 0, frames: 57, every6: [510, 195, -48.333, -77.667, -46.667, -22.667, -10, -4, -1.667, -0.667, 0] },
];

/** Large-title detent snaps (raw/testNav*.jsonl, offsets from the rest offset, every frame or every 6th for flings). */
const NATIVE_RETARGET = [
  { name: 'still release at 20 → 0 (creep)', o: 20, v: 0, since: 0.816666, target: 0, frames: 25, every: 1, shown: [20, 15.667, 12.333, 10, 8, 6.333, 5, 4.333, 3.333, 3, 2.333, 2, 1.667, 1.667, 1.333, 1.333, 1, 1, 0.667, 0.667, 0.667, 0.333, 0.333, 0, 0] },
  { name: 'still release at 40 → 52', o: 40, v: 0, since: 0.816667, target: 52, frames: 14, every: 1, shown: [40, 42.667, 45, 46.667, 48, 49, 49.667, 50.333, 51, 51.333, 51.667, 51.667, 52, 52] },
  { name: 'fling −329 pt/s projected to 29 → 52 (shortened)', o: 188.666667, v: -328.999, since: 0.016667, target: 52, frames: 91, every: 6, shown: [183.333, 155, 132.667, 115, 101, 90, 81.333, 74.333, 68.667, 64.333, 61, 58.333, 56, 54.333, 53, 52] },
  { name: 'fling −329 pt/s projected to 11 → 0 (lengthened)', o: 170.666667, v: -328.999, since: 0.016667, target: 0, frames: 108, every: 6, shown: [165, 134, 109, 88.333, 71.333, 57.667, 46.333, 37, 29.333, 23.333, 18, 14, 10.667, 7.667, 5.333, 3.667, 2, 0.667, 0] },
];

describe('matches UIKit frame by frame (simulator traces)', () => {
  for (const n of NATIVE_RETARGET) {
    it(`retarget: ${n.name}`, () => {
      const p = new ScrollPhysics({ bounds: { min: 0, max: 1884.333 }, viewportSize: 956, offset: n.o, pixelRatio: 3 });
      p.dragBegin();
      p.offset = n.o;
      p.dragEnd(n.v, () => n.target, n.since);
      const shown: number[] = [];
      for (let i = 0; i < n.frames; i++) {
        p.step(1 / 60);
        if (i % n.every === 0 || i === n.frames - 1) shown.push(p.displayOffset);
      }
      shown.forEach((o, i) => expect(Math.abs(o - n.shown[i]!)).toBeLessThanOrEqual(0.01));
      expect(p.active).toBe(false);
    });
  }

  it('drag back through the edge while stretched follows the rubber band of the translation (no reversal for touch)', () => {
    // testReversal#0: [pan translation, UIKit offset] from offset 0, down past the top and back up through it.
    const samples = [[7.666667, -4.333333], [68, -36], [135.666667, -69.333333], [204.666667, -100.666667], [269.333333, -128.333333], [321.666667, -149.333333], [285.666667, -135], [212.666667, -104.333333], [133, -68], [50.666667, -27], [-30.666667, 30.666667], [-107.666667, 107.666667], [-174.333333, 174.333333]];
    const p = new ScrollPhysics({ bounds: { min: 0, max: 29044 }, viewportSize: 956, pixelRatio: 3 });
    p.dragBegin();
    for (const [tr, off] of samples) {
      p.dragMove(-tr!);
      expect(p.displayOffset).toBeCloseTo(off!, 3);
    }
  });

  for (const n of NATIVE) {
    it(n.name, () => {
      const p = new ScrollPhysics({ bounds: { min: 0, max: 29044 }, viewportSize: 956, offset: n.o, pixelRatio: 3 });
      p.dragBegin();
      p.offset = n.o;
      p.dragEnd(n.v, undefined, n.since);
      const shown: number[] = [];
      for (let i = 0; i < n.frames; i++) {
        p.step(1 / 60);
        if (i % 6 === 0 || i === n.frames - 1) shown.push(p.displayOffset);
      }
      shown.forEach((o, i) => expect(Math.abs(o - n.every6[i]!)).toBeLessThanOrEqual(0.34));
      expect(p.active).toBe(false);
    });
  }

  it('release velocity from the touch stream (fling 1150 pt/s)', () => {
    const touches = [[0, 800], [83.333, 781.333333], [100, 759.666667], [116.666, 736.333333], [133.333, 711.666667], [150, 685.666667], [166.666, 659], [183.333, 631.666667], [200, 603.666667], [216.666, 575.333333], [233.333, 546.666667], [250, 518.333333], [266.666, 489.666667], [282.514, 461], [316.666, 404.666667], [350, 350], [382.781, 298.666667], [416.666, 252], [433.333, 231.666667], [449.672, 214], [466.666, 200]];
    const t = new VelocityTracker();
    for (const [ms, y] of touches) t.add(ms!, y!);
    expect(-t.releaseVelocity()).toBeCloseTo(1151.633, 0);
  });

  it('drag rubber band: 290 → −136.667, 390 → −175.333 (c 0.55, range 956)', () => {
    expect(Math.round(rubberBand(-290, 0, 29044, 956, 0.55) * 3) / 3).toBeCloseTo(-136.667, 3);
    expect(Math.round(rubberBand(-390, 0, 29044, 956, 0.55) * 3) / 3).toBeCloseTo(-175.333, 3);
  });
});
