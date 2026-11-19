import { describe, expect, it } from 'vitest';
import { frameCss, gridTemplateColumns, hAlignCss, paddingCss, spacerCss, vAlignCss, zAlignCss } from './logic';

describe('layout logic', () => {
  it('resolves padding', () => {
    expect(paddingCss(undefined)).toBeUndefined();
    expect(paddingCss('standard')).toBe(16);
    expect(paddingCss('margins')).toBe('0 20px');
    expect(paddingCss(-3)).toBe(0);
  });
  it('maps alignments', () => {
    expect(hAlignCss()).toBe('center');
    expect(hAlignCss('leading')).toBe('flex-start');
    expect(vAlignCss('firstTextBaseline')).toBe('first baseline');
    expect(zAlignCss('topLeading')).toEqual({ justifyItems: 'start', alignItems: 'start' });
    expect(zAlignCss('bottom')).toEqual({ justifyItems: 'center', alignItems: 'end' });
    expect(zAlignCss('trailing')).toEqual({ justifyItems: 'end', alignItems: 'center' });
  });
  it('fills along and across the parent axis', () => {
    expect(frameCss('infinity', undefined, 'horizontal')).toEqual({ flex: '1 1 0', minWidth: 0 });
    expect(frameCss('infinity', undefined, 'vertical')).toEqual({ alignSelf: 'stretch', width: 'auto' });
    expect(frameCss('infinity', 'infinity', undefined)).toEqual({ width: '100%', height: '100%' });
    expect(frameCss(300, undefined, undefined)).toEqual({ maxWidth: 300 });
  });
  it('sizes spacers', () => {
    expect(spacerCss(undefined, 'horizontal')).toMatchObject({ flex: '1 1 0', minWidth: 8 });
    expect(spacerCss(0, 'vertical')).toMatchObject({ minHeight: 0 });
  });
  it('builds grid templates', () => {
    expect(gridTemplateColumns(3)).toBe('repeat(3, minmax(0, 1fr))');
    expect(gridTemplateColumns(0)).toBe('repeat(1, minmax(0, 1fr))');
    expect(gridTemplateColumns([{ type: 'fixed', size: 60 }, { type: 'flexible' }])).toBe('60px minmax(10px, 1fr)');
    expect(gridTemplateColumns([{ type: 'adaptive', minimum: 80 }])).toBe('repeat(auto-fill, minmax(80px, 1fr))');
    expect(gridTemplateColumns([{ type: 'flexible', minimum: 20, maximum: 100 }])).toBe('minmax(20px, 100px)');
  });
});
