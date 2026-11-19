import { describe, expect, it } from 'vitest';
import { TEXT_STYLES, headingStyle, lineLimitStyle, resolveColor, textCss, textMetrics } from './logic';

describe('text logic', () => {
  it('has metrics for every Dynamic Type style', () => {
    for (const s of TEXT_STYLES) expect(textMetrics(s).size).toBeGreaterThan(0);
    expect(textMetrics('largeTitle')).toEqual({ size: 34, weight: 400, lineHeight: 40.667, tracking: 0.39 });
    expect(textMetrics('title').size).toBe(28);
    expect(textMetrics('headline').weight).toBe(590);
    expect(textMetrics('caption')).toMatchObject({ size: 12, lineHeight: 14.333 });
    expect(textMetrics('caption2').size).toBe(11);
  });
  it('resolves semantic colours', () => {
    expect(resolveColor('secondaryLabel')).toBe('var(--lq-secondary-label)');
    expect(resolveColor('secondary')).toBe('var(--lq-secondary-label)');
    expect(resolveColor('tint')).toBe('var(--lq-tint)');
    expect(resolveColor('red')).toBe('var(--lq-system-red)');
    expect(resolveColor('#ff0000')).toBe('#ff0000');
    expect(resolveColor(undefined)).toBeUndefined();
  });
  it('clamps lines', () => {
    expect(lineLimitStyle(undefined)).toEqual({});
    expect(lineLimitStyle(1)).toMatchObject({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
    expect(lineLimitStyle(3)).toMatchObject({ WebkitLineClamp: 3, display: '-webkit-box' });
  });
  it('builds text css', () => {
    const css = textCss({ style: 'body', weight: 'bold', monospacedDigit: true, italic: true, alignment: 'trailing' });
    expect(css).toMatchObject({ fontSize: 17, fontWeight: 700, lineHeight: '20.333px', fontStyle: 'italic', fontVariantNumeric: 'tabular-nums', textAlign: 'end' });
  });
  it('maps heading levels', () => {
    expect(headingStyle(1)).toEqual({ style: 'largeTitle', tag: 'h1' });
    expect(headingStyle(2)).toEqual({ style: 'title', tag: 'h2' });
    expect(headingStyle(3)).toEqual({ style: 'title2', tag: 'h3' });
  });
});
