import { describe, expect, it } from 'vitest';
import { chevronTransform, clamp01, revealHeight } from './logic';

describe('basics logic', () => {
  it('rotates the chevron 0…90°', () => {
    expect(chevronTransform(0)).toBe('');
    expect(chevronTransform(1)).toBe('rotate(90deg)');
    expect(chevronTransform(0.5)).toBe('rotate(45deg)');
  });
  it('clamps reveal height', () => {
    expect(revealHeight(-0.1, 20)).toBe(0);
    expect(revealHeight(1.02, 20)).toBe(20);
    expect(revealHeight(0.5, 20.33)).toBeCloseTo(10.165);
    expect(clamp01(2)).toBe(1);
  });
});
