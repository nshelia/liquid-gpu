import { describe, expect, it } from 'vitest';
import {
  Animator,
  Spring,
  SpringVec,
  springCoefficients,
  springFromDurationBounce,
  springFromStiffnessDamping,
  springs,
  stepSpringClosedForm,
  type SpringParams,
} from '../src/springs';

const kc = (p: SpringParams) => springCoefficients(p);

describe('preset k/c (findings/transitions.md conversion table)', () => {
  const cases: [keyof typeof springs, number, number][] = [
    ['push', 438.65, 41.89],
    ['navInteractiveFinish', 438.65, 35.6],
    ['navTracking', 6168.5, 133.52],
    ['defaultTracking', 1754.6, 72.05],
    ['sheet', 333.33, 36.51],
    ['sheetHighSpeed', 333.33, 29.21],
    ['sheetBoundary', 3947.84, 125.66],
    ['zoomIn', 341.51, 36.96],
    ['zoomInShowcase', 341.51, 31.42],
    ['zoomOut', 341.51, 34.0],
    ['zoomOutInteractive', 246.74, 31.42],
    ['zoomOutInteractiveTransform', 223.8, 23.94],
    ['zoomOutInteractivePosition', 194.96, 22.9],
    ['zoomCancel', 631.65, 50.27],
    ['zoomCornerRadius', 322.27, 35.9],
    ['zoomDismissUpdate', 986.96, 62.83],
    ['alert', 522.35, 45.71],
    ['contextMenuGravityWell', 246.74, 18.85],
    ['contextMenuPresent', 385.53, 31.42],
    ['contextMenuDismiss', 322.27, 30.52],
    ['minimizeCollapseIntermediate', 304.62, 25.13],
    ['minimizeCollapse', 223.8, 22.74],
    ['minimizeExpandIntermediate', 438.65, 30.16],
    ['minimizeExpand', 304.62, 25.13],
    ['scrollAwayTracking', 3947.8, 100.53],
    ['scrollAwayHintReset', 438.65, 33.51],
    ['scrollAwayProgress', 157.91, 20.11],
    ['titleTransition', 322.27, 35.9],
    ['switchKnob', 438.65, 41.89], // MO §1 legacy knob spring k 438.65
    ['switchTrackOff', 246.74, 31.42],
    ['smooth', 157.9137, 25.1327], // SM §1 / TV: smooth stiffness 157.9137 damping 25.1327
    ['snappy', 157.9137, 21.3628], // TV §b snappy damping 21.3628
    ['bouncy', 157.9137, 17.5929], // TV §b bouncy damping 17.5929
  ];
  for (const [name, k, c] of cases) {
    it(`${name}: k ${k}, c ${c}`, () => {
      const { stiffness, damping } = kc(springs[name]);
      expect(stiffness).toBeCloseTo(k, 0);
      expect(Math.abs(stiffness - k) / k).toBeLessThan(5e-4);
      expect(damping).toBeCloseTo(c, 1);
    });
  }

  it('context-menu commit: 0.5 s damping 0.7 v0 15 → k 267.11 c 22.88 (ζ 0.70, 0.384 s)', () => {
    const p = springs.contextMenuCommit;
    expect(kc(p).stiffness).toBeCloseTo(267.11, 2);
    expect(kc(p).damping).toBeCloseTo(22.881, 3);
    expect(p.dampingRatio).toBeCloseTo(0.7, 2);
    expect(p.response).toBeCloseTo(0.384, 3);
    expect(p.initialVelocity).toBe(15);
  });

  it('context-menu centre: 0.35 s ζ 1 → k 695.97 c 52.76 (0.238 s)', () => {
    const p = springs.contextMenuCommitCentre;
    expect(p.dampingRatio).toBeCloseTo(1, 2);
    expect(p.response).toBeCloseTo(0.238, 3);
  });

  it('swipe delete springs (gestures §1)', () => {
    expect(springs.swipeDeleteButton.dampingRatio).toBeCloseTo(1, 2);
    expect(springs.swipeDeleteButton.response).toBeCloseTo(0.278, 3);
    expect(springs.swipeDeleteRow.response).toBeCloseTo(0.272, 3);
    expect(springs.swipeDeleteFade.response).toBeCloseTo(0.34, 3);
  });

  it('named contract presets', () => {
    expect(springs.interactive).toEqual({ dampingRatio: 0.85, response: 0.15 });
    expect(springs.push).toEqual({ dampingRatio: 1, response: 0.3, impulse: 0.02 });
    expect(springs.menuOpen).toEqual({ dampingRatio: 0.75, response: 0.35 });
    expect(springs.menuClose).toEqual({ dampingRatio: 0.8, response: 0.49 });
    expect(springs.switchKnob).toEqual({ dampingRatio: 1, response: 0.3 });
  });

  it('round-trips stiffness/damping', () => {
    const p = springFromStiffnessDamping(522.35, 45.71);
    expect(p.dampingRatio).toBeCloseTo(1, 3);
    expect(p.response).toBeCloseTo(0.2749, 4);
  });
});

