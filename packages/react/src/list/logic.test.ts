import { describe, expect, it } from 'vitest';
import { moveItem, reorderShift, reorderSlotOffset, reorderTarget } from '../logic/list';

const H = [52, 52, 52, 62, 52];

describe('reorder geometry', () => {
  it('swaps once the dragged centre passes half a neighbour', () => {
    expect(reorderTarget(0, 26, H)).toBe(0);
    expect(reorderTarget(0, 27, H)).toBe(1);
    expect(reorderTarget(0, 135, [53, 53, 53, 53])).toBe(3); // ED: native 135 pt drag lands in slot 3
    expect(reorderTarget(3, -27, H)).toBe(2);
    expect(reorderTarget(4, -1000, H)).toBe(0);
    expect(reorderTarget(0, 1000, H)).toBe(4);
  });
  it('shifts the rows between source and target by the dragged height', () => {
    expect([0, 1, 2, 3, 4].map((i) => reorderShift(i, 0, 2, 52))).toEqual([0, -52, -52, 0, 0]);
    expect([0, 1, 2, 3, 4].map((i) => reorderShift(i, 3, 1, 62))).toEqual([0, 62, 62, 0, 0]);
  });
  it('measures slot offsets across mixed heights', () => {
    expect(reorderSlotOffset(0, 3, H)).toBe(166);
    expect(reorderSlotOffset(4, 2, H)).toBe(-114);
    expect(reorderSlotOffset(2, 2, H)).toBe(0);
  });
  it('moves one element', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
  });
});
