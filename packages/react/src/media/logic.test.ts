import { describe, expect, it } from 'vitest';
import { avatarDiameter, colorToken, cornerStyle, formatBadge, groupOverflow, monogram, skeletonLineWidths } from './logic';

describe('media logic', () => {
  it('formats badge counts', () => {
    expect(formatBadge(3)).toBe('3');
    expect(formatBadge(99)).toBe('99');
    expect(formatBadge(100)).toBe('99+');
    expect(formatBadge(1000, 999)).toBe('999+');
    expect(formatBadge(0)).toBeNull();
    expect(formatBadge(0, 99, true)).toBe('0');
    expect(formatBadge(-2)).toBeNull();
    expect(formatBadge(NaN)).toBeNull();
    expect(formatBadge(undefined)).toBeNull();
    expect(formatBadge('150')).toBe('99+');
    expect(formatBadge('New')).toBe('New');
    expect(formatBadge('')).toBe('');
  });
  it('builds contact monograms', () => {
    expect(monogram('John Appleseed')).toBe('JA');
    expect(monogram('john ronald reuel tolkien')).toBe('JT');
    expect(monogram('Madonna')).toBe('M');
    expect(monogram('  ')).toBe('');
    expect(monogram(undefined)).toBe('');
    expect(monogram('ნიკა შელია')).toBe('ნშ'); // Georgian is not case-mapped
    expect(monogram('Ёлка Ивановна')).toBe('ЁИ');
    expect(monogram('🎉 Party')).toBe('P');
    expect(monogram('👨‍👩‍👧')).toBe('');
    expect(monogram('émile zola')).toBe('ÉZ');
    expect(monogram('Ann (work)')).toBe('AW');
    expect(monogram('Ann Lee', 1)).toBe('A');
  });
  it('resolves sizes, overflow, colours, corners, lines', () => {
    expect(avatarDiameter('small')).toBe(32);
    expect(avatarDiameter(56)).toBe(56);
    expect(avatarDiameter(undefined)).toBe(40);
    expect(groupOverflow(3, 5)).toEqual({ visible: 3, overflow: 0 });
    expect(groupOverflow(8, 4)).toEqual({ visible: 3, overflow: 5 });
    expect(colorToken('red')).toBe('systemRed');
    expect(colorToken(undefined)).toBe('tint');
    expect(cornerStyle('large')).toEqual({ radius: '26px', squircle: true });
    expect(cornerStyle('capsule').squircle).toBe(false);
    expect(skeletonLineWidths(3)).toEqual([1, 1, 0.6]);
    expect(skeletonLineWidths(1)).toEqual([1]);
  });
});