describe('springFromDurationBounce (swiftui-motion §2)', () => {
  it('(0.5, 0) → k 157.91, c 25.13', () => {
    const { stiffness, damping } = kc(springFromDurationBounce(0.5, 0));
    expect(stiffness).toBeCloseTo(157.91, 2);
    expect(damping).toBeCloseTo(25.13, 2);
  });
  it('(0.3, 0.2) → k 438.65, c 33.51 (scroll-motion-gestures §6)', () => {
    const { stiffness, damping } = kc(springFromDurationBounce(0.3, 0.2));
    expect(stiffness).toBeCloseTo(438.65, 2);
    expect(damping).toBeCloseTo(33.51, 2);
  });
  it('bounce 0.15 / 0.30 → ζ 0.85 / 0.7', () => {
    expect(springFromDurationBounce(0.5, 0.15).dampingRatio).toBeCloseTo(0.85, 10);
    expect(springFromDurationBounce(0.5, 0.3).dampingRatio).toBeCloseTo(0.7, 10);
  });
  it('negative bounce: ζ = 1/(1+bounce); −0.5 → ζ 2', () => {
    expect(springFromDurationBounce(0.5, -0.5).dampingRatio).toBe(2);
    expect(springFromDurationBounce(0.5, -0.5).response).toBe(0.5);
  });
  it('bounce > 1 clamps to ζ 0; bounce ≤ −1 → ζ ∞', () => {
    expect(springFromDurationBounce(0.5, 1.5).dampingRatio).toBe(0);
    expect(springFromDurationBounce(0.5, -1).dampingRatio).toBe(Infinity);
  });
});

describe('retarget impulse (glass-render §1)', () => {
  it('push kick: v0 = 8.77 × distance per second', () => {
    const s = new Spring(0, springs.push);
    s.setTarget(440);
    expect(s.velocity / 440).toBeCloseTo(8.77, 2);
  });
  it('zoom-in kick: 5.46 × distance per second', () => {
    const s = new Spring(0, springs.zoomIn);
    s.setTarget(100);
    expect(s.velocity / 100).toBeCloseTo(5.46, 2);
  });
  it('no impulse without impulse param; explicit velocity is kept', () => {
    const s = new Spring(0, springs.sheet);
    s.setTarget(100, { velocity: -50 });
    expect(s.velocity).toBe(-50);
  });
  it('initialVelocity is normalised to the distance', () => {
    const s = new Spring(10, springs.contextMenuCommit);
    s.setTarget(110);
    expect(s.velocity).toBeCloseTo(1500, 6);
  });
  it('target setter applies the impulse', () => {
    const s = new Spring(0, springs.push);
    s.target = 100;
    expect(s.velocity).toBeCloseTo(877.3, 0);
  });
});

