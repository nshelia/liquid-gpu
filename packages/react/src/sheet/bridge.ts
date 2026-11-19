import { createContext } from 'react';

export interface SheetScrollMoveInput {
  /** Offset the scroll view wants (unbanded), pt. */
  proposedOffset: number;
  /** Offset at gesture start. */
  startOffset: number;
  /** Minimum offset (top). 0 in this kit (insets are inside the content). */
  maxTopOffset: number;
  canScroll: boolean;
  /** Finger velocity along y, pt/s (positive = down). */
  panVelocity: number;
  decelerating: boolean;
  hasRefreshControl: boolean;
  scrollsHorizontally: boolean;
}

/**
 * Provided by `<Sheet>` to scroll views inside it: the scroll view asks on every drag move how much of the movement
 * the sheet takes (`sheetScrollHandoff`, deep/sheets/findings.md §1).
 */
export interface SheetScrollBridge {
  scrollDragBegin(): void;
  /** Null: the sheet takes no part; scroll normally. Otherwise use `scrollOffset` (no rubber band). */
  scrollDragMove(i: SheetScrollMoveInput): { scrollOffset: number; zeroScrollVelocity: boolean } | null;
  /** Finger velocity pt/s (down positive). Returns true when the sheet took part in this gesture. */
  scrollDragEnd(fingerVelocity: number): boolean;
}

export const SheetScrollContext = createContext<SheetScrollBridge | null>(null);
