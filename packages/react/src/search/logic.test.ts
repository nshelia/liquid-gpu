import { describe, expect, it } from 'vitest';
import { closeRect, fieldRect, matchesSearch, scopeIndexAt, searchBarLayout } from './logic';

describe('search bar layout (iPhone 440 × 956)', () => {
  const L = searchBarLayout(440, 956);
  it('matches the measured frames', () => {
    expect(L.rest).toEqual({ x: 28, y: 880, width: 384, height: 48 });
    expect(L.active).toEqual({ x: 28, y: 880, width: 324, height: 48 });
    expect(L.close).toEqual({ x: 364, y: 880, width: 48, height: 48 });
    expect(L.mini).toEqual({ x: 196, y: 880, width: 48, height: 48 });
  });
  it('narrows the field and grows the close circle from 1.2 ×', () => {
    expect(fieldRect(L, 0, false).width).toBe(384);
    expect(fieldRect(L, 1, false).width).toBe(324);
    const c0 = closeRect(L, 0);
    expect(c0.alpha).toBe(0);
    expect(c0.rect.x).toBeCloseTo(359.2, 5);
    expect(c0.rect.width).toBeCloseTo(57.6, 5);
    expect(closeRect(L, 1).rect).toEqual(L.close);
  });
  it('morphs the minimized circle with a centred height bulge', () => {
    expect(fieldRect(L, 0, true)).toEqual(L.mini);
    const mid = fieldRect(L, 0.5, true);
    expect(mid.height).toBeCloseTo(57.3, 5);
    expect(mid.y + mid.height / 2).toBeCloseTo(904, 5);
    expect(fieldRect(L, 1, true)).toEqual(L.active);
  });
});

describe('helpers', () => {
  it('picks the scope segment under x', () => {
    expect(scopeIndexAt(10, 400, 3)).toBe(0);
    expect(scopeIndexAt(200, 400, 3)).toBe(1);
    expect(scopeIndexAt(500, 400, 3)).toBe(2);
  });
  it('matches case- and diacritic-insensitively', () => {
    expect(matchesSearch('Pineapple', 'AP')).toBe(true);
    expect(matchesSearch('Café', 'cafe')).toBe(true);
    expect(matchesSearch('Fig', 'ap')).toBe(false);
    expect(matchesSearch('Fig', '  ')).toBe(true);
  });
});
