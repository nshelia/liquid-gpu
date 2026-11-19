/**
 * List / Section / Row: the inset-grouped table (LS = components/lists.md).
 *
 * - Section: 20 pt side inset, continuous corner radius 26 (LS §1.1); header Semibold 17 in listHeaderText, not
 *   uppercased, first header 55.33 tall (label 25 below the top, SwiftUI), later 38 (11.67), 35 without a header
 *   (LS §1.3, typography, deep/demo-audit/basics);
 *   footer 13 pt, 7.67 below the card.
 * - Row: 52 pt (62 with a subtitle), margins 20, title Body 17, subtitle Subhead 15 secondary, value1 detail right in
 *   secondary; separator 1 pt (ED), inset 20 (59 with an image) and 20 on the trailing side, none under the last row
 *   (LS §1.1–1.2); disclosure chevron 10.33×14 in tertiaryLabel, right edge at the cell edge − 20.
 * - Highlight: systemGray4 after the 0.15 s touch delay; deselect fade 0.5 s cubic(0.42, 0, 0.58, 1); neighbouring
 *   separators hide while highlighted (LS §1.4).
 * - Swipe actions (LS §1.7, GS §1): buttons 4 pt inset, radius 16, 10 apart and from the edge, Footnote 13 white,
 *   destructive systemRed / normal systemGray3; tracking + release on SwiftUI spring 0.5/0; full swipe confirms
 *   (`swipeActionShouldConfirm`), release rule `swipeActionRelease`; the swiped cell turns systemGray5 with radius 26
 *   on the CASpring m2 k200 c100; haptics on confirm / unconfirm (HF §3).
 */
import {
  Children,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  VelocityTracker,
  componentType,
  gestureThresholds,
  metrics,
  playHaptic,
  springs,
  swipeActionRelease,
  swipeActionShouldConfirm,
  swipeConfirmationThreshold,
} from '@liquid-gpu/core';
import { useLiquid } from '../root/context';
import { useSpring } from '../root/useSpring';
import { ChevronForward } from '../icons';
import { EDIT, swipeButtonWidth, swipeDecision, swipeDragOffset, swipeOpenThreshold, SWIPE_PADDING, SWIPED_CELL_RADIUS } from '../logic/list';
import { fontStack } from '../root/theme';
import { GrabberGlyph, ListEditContext, MinusGlyph, SelectionGlyph, type ListEditState } from './edit';
import { ReorderController } from './reorder';

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of a Footnote 13 label (swipe button sizing, LS §1.7). */
function measureLabel(text: string): number {
  if (typeof document === 'undefined') return text.length * 6.6;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 6.6;
  measureCtx.font = `13px ${fontStack}`;
  return measureCtx.measureText(text).width;
}

interface ListContextValue {
  /** Close any other open row; `close` closes this one. */
  opened(close: (() => void) | null): void;
  /** Close the open row, if any; true when one was open (the tap that closed it does nothing else). */
  closeOpen(): boolean;
}
const ListContext = createContext<ListContextValue | null>(null);

/** True inside a `<List>` (e.g. NavigationLink renders as a disclosure Row there). */
export function useInList(): boolean {
  return useContext(ListContext) !== null;
}
const SectionIndexContext = createContext(0);
const RowIndexContext = createContext(0);
const ReorderContext = createContext<ReorderController | null>(null);

export interface ListProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
  /** Edit mode (UITableView `isEditing`, SwiftUI `editMode`): minus or selection controls, grabbers, no swipes. */
  editing?: boolean;
  /** Multi-selection while editing (SwiftUI `List(selection:)`): rows with an `id` show selection circles. */
  selection?: ReadonlySet<string>;
  onSelectionChange?(selection: Set<string>): void;
}

