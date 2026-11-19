/**
 * Drag-to-reorder for one Section (ED = deep/demo-audit/list-edit, raw/testUIReorder-*):
 * - Lift 0.15 s after touch-down on the grabber (or on the first move), with no motion: the cell keeps its size, its
 *   background becomes a blur with the cell colour at 80 % (#FFFFFF@0.8 / #1C1C1E@0.8) and a shadow black 0.2 (dark
 *   1.0), radius 16, offset (0, 2). The card splits: each cell draws its own background, rounded by its slot.
 * - The row follows the finger 1:1; neighbours swap when its centre crosses half of theirs, on ζ 1 / 0.30.
 * - Drop: to the slot on ζ 1 / 0.28; shadow and blur fade with the same progress (the fill returns to opaque). Release without moving: instant.
 */
import { createSpring, type SpringHandle } from '../root/useSpring';
import type { LiquidContextValue } from '../root/context';
import type { GestureArena } from '../root/gestures';
import { EDIT, reorderShift, reorderSlotOffset, reorderTarget } from '../logic/list';

export interface ReorderRow {
  el: HTMLElement;
  fg: HTMLElement;
  y: SpringHandle;
}

type Ctx = Pick<LiquidContextValue, 'animator' | 'requestFrame' | 'spring'> & { gestures: GestureArena };

const CORNER = 26;

export class ReorderController {
  private rows: (ReorderRow | undefined)[] = [];
  private pendingReset = false;
  private saved = new Map<HTMLElement, string>();
  dragging = false;

  constructor(
    private ctx: Ctx,
    private card: () => HTMLElement | null,
    private move: () => ((from: number, to: number) => void) | undefined,
    private dark: () => boolean,
  ) {}

  register(index: number, row: ReorderRow): () => void {
    this.rows[index] = row;
    return () => {
      if (this.rows[index] === row) this.rows[index] = undefined;
    };
  }

  /** Called from the Section's layout effect after `onMove` re-rendered the rows in their new order. */
  afterRender(): void {
    if (this.pendingReset) this.resetAll();
  }

  begin(index: number, e: PointerEvent): void {
    const rows = this.rows.slice();
    const self = rows[index];
    if (!self || this.dragging) return;
    const heights = rows.map((r) => r?.el.offsetHeight ?? 0);
    const n = heights.length;
    const min = reorderSlotOffset(index, 0, heights);
    const max = reorderSlotOffset(index, n - 1, heights);
    let to = index;
    let dy = 0;
    let lifted = false;
    const lift = () => {
      if (lifted) return;
      lifted = true;
      this.dragging = true;
      const card = this.card();
      if (card) {
        card.style.overflow = 'visible';
        card.style.background = 'transparent';
      }
      for (const r of rows) if (r) this.saved.set(r.fg, r.fg.style.background);
      this.corners(rows, index, to);
      self.el.style.zIndex = '10';
      this.lift(self, 1);
    };
    let timer: ReturnType<typeof setTimeout> | 0 = setTimeout(lift, EDIT.liftDelay * 1000);
    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = 0;
    };
    const drop = () => {
      clear();
      if (!lifted) return;
      const start = dy;
      const end = reorderSlotOffset(index, to, heights);
      const p = createSpring(this.ctx, 0, EDIT.dropSpring);
      p.subscribe((v) => {
        self.y.snap(start + (end - start) * v);
        this.lift(self, 1 - Math.min(1, v));
        if (p.settled) {
          p.dispose();
          this.finish(index, to);
        }
      });
      p.set(1);
    };
    this.ctx.gestures.track(e, {
      decide: () => 'claim',
      onBegin: lift,
      onMove: (s) => {
        dy = Math.max(min, Math.min(max, s.dy));
        self.y.snap(dy);
        const t = reorderTarget(index, dy, heights);
        if (t === to) return;
        to = t;
        rows.forEach((r, i) => {
          if (r && i !== index) r.y.set(reorderShift(i, index, to, heights[index]!), { params: EDIT.shiftSpring });
        });
        this.corners(rows, index, to);
      },
      onEnd: drop,
      onCancel: drop,
      onTap: () => {
        clear();
        if (lifted) this.resetAll();
      },
    });
  }

  private lift(r: ReorderRow, level: number): void {
    const l = Math.max(0, level);
    if (l <= 0.0005) {
      r.el.style.boxShadow = '';
      r.fg.style.background = this.saved.get(r.fg) ?? '';
      r.fg.style.backdropFilter = '';
      return;
    }
    const a = (this.dark() ? 1 : 0.2) * l;
    r.el.style.boxShadow = `0 ${2 * l}px ${16 * l}px rgba(0,0,0,${a})`;
    r.fg.style.background = `color-mix(in srgb, var(--lq-cell-grouped) ${100 - 20 * l}%, transparent)`;
    r.fg.style.backdropFilter = `blur(${10 * l}px)`;
  }

  /** Slot corners: the row in slot 0 rounds its top, the row in the last slot its bottom. */
  private corners(rows: (ReorderRow | undefined)[], from: number, to: number): void {
    const n = rows.length;
    rows.forEach((r, i) => {
      if (!r) return;
      const slot = i === from ? to : i + Math.sign(reorderShift(i, from, to, 1));
      const radius = `${slot === 0 ? CORNER : 0}px ${slot === 0 ? CORNER : 0}px ${slot === n - 1 ? CORNER : 0}px ${slot === n - 1 ? CORNER : 0}px`;
      r.el.style.borderRadius = radius;
      r.fg.style.borderRadius = radius;
    });
  }

  private finish(from: number, to: number): void {
    const onMove = this.move();
    if (from !== to && onMove) {
      this.pendingReset = true;
      onMove(from, to);
      // Fallback when the owner ignores the move (no re-render): reset on the next frame.
      requestAnimationFrame(() => requestAnimationFrame(() => this.afterRender()));
    } else this.resetAll();
  }

  private resetAll(): void {
    this.pendingReset = false;
    this.dragging = false;
    const card = this.card();
    if (card) {
      card.style.overflow = '';
      card.style.background = '';
    }
    for (const r of this.rows) {
      if (!r) continue;
      r.y.snap(0);
      r.el.style.boxShadow = '';
      r.el.style.zIndex = '';
      r.el.style.borderRadius = '';
      r.fg.style.borderRadius = '';
      r.fg.style.backdropFilter = '';
    }
    for (const [fg, bg] of this.saved) fg.style.background = bg;
    this.saved.clear();
  }
}
