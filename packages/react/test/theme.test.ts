import { describe, expect, it } from 'vitest';
import { colors } from '@liquid-gpu/core';
import { resolveTheme, themeVars } from '../src/root/theme';
import { resolveDestination } from '../src/nav/NavigationStack';

describe('scoped theme overrides', () => {
  it('maps overrides to root-scoped CSS variables per appearance', () => {
    const t = { tint: { light: '#FF0000', dark: '#00FF00' }, fontFamily: 'Inter', radiusScale: 1.5, colors: { secondaryLabel: '#123456' } };
    expect(themeVars(t, 'light')).toEqual({
      '--lq-secondary-label': '#123456',
      '--lq-tint': '#FF0000',
      '--lq-font': 'Inter',
      '--lq-radius-scale': '1.5',
    });
    expect(themeVars(t, 'dark')['--lq-tint']).toBe('#00FF00');
    expect(themeVars(undefined, 'light')).toEqual({});
  });
  it('resolves effective colours with token fallback', () => {
    const r = resolveTheme({ tint: '#FF00AA' }, 'dark');
    expect(r.tint).toBe('#FF00AA');
    expect(r.color('label')).toBe(colors.dark.label);
    expect(r.radiusScale).toBe(1);
    expect(resolveTheme(undefined, 'light').tint).toBe(colors.light.tint);
  });
});

describe('navigation destinations', () => {
  it('resolves exact keys, then the first path segment', () => {
    const el = { type: 'div', props: {}, key: null } as never;
    const seen: string[] = [];
    const d = { settings: el, product: (v: string) => (seen.push(v), el) };
    expect(resolveDestination(d, 'settings')).toBe(el);
    expect(resolveDestination(d, 'product/42')).toBe(el);
    expect(seen).toEqual(['product/42']);
    expect(resolveDestination(d, 'missing')).toBeNull();
    expect(resolveDestination(undefined, 'x')).toBeNull();
  });
});