/** Inset-grouped list. Put it inside a `<ScrollView>` (it does not scroll itself). */
export function List({ children, className, style, editing = false, selection, onSelectionChange, ...aria }: ListProps) {
  const openClose = useRef<(() => void) | null>(null);
  const ctx = useMemo<ListContextValue>(
    () => ({
      opened(close) {
        if (openClose.current && openClose.current !== close) openClose.current();
        openClose.current = close;
      },
      closeOpen() {
        const c = openClose.current;
        openClose.current = null;
        c?.();
        return !!c;
      },
    }),
    [],
  );
  const onSel = useRef(onSelectionChange);
  onSel.current = onSelectionChange;
  // Latest selection, also advanced by taps that land before the owner re-renders.
  const selRef = useRef(selection);
  selRef.current = selection;
  const edit = useMemo<ListEditState>(
    () => ({
      editing,
      selection: selection ?? null,
      toggle(id) {
        const next = new Set(selRef.current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        selRef.current = next;
        onSel.current?.(next);
      },
    }),
    [editing, selection],
  );
  useEffect(() => {
    ctx.closeOpen();
  }, [editing, ctx]);
  let i = 0;
  const kids = Children.map(children, (c) =>
    isValidElement(c) ? <SectionIndexContext.Provider value={i++}>{c}</SectionIndexContext.Provider> : c,
  );
  return (
    <ListContext.Provider value={ctx}>
      <ListEditContext.Provider value={edit}>
        <div
          role="list"
          aria-label={aria['aria-label']}
          aria-multiselectable={selection && editing ? true : undefined}
          className={['lq-list', className].filter(Boolean).join(' ')}
          style={{ paddingBottom: 20, ...style }}
        >
          {kids}
        </div>
      </ListEditContext.Provider>
    </ListContext.Provider>
  );
}

export interface SectionProps {
  header?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
  /** Rows can be reordered while editing (SwiftUI `onMove`): called with the row indices on drop. */
  onMove?(from: number, to: number): void;
}

export function Section({ header, footer, children, style, onMove }: SectionProps) {
  const index = useContext(SectionIndexContext);
  const lq = useLiquid();
  const first = index === 0;
  const side = metrics.insetGroupedSideInset;
  const cardRef = useRef<HTMLDivElement | null>(null);
  const moveRef = useRef(onMove);
  moveRef.current = onMove;
  const darkRef = useRef(lq.appearance === 'dark');
  darkRef.current = lq.appearance === 'dark';
  const movable = !!onMove;
  const reorder = useMemo(
    () => (movable ? new ReorderController(lq, () => cardRef.current, () => moveRef.current, () => darkRef.current) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [movable],
  );
  useLayoutEffect(() => reorder?.afterRender());
  let r = 0;
  const rows = Children.map(children, (c) => (isValidElement(c) ? <RowIndexContext.Provider value={r++}>{c}</RowIndexContext.Provider> : c));
  return (
    <section style={{ ...style }}>
      <div
        className="lq-section-header"
        style={{
          // SwiftUI (basics + list-edit captures): first label 3.67 pt higher than UIKit (ink 27 above the card, not
          // 23.33) at the same 55.33 total; a later Section without a header starts 35 pt below the previous card.
          padding: `${first ? 25 : 11.67}px ${side + 20}px ${first ? 10 : 6}px`,
          minHeight: header ? undefined : first ? 0 : 35,
          boxSizing: 'border-box',
          color: 'var(--lq-list-header-text)',
          fontSize: componentType.listHeader.size,
          fontWeight: componentType.listHeader.weight,
          lineHeight: `${componentType.listHeader.lineHeight}px`,
          // Theme tracking switch (`--lq-tracking-on`, 0): the system font already tracks; a fixed −0.432 made headers
          // 2.3–7 pt narrower than the native UILabel widths (components/out/lists, e.g. "Section Header" 122.67).
          letterSpacing: 'calc(var(--lq-tracking-on) * -0.432px)',
        }}
      >
        {header}
      </div>
      <div
        ref={cardRef}
        className="lq-section-card"
        role="group"
        style={{
          margin: `0 ${side}px`,
          borderRadius: metrics.insetGroupedRadius,
          ['cornerShape' as string]: 'squircle',
          background: 'var(--lq-cell-grouped)',
          overflow: 'hidden',
          position: 'relative',
          isolation: 'isolate',
        }}
      >
        <ReorderContext.Provider value={reorder}>{rows}</ReorderContext.Provider>
      </div>
      {footer && (
        <div
          className="lq-section-footer"
          style={{
            padding: `7.67px ${side + 20}px 0`,
            color: 'var(--lq-list-header-text)',
            fontSize: componentType.listFooter.size,
            lineHeight: `${componentType.listFooter.lineHeight}px`,
            // Same switch: a fixed −0.076 made 13 pt footers up to 3.33 pt narrower than native (components/out/lists).
            letterSpacing: 'calc(var(--lq-tracking-on) * -0.076px)',
          }}
        >
          {footer}
        </div>
      )}
    </section>
  );
}

export interface SwipeAction {
  label: string;
  /** `destructive` → systemRed; otherwise systemGray3 (or `color`). */
  role?: 'destructive' | 'normal';
  color?: string;
  icon?: ReactNode;
  onAction(): void;
}

export interface RowProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** value1 detail text on the trailing side. */
  detail?: ReactNode;
  /** Leading image (22 pt box, tint colour by default). */
  icon?: ReactNode;
  accessory?: 'disclosure' | 'checkmark' | 'none';
  onPress?(): void;
  selected?: boolean;
  /** Trailing swipe actions; the first is the primary (full-swipe) action. */
  trailingActions?: SwipeAction[];
  leadingActions?: SwipeAction[];
  /** Custom trailing content (e.g. a Switch). */
  trailing?: ReactNode;
  children?: ReactNode;
  'aria-label'?: string;
  /** ARIA role for the row's foreground control (e.g. `radio` in an inline picker). */
  role?: string;
  'aria-checked'?: boolean;
  /** Selection key while editing a list with `selection`. */
  id?: string;
  /** Shows the minus control while editing; its Delete button calls this after the row collapses. */
  onDelete?(): void;
  /** Show the grabber in a Section with `onMove` (default true). */
  movable?: boolean;
}

const actionColor = (a: SwipeAction) =>
  a.color ?? (a.role === 'destructive' ? 'var(--lq-system-red)' : 'var(--lq-system-gray-3)');

export function Row({
  title,
  subtitle,
  detail,
  icon,
  accessory = 'none',
  onPress,
  selected = false,
  trailingActions,
  leadingActions,
  trailing,
  children,
  id,
  onDelete,
  movable = true,
  ...aria
}: RowProps) {
  const ctx = useLiquid();
  const list = useContext(ListContext);
  const edit = useContext(ListEditContext);
  const reorder = useContext(ReorderContext);
  const rowIndex = useContext(RowIndexContext);
  const editing = edit.editing;
  const selectMode = edit.selection !== null && id !== undefined;
  const editSelected = selectMode && edit.selection!.has(id!);
  const hasMinus = !selectMode && !!onDelete;
  const hasControl = selectMode || hasMinus;
  const hasGrabber = !!reorder && movable;
  const ctlRef = useRef<HTMLDivElement | null>(null);
  const grabRef = useRef<HTMLDivElement | null>(null);
  const accRef = useRef<HTMLSpanElement | null>(null);
  const revealRef = useRef(false);
  const deletingRef = useRef(false);
  // ED: the minus control reveals one Delete action (UIKit, not SwiftUI's trash label).
  const editDelete = useMemo<SwipeAction[] | undefined>(
    () => (hasMinus ? [{ label: 'Delete', role: 'destructive', onAction: () => startDelete() }] : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasMinus],
  );
  if (editing) {
    trailingActions = editDelete;
    leadingActions = undefined;
  }
  const rowRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<HTMLElement | null>(null);
  const trailRef = useRef<HTMLDivElement | null>(null);
  const leadRef = useRef<HTMLDivElement | null>(null);
  const [highlighted, setHighlighted] = useState(false);
  const hasTrailing = !!trailingActions?.length;
  const hasLeading = !!leadingActions?.length;
  const swipeable = hasTrailing || hasLeading;
  const confirmedRef = useRef(false);

  // Swiped-cell background and corners: CASpring m2 k200 c100 (LS §1.7). Nominally ζ 2.5, but overdamped CASprings
  // render critically damped at the same response (TR §0), so ζ 1 with the spring's response (0.628 s).
  const bg = useSpring(0, { dampingRatio: 1, response: springs.swipeCellBackground.response }, (v) => {
    const fg = fgRef.current;
    if (!fg) return;
    const t = Math.max(0, Math.min(1, v));
    fg.style.borderRadius = t > 0.001 ? `${Math.min(SWIPED_CELL_RADIUS, fg.offsetHeight / 2) * t}px` : '';
    fg.style.background = t > 0.001 ? `color-mix(in srgb, var(--lq-system-gray-5) ${t * 100}%, var(--lq-cell-grouped))` : '';
  });

  // ED: content, controls and grabber share one ζ 1 / 0.30 spring; opacity = progress.
  const editP = useSpring(editing ? 1 : 0, EDIT.spring, (p) => applyEdit(p));
  const applyEdit = (p: number) => {
    const fg = fgRef.current;
    if (fg) {
      fg.style.paddingLeft = `${metrics.cellLayoutMargins[1] + (hasControl ? EDIT.textShift * p : 0)}px`;
      fg.style.paddingRight = `${metrics.cellLayoutMargins[1] + (hasGrabber ? (EDIT.trailingWithGrabber - metrics.cellLayoutMargins[1]) * p : 0)}px`;
    }
    const q = 1 - p;
    if (ctlRef.current) {
      ctlRef.current.style.transform = `translate3d(${-EDIT.controlShift * q}px, 0, 0)`;
      ctlRef.current.style.opacity = String(p);
    }
    if (grabRef.current) {
      grabRef.current.style.transform = `translate3d(${(EDIT.grabberWidth + EDIT.grabberTrailing) * q}px, 0, 0)`;
      grabRef.current.style.opacity = String(p);
    }
    if (accRef.current) accRef.current.style.opacity = String(q);
    const sep = rowRef.current?.querySelector<HTMLElement>('.lq-row-sep');
    if (sep && hasControl) sep.style.left = `${(icon ? metrics.separatorInsetWithImage : metrics.separatorInsetLeading) + EDIT.textShift * p}px`;
  };
  useLayoutEffect(() => {
    if (editP.target !== (editing ? 1 : 0)) editP.set(editing ? 1 : 0);
    else applyEdit(editP.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, hasControl, hasGrabber]);

  // ED delete: the cell slides out to −(width + 20) while the row collapses, both on ζ 1 / 0.27; rows below follow.
  const collapse = useSpring(0, { dampingRatio: 1, response: 0.27 }, (p) => {
    const row = rowRef.current;
    if (!row) return;
    row.style.height = p > 0 ? `${row.scrollHeight * (1 - Math.min(1, p))}px` : '';
    row.style.overflow = p > 0 ? 'hidden' : '';
    if (p >= 0.999 && deletingRef.current) {
      deletingRef.current = false;
      list?.opened(null);
      onDelete?.();
    }
  });
  const startDelete = () => {
    const row = rowRef.current;
    if (!row || deletingRef.current) return;
    deletingRef.current = true;
    revealRef.current = false;
    const params = { dampingRatio: 1, response: 0.27 };
    offset.set(-(row.offsetWidth + 20), { params });
    collapse.set(1);
  };
  // ED: after the minus tap the Delete button scales on ζ 0.72 / 0.48 (overshoot 1.04); opacity follows the cell.
  const revealScale = useSpring(0, EDIT.deleteScaleSpring, () => layoutActions(offset.value));

  // Cell offset: SwiftUI spring 0.5 / 0 (GS §1), interactive while dragging.
  const offset = useSpring(0, springs.swipeActionTracking, (v) => {
    const fg = fgRef.current;
    if (fg) fg.style.transform = Math.abs(v) < 0.01 ? '' : `translate3d(${v}px, 0, 0)`;
    layoutActions(v);
  });

  // Buttons scale in place at their slots; past the open offset only the primary widens and the rest fade.
  const layoutActions = (v: number) => {
    for (const [el, side] of [
      [trailRef.current, 'trailing'],
      [leadRef.current, 'leading'],
    ] as const) {
      if (!el) continue;
      const show = side === 'trailing' ? v < -0.5 : v > 0.5;
      el.style.visibility = show ? 'visible' : 'hidden';
      const a = Math.abs(v);
      // Extends under the swiped cell's rounded end.
      el.style.width = `${Math.max(0, a) + (show ? SWIPED_CELL_RADIUS : 0)}px`;
      if (!show) continue;
      const btns = Array.from(el.querySelectorAll<HTMLElement>('[data-swipe-natural]'));
      const ws = btns.map((b) => Number(b.dataset.swipeNatural) || 60);
      const open = ws.reduce((x, y) => x + y, 0) + (ws.length + 1) * SWIPE_PADDING;
      const rowW = el.parentElement?.clientWidth ?? 400;
      const confirmAt = Math.max(open + 1, Math.abs(swipeConfirmationThreshold(rowW, side)));
      const over = Math.max(0, a - open);
      let slotStart = 0;
      btns.forEach((b, i) => {
        const w = ws[i]!;
        const width = i === 0 ? w + over : w;
        let scale = Math.max(0, Math.min(1, (a - slotStart - 30) / (w - 20)));
        let opacity = scale < 0.33 ? 0 : scale;
        if (revealRef.current) {
          scale = Math.max(0, revealScale.value);
          opacity = Math.min(1, a / open);
        }
        if (i > 0 && over > 0.5) opacity = 0.7 - 0.4 * Math.min(1, over / (confirmAt - open));
        b.style[side === 'trailing' ? 'right' : 'left'] = `${SWIPE_PADDING + slotStart}px`;
        b.style.width = `${width}px`;
        b.style.transform = Math.abs(scale - 1) < 0.001 ? '' : `scale(${scale})`;
        b.style.opacity = String(opacity);
        slotStart += width + SWIPE_PADDING;
      });
    }
  };

  const widths = (side: 'leading' | 'trailing') => {
    const el = side === 'trailing' ? trailRef.current : leadRef.current;
    if (!el) return [];
    return Array.from(el.querySelectorAll<HTMLElement>('[data-swipe-natural]')).map((b) => Number(b.dataset.swipeNatural) || 60);
  };

  const close = () => {
    if (deletingRef.current) return;
    revealRef.current = false;
    offset.set(0, { params: springs.swipeActionRelease });
    bg.set(0);
  };

  // ED: the minus control opens the Delete reveal like a swipe (cell on the 0.5 / ζ 1 release spring, max err 0.006).
  const reveal = () => {
    const open = swipeOpenThreshold(widths('trailing'), 'trailing');
    if (!open) return;
    list?.opened(close);
    revealRef.current = true;
    revealScale.snap(0);
    revealScale.set(1);
    bg.set(1);
    offset.set(open, { params: springs.swipeActionRelease });
  };

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    let highlightTimer: ReturnType<typeof setTimeout> | 0 = 0;
    let minusDown = false;
    let base = 0;
    let claimDx = 0;
    const tracker = new VelocityTracker();
    const clearHighlight = () => {
      if (highlightTimer) clearTimeout(highlightTimer);
      highlightTimer = 0;
      setHighlighted(false);
    };
    const rec = {
      decide(s: { dx: number; dy: number; startX: number; event: PointerEvent }) {
        if (!swipeable || (editing && Math.abs(offset.value) <= 1)) return 'fail' as const;
        return swipeDecision(s.dx, s.dy, s.startX, Math.abs(offset.value) > 1, hasLeading, hasTrailing);
      },
      onBegin(s: { dx: number; event: PointerEvent }) {
        clearHighlight();
        base = offset.target;
        claimDx = s.dx;
        tracker.reset();
        confirmedRef.current = false;
        list?.opened(close);
        bg.set(1);
      },
      onMove(s: { dx: number; event: PointerEvent }) {
        tracker.add(s.event.timeStamp, s.event.clientX);
        const w = row.offsetWidth;
        const off = swipeDragOffset(base, s.dx, claimDx, w, hasLeading, hasTrailing);
        if (off < 0 && hasTrailing) {
          const confirm = swipeActionShouldConfirm({
            offset: off,
            velocity: tracker.velocity(),
            fingerX: s.event.clientX, // window x; GS §1 edge zone at the edge it moves toward (left)
            screenWidth: ctx.viewport.width,
            confirmationThreshold: swipeConfirmationThreshold(w, 'trailing'),
          });
          if (confirm !== confirmedRef.current) playHaptic(confirm ? 'swipeConfirm' : 'swipeUnconfirm');
          confirmedRef.current = confirm;
        } else if (off > 0 && hasLeading) {
          const confirm = off > swipeConfirmationThreshold(w, 'leading');
          if (confirm !== confirmedRef.current) playHaptic(confirm ? 'swipeConfirm' : 'swipeUnconfirm');
          confirmedRef.current = confirm;
        } else confirmedRef.current = false;
        offset.set(off, { params: springs.swipeActionTracking });
      },
      onEnd(_s: unknown, cancelled: boolean) {
        const v = cancelled ? 0 : tracker.velocity();
        const off = offset.target;
        const side = off < 0 ? 'trailing' : 'leading';
        const open = swipeOpenThreshold(widths(side), side);
        const outcome = swipeActionRelease(off, v, open || -1, confirmedRef.current && !cancelled);
        if (outcome === 'confirm') {
          const action = (side === 'trailing' ? trailingActions : leadingActions)?.[0];
          const w = row.offsetWidth;
          // GS §1: the primary button takes the row after a full swipe (CASpring k511.55 c45.235).
          offset.set(side === 'trailing' ? -w : w, { params: springs.swipeDeleteButton, velocity: v });
          setTimeout(() => {
            action?.onAction();
            offset.snap(0);
            bg.snap(0);
            list?.opened(null);
          }, 250);
        } else if (outcome === 'open' && open) {
          offset.set(open, { params: springs.swipeActionRelease, velocity: v });
        } else {
          close();
          list?.opened(null);
        }
      },
      onCancel() {
        clearHighlight();
      },
      onTap() {
        if (highlightTimer) {
          clearTimeout(highlightTimer);
          highlightTimer = 0;
        }
        if (Math.abs(offset.value) > 1) {
          close();
          return;
        }
        if (minusDown) {
          list?.closeOpen();
          reveal();
          return;
        }
        if (editing) {
          if (list?.closeOpen()) return;
          // ED: selection fills #D1D1D6 / #3A3A3C and clears instantly while editing.
          if (selectMode) edit.toggle(id!);
          return;
        }
        if (list?.closeOpen()) return;
        if (onPress) {
          // Show the highlight briefly, then fade (LS §1.4: selection stays ≥ 0.1 s).
          setHighlighted(true);
          setTimeout(() => setHighlighted(false), 100);
        }
      },
    };
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-swipe-action]')) return;
      if (editing && target.closest('[data-edit-grabber]')) {
        reorder?.begin(rowIndex, e);
        return;
      }
      minusDown = editing && hasMinus && !!target.closest('[data-edit-minus]');
      ctx.gestures.track(e, rec);
      if (onPress && !editing) {
        // LS §1.4 / SMG §5: highlight after the 0.15 s touch delay unless a scroll starts.
        highlightTimer = setTimeout(() => {
          highlightTimer = 0;
          if (!ctx.gestures.isClaimed(e.pointerId)) setHighlighted(true);
        }, gestureThresholds.touchDelay * 1000);
      }
    };
    row.addEventListener('pointerdown', onDown);
    return () => {
      row.removeEventListener('pointerdown', onDown);
      if (highlightTimer) clearTimeout(highlightTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [swipeable, hasLeading, hasTrailing, onPress, trailingActions, leadingActions, ctx, editing, selectMode, editSelected, reorder, rowIndex]);

  // Reorder registration (index within the Section).
  const ySpring = useSpring(0, EDIT.shiftSpring, (v) => {
    const row = rowRef.current;
    if (row) row.style.transform = Math.abs(v) < 0.01 ? '' : `translate3d(0, ${v}px, 0)`;
  });
  useLayoutEffect(() => {
    const el = rowRef.current;
    const fg = fgRef.current;
    if (!reorder || !el || !fg) return;
    return reorder.register(rowIndex, { el, fg, y: ySpring });
  }, [reorder, rowIndex, ySpring]);

  const rowHeight = subtitle ? metrics.rowHeightSubtitle : metrics.rowHeight;
  const sepInset = icon ? metrics.separatorInsetWithImage : metrics.separatorInsetLeading;
  const lit = highlighted || selected || editSelected;
  const Fg = onPress ? 'button' : 'div';

  const content = (
    <>
      {icon && (
        <span aria-hidden style={{ width: 22, minWidth: 22, marginRight: 17, display: 'flex', justifyContent: 'center', color: 'var(--lq-tint)' }}>
          {icon}
        </span>
      )}
      <span style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'left' }}>
        {title !== undefined && (
          <span className="lq-body" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {title}
          </span>
        )}
        {subtitle !== undefined && (
          <span className="lq-subheadline" style={{ color: 'var(--lq-secondary-label)', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {subtitle}
          </span>
        )}
        {children}
      </span>
      {detail !== undefined && (
        <span className="lq-body" style={{ color: 'var(--lq-secondary-label)', marginLeft: 8, whiteSpace: 'nowrap' }}>
          {detail}
        </span>
      )}
      {trailing}
      {accessory !== 'none' && (
        <span ref={accRef} style={{ display: 'inline-flex', flex: 'none' }}>
          {accessory === 'disclosure' && <ChevronForward style={{ marginLeft: 12, color: 'var(--lq-chevron)', flex: 'none' }} />}
          {accessory === 'checkmark' && (
            <svg width="19" height="17.33" viewBox="0 0 19 17.33" aria-hidden style={{ marginLeft: 12, color: 'var(--lq-tint)', flex: 'none', marginRight: -2.5 }}>
              <path d="M2 9.5 7 14.5 17 2.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
      )}
      {hasControl && (
        <div
          ref={ctlRef}
          aria-hidden={!editing}
          data-edit-minus={hasMinus ? '' : undefined}
          style={{
            position: 'absolute',
            left: EDIT.controlCenter - EDIT.controlGlyph / 2,
            top: `calc(50% - ${EDIT.controlGlyph / 2}px)`,
            opacity: 0,
            pointerEvents: editing ? 'auto' : 'none',
          }}
        >
          {selectMode ? <SelectionGlyph selected={editSelected} /> : <MinusGlyph />}
        </div>
      )}
      {hasGrabber && (
        <div
          ref={grabRef}
          data-edit-grabber
          aria-hidden
          style={{
            position: 'absolute',
            right: EDIT.grabberTrailing,
            top: 0,
            bottom: 0,
            width: EDIT.grabberWidth,
            display: 'flex',
            alignItems: 'center',
            opacity: 0,
            pointerEvents: editing ? 'auto' : 'none',
            touchAction: 'none',
            cursor: editing ? 'grab' : undefined,
          }}
        >
          <GrabberGlyph />
        </div>
      )}
    </>
  );

  return (
    <div
      ref={rowRef}
      role="listitem"
      className={['lq-row', lit ? 'lq-row-lit' : ''].join(' ')}
      style={{ position: 'relative', touchAction: 'pan-y' }}
      data-lq-swipe={swipeable ? '' : undefined}
    >
      {hasTrailing && <SwipeActions refEl={trailRef} side="trailing" actions={trailingActions!} rowHeight={rowHeight} onDone={close} />}
      {hasLeading && <SwipeActions refEl={leadRef} side="leading" actions={leadingActions!} rowHeight={rowHeight} onDone={close} />}
      <Fg
        ref={fgRef as never}
        type={onPress ? 'button' : undefined}
        onClick={editing ? undefined : onPress}
        aria-label={aria['aria-label']}
        role={aria.role}
        aria-checked={aria['aria-checked']}
        aria-selected={aria.role ? undefined : selected || editSelected || undefined}
        className="lq-row-fg"
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          minHeight: rowHeight,
          padding: `0 ${metrics.cellLayoutMargins[1]}px`,
          boxSizing: 'border-box',
          background: lit ? 'var(--lq-cell-selected)' : 'var(--lq-cell-grouped)',
          // LS §1.4 deselect: 0.5 s cubic (0.42, 0, 0.58, 1); instant while editing (ED).
          transition: lit || editing ? 'none' : 'background-color 0.5s cubic-bezier(0.42, 0, 0.58, 1)',
          color: 'var(--lq-label)',
          textAlign: 'left',
          zIndex: 1,
        }}
      >
        {content}
      </Fg>
      <div
        aria-hidden
        className="lq-row-sep"
        style={{
          position: 'absolute',
          left: sepInset,
          right: metrics.separatorInsetLeading,
          bottom: 0,
          height: 1, // ED: native separators are 1 pt (3 device px of #3C3C43@0.12)
          background: 'var(--lq-separator)',
          zIndex: 2,
          pointerEvents: 'none',
          // ED: an edit-selected row hides only its own separator.
          opacity: editSelected ? 0 : undefined,
        }}
      />
    </div>
  );
}

function SwipeActions({
  refEl,
  side,
  actions,
  rowHeight,
  onDone,
}: {
  refEl: React.RefObject<HTMLDivElement | null>;
  side: 'leading' | 'trailing';
  actions: SwipeAction[];
  rowHeight: number;
  onDone(): void;
}) {
  const ordered = actions;
  return (
    <div
      ref={refEl}
      style={{
        position: 'absolute',
        top: 0,
        bottom: 0,
        [side === 'trailing' ? 'right' : 'left']: 0,
        width: 0,
        visibility: 'hidden',
        overflow: 'hidden',
        background: 'var(--lq-system-grouped-background)',
        zIndex: 0,
      }}
    >
      {ordered.map((a, i) => {
        return (
          <button
            key={a.label}
            type="button"
            data-swipe-action
            data-swipe-natural={swipeButtonWidth(measureLabel(a.label)).toFixed(2)}
            onClick={() => {
              a.onAction();
              onDone();
            }}
            style={{
              position: 'absolute',
              top: 4.67,
              [side === 'trailing' ? 'right' : 'left']: SWIPE_PADDING,
              width: swipeButtonWidth(measureLabel(a.label)),
              transformOrigin: 'center',
              borderRadius: 16,
              ['cornerShape' as string]: 'squircle',
              background: actionColor(a),
              color: '#FFFFFF',
              fontSize: componentType.swipeButton.size,
              lineHeight: '15.51px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 2,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              height: rowHeight - 9,
            }}
          >
            {a.icon}
            {a.label}
          </button>
        );
      })}
    </div>
  );
}
