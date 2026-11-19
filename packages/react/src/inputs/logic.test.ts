import { describe, expect, it } from 'vitest';
import {
  backspaceCode,
  distributeCode,
  editorHeight,
  formatCount,
  hexEquals,
  parseHex,
  ratingAtPointer,
  roundRating,
  sanitizeCode,
  starFill,
  stepRating,
  toInputColor,
  toggleColors,
  toggleGroupNext,
} from './logic';

describe('one-time code', () => {
  it('sanitizes', () => {
    expect(sanitizeCode('12-3 4a')).toBe('1234');
    expect(sanitizeCode('ab-1c', false)).toBe('AB1C');
  });
  it('types one character and advances', () => {
    expect(distributeCode('', 0, '4', 6)).toEqual({ code: '4', focus: 1 });
    expect(distributeCode('12', 2, '3', 6)).toEqual({ code: '123', focus: 3 });
  });
  it('overwrites a filled cell and keeps the rest', () => {
    expect(distributeCode('123456', 2, '9', 6)).toEqual({ code: '129456', focus: 3 });
  });
  it('clamps a far index to the first empty cell (no holes)', () => {
    expect(distributeCode('12', 5, '3', 6)).toEqual({ code: '123', focus: 3 });
  });
  it('a full paste / autofill fills every cell from 0', () => {
    expect(distributeCode('9', 3, '123 456', 6)).toEqual({ code: '123456', focus: 5 });
    expect(distributeCode('', 0, 'Your code: 12345678', 6)).toEqual({ code: '123456', focus: 5 });
  });
  it('a partial paste distributes from the cell', () => {
    expect(distributeCode('1', 1, '23', 6)).toEqual({ code: '123', focus: 3 });
    expect(distributeCode('12345', 4, '89', 6)).toEqual({ code: '123489', focus: 5 });
  });
  it('ignores invalid input', () => {
    expect(distributeCode('12', 2, 'x', 6)).toEqual({ code: '12', focus: 2 });
  });
  it('backspace', () => {
    expect(backspaceCode('123', 1)).toEqual({ code: '13', focus: 1 });
    expect(backspaceCode('123', 3)).toEqual({ code: '12', focus: 2 });
    expect(backspaceCode('', 0)).toEqual({ code: '', focus: 0 });
  });
});

describe('rating', () => {
  it('rounds to whole or half stars and clamps', () => {
    expect(roundRating(3.4, 5)).toBe(3);
    expect(roundRating(3.6, 5)).toBe(4);
    expect(roundRating(3.3, 5, 0.5)).toBe(3.5);
    expect(roundRating(3.2, 5, 0.5)).toBe(3);
    expect(roundRating(7, 5)).toBe(5);
    expect(roundRating(-1, 5)).toBe(0);
    expect(roundRating(NaN, 5)).toBe(0);
  });
  it('pointer position', () => {
    expect(ratingAtPointer(0, 100, 5)).toBe(0);
    expect(ratingAtPointer(1, 100, 5)).toBe(1);
    expect(ratingAtPointer(45, 100, 5)).toBe(3);
    expect(ratingAtPointer(45, 100, 5, 0.5)).toBe(2.5);
    expect(ratingAtPointer(50, 100, 5, 0.5)).toBe(2.5);
    expect(ratingAtPointer(51, 100, 5, 0.5)).toBe(3);
    expect(ratingAtPointer(200, 100, 5)).toBe(5);
    expect(ratingAtPointer(10, 100, 5, 1, true)).toBe(5);
  });
  it('star fill and steps', () => {
    expect([0, 1, 2, 3].map((i) => starFill(i, 2.5))).toEqual([1, 1, 0.5, 0]);
    expect(stepRating(4.5, 1, 5, 0.5)).toBe(5);
    expect(stepRating(5, 1, 5)).toBe(5);
    expect(stepRating(0, -1, 5)).toBe(0);
  });
});

describe('hex parsing', () => {
  it('accepts hex forms', () => {
    expect(parseHex('#0088ff')).toBe('#0088FF');
    expect(parseHex('0088FF')).toBe('#0088FF');
    expect(parseHex('#08f')).toBe('#0088FF');
    expect(parseHex('#08fa')).toBe('#0088FF');
    expect(parseHex('#0088FF80')).toBe('#0088FF');
    expect(parseHex('  #abcdef ')).toBe('#ABCDEF');
  });
  it('accepts rgb()', () => {
    expect(parseHex('rgb(255, 56, 60)')).toBe('#FF383C');
    expect(parseHex('rgba(0 136 255 / 0.5)')).toBe('#0088FF');
    expect(parseHex('rgb(300, -4, 0)')).toBe('#FF0000');
  });
  it('rejects junk', () => {
    expect(parseHex('blue')).toBeNull();
    expect(parseHex('#12345')).toBeNull();
    expect(parseHex('#ggg')).toBeNull();
    expect(parseHex('')).toBeNull();
  });
  it('equality and input form', () => {
    expect(hexEquals('#08f', 'rgb(0,136,255)')).toBe(true);
    expect(hexEquals('#08f', '#0088FE')).toBe(false);
    expect(hexEquals(null, '#000')).toBe(false);
    expect(toInputColor('#0088FF')).toBe('#0088ff');
    expect(toInputColor('nope')).toBe('#000000');
  });
});

describe('text editor', () => {
  it('clamps height between min and max lines', () => {
    expect(editorHeight(10, 20, 16, 3, 8)).toBe(76);
    expect(editorHeight(100, 20, 16, 3, 8)).toBe(100);
    expect(editorHeight(1000, 20, 16, 3, 8)).toBe(176);
    expect(editorHeight(1000, 20, 16, 3)).toBe(1000);
  });
  it('count', () => {
    expect(formatCount(12)).toBe('12');
    expect(formatCount(12, 200)).toBe('12/200');
  });
});

describe('toggle', () => {
  const tint = '#0088FF';
  it('off matches button colours; on = CT §1.5 selected', () => {
    expect(toggleColors('gray', 'light', tint, { isOn: false }).fill).toBe('rgba(120, 120, 128, 0.16)');
    expect(toggleColors('gray', 'light', tint, { isOn: true })).toEqual({ fill: 'rgba(0, 136, 255, 0.18)', foreground: tint });
    expect(toggleColors('tinted', 'light', tint, { isOn: true })).toEqual({ fill: tint, foreground: '#FFFFFF' });
    expect(toggleColors('gray', 'light', tint, { isOn: true, highlighted: true }).fill).toBe('rgba(0, 136, 255, 0.117)');
  });
  it('group selection', () => {
    expect(toggleGroupNext('single', ['a'], 'b')).toEqual(['b']);
    expect(toggleGroupNext('single', ['a'], 'a')).toEqual([]);
    expect(toggleGroupNext('single', ['a'], 'a', false)).toEqual(['a']);
    expect(toggleGroupNext('multiple', ['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleGroupNext('multiple', ['a', 'b'], 'a')).toEqual(['b']);
  });
});
