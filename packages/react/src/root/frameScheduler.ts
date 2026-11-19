/**
 * requestAnimationFrame wrapper for the root Animator.
 *
 * Chrome 157 with HTML-in-Canvas can run rAF callbacks again inside the same rendering update (same timestamp) when
 * the previous callback touched the drawable canvas (geometry updates / paint requests). An animation that keeps
 * requesting frames then never yields (observed: endless dt = 0 ticks). A frame requested from inside a rAF
 * callback runs normally on the next frame; only a callback that arrives with the same timestamp as the previous one
 * (re-entered update) is pushed through a macrotask to the next real vsync.
 */
export function createFrameScheduler(): {
  requestFrame: (cb: (now: number) => void) => number;
  cancelFrame: (id: number) => void;
} {
  let seq = 0;
  let lastStamp = -1;
  const pending = new Map<number, { raf?: number; timer?: ReturnType<typeof setTimeout> }>();
  const run = (id: number, cb: (now: number) => void) => (t: number) => {
    pending.delete(id);
    if (t === lastStamp) {
      // Same update as the previous callback: push to the next frame.
      schedule(id, cb, true);
      return;
    }
    lastStamp = t;
    cb(t);
  };
  const schedule = (id: number, cb: (now: number) => void, viaTask: boolean) => {
    const entry: { raf?: number; timer?: ReturnType<typeof setTimeout> } = {};
    pending.set(id, entry);
    if (viaTask) {
      entry.timer = setTimeout(() => {
        entry.timer = undefined;
        entry.raf = requestAnimationFrame(run(id, cb));
      }, 0);
    } else entry.raf = requestAnimationFrame(run(id, cb));
  };
  return {
    requestFrame(cb) {
      const id = ++seq;
      schedule(id, cb, false);
      return id;
    },
    cancelFrame(id) {
      const e = pending.get(id);
      if (!e) return;
      if (e.timer !== undefined) clearTimeout(e.timer);
      if (e.raf !== undefined) cancelAnimationFrame(e.raf);
      pending.delete(id);
    },
  };
}
