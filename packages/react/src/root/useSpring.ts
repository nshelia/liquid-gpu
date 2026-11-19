import { useLayoutEffect, useRef } from 'react';
import { Spring, springs, type SpringParams, type SpringPresetName } from '@liquid-gpu/core';
import { useLiquid, type LiquidContextValue } from './context';

export interface SpringSetOptions {
  /** Switch parameters for this segment (e.g. tracking → release). */
  params?: SpringParams | SpringPresetName;
  /** Explicit start velocity in units/s (gesture hand-off). */
  velocity?: number;
}

/**
 * Imperative handle around a core `Spring` driven by the root `Animator`. Changing it never re-renders React:
 * subscribers run inside the animation frame and should write layer/glass/DOM state directly.
 */
export interface SpringHandle {
  readonly spring: Spring;
  readonly value: number;
  readonly velocity: number;
  readonly target: number;
  readonly settled: boolean;
  /** Animate to `target` (retarget keeps velocity; the preset's impulse kick applies). */
  set(target: number, opts?: SpringSetOptions): void;
  /** Jump without motion; subscribers run once. */
  snap(value: number): void;
  /** Called after every step (and after `snap`). Returns an unsubscribe. */
  subscribe(fn: (value: number, s: Spring) => void): () => void;
  /** Stop driving the spring (called automatically on unmount for `useSpring`). */
  dispose(): void;
}

export function resolvePreset(p: SpringParams | SpringPresetName): SpringParams {
  return typeof p === 'string' ? springs[p] : p;
}

/**
 * Create a spring handle outside of a hook (for components that need a variable number of springs).
 * Call `dispose()` when done.
 */
export function createSpring(
  ctx: Pick<LiquidContextValue, 'animator' | 'requestFrame' | 'spring'>,
  initial: number,
  preset: SpringParams | SpringPresetName,
): SpringHandle {
  const spring = new Spring(initial, ctx.spring(resolvePreset(preset)));
  const listeners = new Set<(v: number, s: Spring) => void>();
  const notify = () => {
    for (const fn of listeners) fn(spring.value, spring);
    ctx.requestFrame();
  };
  // Added to the Animator lazily on the first `set` (a spring that never moves costs nothing).
  let remove: (() => void) | null = null;
  const handle: SpringHandle = {
    spring,
    get value() {
      return spring.value;
    },
    get velocity() {
      return spring.velocity;
    },
    get target() {
      return spring.target;
    },
    get settled() {
      return spring.settled;
    },
    set(target, opts = {}) {
      if (!remove) remove = ctx.animator.add(spring, notify);
      const params = opts.params ? ctx.spring(resolvePreset(opts.params)) : undefined;
      spring.setTarget(target, { params, velocity: opts.velocity });
      if (!spring.settled) ctx.animator.wake();
      else notify();
    },
    snap(value) {
      spring.snap(value);
      notify();
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    dispose() {
      remove?.();
      remove = null;
      listeners.clear();
    },
  };
  return handle;
}

/**
 * `useSpring(initial, preset, onChange?)`: a core `Spring` stepped by the root Animator.
 * `onChange` (latest closure) runs inside the frame after every step; no React state is involved.
 */
export function useSpring(
  initial: number,
  preset: SpringParams | SpringPresetName,
  onChange?: (value: number, s: Spring) => void,
): SpringHandle {
  const ctx = useLiquid();
  const ref = useRef<SpringHandle | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;
  if (!ref.current) ref.current = createSpring(ctx, initial, preset);
  const handle = ref.current;
  useLayoutEffect(() => {
    const h = handle;
    const unsub = h.subscribe((v, s) => cb.current?.(v, s));
    return () => {
      unsub();
      // Removed from the Animator until the next `set` (keeps StrictMode's unmount/remount working).
      h.dispose();
    };
  }, [handle]);
  return handle;
}
