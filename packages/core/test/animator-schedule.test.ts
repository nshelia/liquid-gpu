import { describe, expect, it } from 'vitest';
import { Animator, Spring, springs } from '../src/springs';

/**
 * Regression for COORDINATION.md §1: `Animator.wake()` called from inside a tick (a spring's onUpdate retargets
 * another spring and requests a frame) used to schedule a second rAF next to the end-of-tick one, so the number of
 * pending frames doubled every vsync. This fake keeps a real queue (every `requestFrame` call is kept, like rAF),
 * so a double schedule shows up as two pending callbacks.
 */
function frameQueue() {
  let queue: { id: number; cb: (t: number) => void }[] = [];
  let nextId = 1;
  let now = 0;
  let requestsThisTick = 0;
  const maxRequestsPerTick: number[] = [];
  return {
    opts: {
      requestFrame: (cb: (t: number) => void) => {
        requestsThisTick++;
        const id = nextId++;
        queue.push({ id, cb });
        return id;
      },
      cancelFrame: (id: number) => {
        queue = queue.filter((q) => q.id !== id);
      },
    },
    /** One vsync: runs every callback queued before it (callbacks queued during it wait for the next one). */
    tick(ms: number): number {
      const run = queue;
      queue = [];
      now += ms;
      requestsThisTick = 0;
      for (const q of run) q.cb(now);
      maxRequestsPerTick.push(requestsThisTick);
      return run.length;
    },
    get pending() {
      return queue.length;
    },
    maxRequestsPerTick,
  };
}

describe('Animator scheduling (one pending frame per tick)', () => {
  it('a spring whose onUpdate retargets another and wakes the loop keeps one pending frame and advances both', () => {
    const frames = frameQueue();
    const animator = new Animator(frames.opts);
    const a = new Spring(0, springs.default);
    const b = new Spring(0, springs.switchKnob);
    // Mirrors the root's `createSpring` notify → `requestFrame()` → `animator.wake()` inside the tick.
    animator.add(b, () => animator.wake());
    animator.add(a, () => {
      b.setTarget(a.value * 3);
      animator.wake();
    });
    a.setTarget(100);
    animator.wake();
    expect(frames.pending).toBe(1);

    const aValues: number[] = [];
    const bValues: number[] = [];
    let ticks = 0;
    while (frames.pending > 0 && ticks < 2000) {
      const ran = frames.tick(1000 / 120);
      ticks++;
      expect(ran).toBe(1);
      expect(frames.pending).toBeLessThanOrEqual(1);
      aValues.push(a.value);
      bValues.push(b.value);
    }
    expect(frames.maxRequestsPerTick.every((n) => n <= 1)).toBe(true);
    // Values advance (no dt = 0 ticks): strictly increasing over the first frames after the first one (dt 0).
    for (let i = 2; i < 10; i++) {
      expect(aValues[i]!).toBeGreaterThan(aValues[i - 1]!);
      expect(bValues[i]!).toBeGreaterThan(bValues[i - 1]!);
    }
    expect(a.settled && b.settled).toBe(true);
    expect(a.value).toBe(100);
    expect(b.value).toBe(300);
    expect(animator.running).toBe(false);
    // ζ 1, response 0.5 settles in well under 3 s at 120 Hz.
    expect(ticks).toBeLessThan(360);
  });

  it('wakes from onFrame callbacks and repeated wakes within one tick still schedule a single frame', () => {
    const frames = frameQueue();
    const animator = new Animator(frames.opts);
    const s = new Spring(0, springs.switchKnob);
    animator.add(s, () => {
      animator.wake();
      animator.wake();
    });
    animator.onFrame(() => animator.wake());
    animator.animate(s, 1);
    for (let i = 0; i < 30; i++) {
      frames.tick(16);
      expect(frames.pending).toBe(1); // onFrame always wakes, so exactly one
    }
    expect(frames.maxRequestsPerTick.every((n) => n <= 1)).toBe(true);
    expect(s.value).toBeGreaterThan(0.9);
  });

  it('a wake from outside a tick while a frame is pending does not add another', () => {
    const frames = frameQueue();
    const animator = new Animator(frames.opts);
    animator.wake();
    animator.wake();
    animator.animate(new Spring(0, springs.default), 1);
    expect(frames.pending).toBe(1);
  });
});
