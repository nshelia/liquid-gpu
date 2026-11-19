/**
 * A small gesture arena so nested recognizers (row swipe ⊂ scroll view ⊂ screen pop ⊂ sheet) can decide who owns a
 * pointer, the way UIKit gesture recognizers fail or begin.
 *
 * Rules:
 * - Components call `arena.track(event, recognizer)` from a native `pointerdown` listener. Because the event bubbles
 *   from the target outwards, candidates are registered innermost first.
 * - On each move every undecided candidate is asked to `decide`. A candidate may claim only when every candidate
 *   registered before it has failed (UIKit's `require(toFail:)`); a candidate that says `wait` blocks the ones after it.
 * - When one claims, every other candidate gets `onCancel`. If the pointer goes up with no claim, the survivors get
 *   `onTap` (a tap).
 * - After a claimed gesture the next `click` is swallowed, so a drag never also activates a button.
 *
 * Window listeners are used instead of pointer capture: in Chrome 157 capturing a pointer on a drawable element
 * retargets the following click to that element (see packages/gpu report, quirks).
 */

export type GestureDecision = 'claim' | 'wait' | 'fail';

export interface GestureSample {
  /** Movement since pointer-down, CSS px (= pt). */
  dx: number;
  dy: number;
  /** Pointer-down position in client (= canvas) coordinates. */
  startX: number;
  startY: number;
  /** Seconds since pointer-down. */
  t: number;
  event: PointerEvent;
}

export interface GestureRecognizer {
  /** Asked on every move until it claims or fails. */
  decide(s: GestureSample): GestureDecision;
  /** This recognizer won. `s` is the sample that made it claim; `onMove` follows immediately with the same event. */
  onBegin?(s: GestureSample): void;
  onMove?(s: GestureSample): void;
  /** Pointer up (cancelled = pointercancel / arena reset) after this recognizer claimed. */
  onEnd?(s: GestureSample, cancelled: boolean): void;
  /** Another recognizer won, or this one failed. */
  onCancel?(): void;
  /** Pointer up with no claim and this recognizer still undecided: a tap. */
  onTap?(s: GestureSample): void;
  /** After a claimed gesture the next click is swallowed unless this returns true (e.g. released inside a button). */
  keepClick?(s: GestureSample): boolean;
}

interface Session {
  pointerId: number;
  startX: number;
  startY: number;
  t0: number;
  candidates: GestureRecognizer[];
  failed: Set<GestureRecognizer>;
  winner: GestureRecognizer | null;
}

export class GestureArena {
  private sessions = new Map<number, Session>();
  private suppressClickUntil = 0;
  private attached = false;

  /** Register a candidate for the pointer in `e` (call from a native pointerdown listener). */
  track(e: PointerEvent, r: GestureRecognizer): void {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    this.attach();
    let s = this.sessions.get(e.pointerId);
    if (!s || s.t0 !== e.timeStamp) {
      if (s) this.cancelSession(s);
      s = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        t0: e.timeStamp,
        candidates: [],
        failed: new Set(),
        winner: null,
      };
      this.sessions.set(e.pointerId, s);
    }
    if (!s.candidates.includes(r)) s.candidates.push(r);
  }

  /** Claim immediately (e.g. a touch that catches a decelerating scroll view). */
  claim(e: PointerEvent, r: GestureRecognizer): void {
    const s = this.sessions.get(e.pointerId);
    if (!s || s.winner) return;
    if (!s.candidates.includes(r)) s.candidates.push(r);
    this.win(s, r, this.sample(s, e));
  }

  /** True while some recognizer owns pointer `id`. */
  isClaimed(id: number): boolean {
    return !!this.sessions.get(id)?.winner;
  }

  /** Cancel every live session (e.g. on unmount). */
  reset(): void {
    for (const s of this.sessions.values()) this.cancelSession(s);
    this.sessions.clear();
  }

  destroy(): void {
    this.reset();
    if (!this.attached) return;
    this.attached = false;
    window.removeEventListener('pointermove', this.onMove, true);
    window.removeEventListener('pointerup', this.onUp, true);
    window.removeEventListener('pointercancel', this.onCancelEv, true);
    window.removeEventListener('click', this.onClick, true);
  }

  private attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    window.addEventListener('pointermove', this.onMove, true);
    window.addEventListener('pointerup', this.onUp, true);
    window.addEventListener('pointercancel', this.onCancelEv, true);
    window.addEventListener('click', this.onClick, true);
  }

  private sample(s: Session, e: PointerEvent): GestureSample {
    return {
      dx: e.clientX - s.startX,
      dy: e.clientY - s.startY,
      startX: s.startX,
      startY: s.startY,
      t: (e.timeStamp - s.t0) / 1000,
      event: e,
    };
  }

  private win(s: Session, r: GestureRecognizer, sample: GestureSample): void {
    s.winner = r;
    for (const c of s.candidates) if (c !== r && !s.failed.has(c)) c.onCancel?.();
    r.onBegin?.(sample);
    r.onMove?.(sample);
  }

  private readonly onMove = (e: PointerEvent): void => {
    const s = this.sessions.get(e.pointerId);
    if (!s) return;
    const sample = this.sample(s, e);
    if (s.winner) {
      s.winner.onMove?.(sample);
      return;
    }
    for (const c of s.candidates) {
      if (s.failed.has(c)) continue;
      const d = c.decide(sample);
      if (d === 'fail') {
        s.failed.add(c);
        c.onCancel?.();
        continue;
      }
      if (d === 'wait') return;
      this.win(s, c, sample);
      return;
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const s = this.sessions.get(e.pointerId);
    if (!s) return;
    this.sessions.delete(e.pointerId);
    const sample = this.sample(s, e);
    if (s.winner) {
      if (!s.winner.keepClick?.(sample)) this.suppressClickUntil = performance.now() + 400;
      s.winner.onEnd?.(sample, false);
      return;
    }
    for (const c of s.candidates) if (!s.failed.has(c)) c.onTap?.(sample);
  };

  private readonly onCancelEv = (e: PointerEvent): void => {
    const s = this.sessions.get(e.pointerId);
    if (!s) return;
    this.sessions.delete(e.pointerId);
    if (s.winner) s.winner.onEnd?.(this.sample(s, e), true);
    else for (const c of s.candidates) if (!s.failed.has(c)) c.onCancel?.();
  };

  private cancelSession(s: Session): void {
    if (s.winner) s.winner.onCancel?.();
    else for (const c of s.candidates) if (!s.failed.has(c)) c.onCancel?.();
  }

  private readonly onClick = (e: MouseEvent): void => {
    if (performance.now() < this.suppressClickUntil) {
      this.suppressClickUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    }
  };
}
