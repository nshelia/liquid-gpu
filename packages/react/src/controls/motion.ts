/**
 * Spring helpers for controls / menus / transitions, on the root's shared `Animator` (one rAF loop).
 *
 * `useMotion` / `createMotion` used to run a private rAF loop to dodge the core Animator double-schedule
 * (packages/react/COORDINATION.md §1). That is fixed in core (`Animator.wake` defers while ticking; see
 * packages/core/test/animator-schedule.test.ts), so they are now the root `useSpring` / `createSpring`: same
 * `SpringHandle` shape, springs adjusted for `prefers-reduced-motion` through `ctx.spring`, and subscribers run inside
 * the frame (no frame of latency between stepping and drawing).
 */
import type { Animatable } from '@liquid-gpu/core';
import { createSpring, useSpring, type LiquidContextValue } from '../root';

type Ctx = Pick<LiquidContextValue, 'animator' | 'requestFrame' | 'spring'>;

/**
 * Keep frames coming (time-based animations, per-frame DOM writes in `onBeforeFrame`) until released: every
 * Animator tick marks the scene dirty, so the root draws (and runs `onBeforeFrame`) each frame.
 */
export function holdFrames(ctx: Ctx): () => void {
  const pump: Animatable = {
    settled: false,
    step() {
      ctx.requestFrame();
    },
  };
  const remove = ctx.animator.add(pump);
  ctx.requestFrame();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    remove();
  };
}

/** The root `createSpring` (kept under this name for existing call sites). */
export const createMotion = createSpring;

/** The root `useSpring` (kept under this name for existing call sites). `onChange` runs after every step. */
export const useMotion = useSpring;

/**
 * Release velocity from a core `VelocityTracker`, zeroed when the finger rested before lifting (UIKit reports ≈0 for a
 * held release). TODO(unknown): UIKit's exact staleness window; 50 ms is used.
 */
export function releaseVelocity(v: number, lastMoveMs: number, releaseMs: number): number {
  return releaseMs - lastMoveMs > 50 ? 0 : v;
}