describe('closed-form solver', () => {
  function verlet(d0: number, v0: number, t: number, z: number, response: number): number {
    const w = (2 * Math.PI) / response;
    const k = w * w;
    const c = 2 * z * w;
    const h = 1e-5;
    let x = d0;
    let v = v0;
    let F = -k * x - c * v;
    for (let s = 0; s < Math.round(t / h); s++) {
      v += (F * h) / 2;
      x += v * h;
      F = -c * v - k * x;
      v += (F * h) / 2;
    }
    return x;
  }

  for (const z of [0.375, 0.85, 1, 2]) {
    it(`matches a fine integrator at ζ ${z}`, () => {
      const [d] = stepSpringClosedForm(100, 300, 0.2, z, 0.4);
      expect(d).toBeCloseTo(verlet(100, 300, 0.2, z, 0.4), 2);
    });
  }

  it('is independent of the step size', () => {
    const a = new Spring(0, springs.bouncy);
    const b = new Spring(0, springs.bouncy);
    a.setTarget(200);
    b.setTarget(200);
    a.step(0.3);
    for (let i = 0; i < 30; i++) b.step(0.01);
    expect(a.value).toBeCloseTo(b.value, 9);
    expect(a.velocity).toBeCloseTo(b.velocity, 7);
  });

  it('settles and snaps to the target', () => {
    const s = new Spring(0, springs.default);
    s.setTarget(1);
    for (let i = 0; i < 300 && !s.settled; i++) s.step(1 / 120);
    expect(s.settled).toBe(true);
    expect(s.value).toBe(1);
  });

  it('SpringVec steps each dimension like Spring', () => {
    const v = new SpringVec([0, 10], springs.snappy);
    const s = new Spring(0, springs.snappy);
    v.setTarget([50, 10]);
    s.setTarget(50);
    v.step(0.1);
    s.step(0.1);
    expect(v.value[0]).toBeCloseTo(s.value, 10);
    expect(v.value[1]).toBe(10);
  });
});

describe('Animator', () => {
  function fakeFrames() {
    let cb: ((t: number) => void) | null = null;
    let now = 0;
    return {
      opts: {
        requestFrame: (f: (t: number) => void) => {
          cb = f;
          return 1;
        },
        cancelFrame: () => {
          cb = null;
        },
      },
      pump(ms: number): boolean {
        const f = cb;
        if (!f) return false;
        cb = null;
        now += ms;
        f(now);
        return true;
      },
      get pending() {
        return cb !== null;
      },
    };
  }

  it('runs one loop while springs move and idles once all are settled', () => {
    const frames = fakeFrames();
    const animator = new Animator(frames.opts);
    const s = new Spring(0, springs.switchKnob);
    let frameCount = 0;
    animator.onFrame(() => frameCount++);
    animator.animate(s, 22);
    let n = 0;
    while (frames.pump(1000 / 120) && n < 1000) n++;
    expect(s.settled).toBe(true);
    expect(s.value).toBe(22);
    expect(frames.pending).toBe(false);
    expect(animator.running).toBe(false);
    expect(frameCount).toBe(n);
    animator.animate(s, 0);
    expect(animator.running).toBe(true);
  });

  it('hold keeps the loop alive', () => {
    const frames = fakeFrames();
    const animator = new Animator(frames.opts);
    const release = animator.hold();
    for (let i = 0; i < 5; i++) expect(frames.pump(16)).toBe(true);
    release();
    frames.pump(16);
    expect(frames.pending).toBe(false);
  });

  it('keeps real dt when a callback wakes the loop during a tick (retargeting from onUpdate)', () => {
    const frames = fakeFrames();
    const animator = new Animator(frames.opts);
    const a = new Spring(0, springs.switchKnob);
    const b = new Spring(0, springs.switchKnob);
    const dts: number[] = [];
    animator.onFrame((dt) => dts.push(dt));
    // a's update retargets b and wakes the animator from inside the tick.
    animator.add(a, () => animator.animate(b, a.value * 2));
    animator.animate(a, 10);
    for (let i = 0; i < 400 && frames.pump(10); i++);
    expect(dts.slice(1, 5).every((dt) => Math.abs(dt - 0.01) < 1e-9)).toBe(true);
    expect(a.value).toBe(10);
    expect(b.value).toBe(20);
    expect(frames.pending).toBe(false);
  });

  it('a wake from an onFrame callback schedules the next frame', () => {
    const frames = fakeFrames();
    const animator = new Animator(frames.opts);
    let woke = false;
    animator.onFrame(() => {
      if (!woke) {
        woke = true;
        animator.wake();
      }
    });
    animator.wake();
    expect(frames.pump(16)).toBe(true);
    expect(frames.pending).toBe(true);
    frames.pump(16);
    expect(frames.pending).toBe(false);
  });
});
