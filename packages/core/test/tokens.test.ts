import { describe, expect, it } from 'vitest';
import {
  colorVariants,
  colors,
  colorsHighContrast,
  cssColor,
  dynamicTypeSize,
  hapticEvents,
  haptics,
  metrics,
  radii,
  textStyles,
  toVibratePattern,
} from '../src/tokens';

describe('colours (reference-page SEM/TINT)', () => {
  it('parses the @alpha notation', () => {
    expect(cssColor('#3C3C43@0.60')).toBe('rgba(60, 60, 67, 0.6)');
    expect(cssColor('#0088FF')).toBe('#0088FF');
  });

  it('resolves per appearance', () => {
    expect(colors.light.systemBlue).toBe('#0088FF');
    expect(colors.dark.systemBlue).toBe('#0091FF');
    expect(colorsHighContrast.light.systemBlue).toBe('#1E6EF4');
    expect(colorsHighContrast.dark.systemBlue).toBe('#5CB8FF');
    expect(colors.light.label).toBe('#000000');
    expect(colors.dark.secondaryLabel).toBe('rgba(235, 235, 245, 0.6)');
    expect(colorVariants.darkElevated.systemBackground).toBe('#1C1C1E');
    expect(colors.dark.systemGray).toBe('#8E8E93'); // token-verification §a #1
  });

  it('component colours', () => {
    expect(colors.light.switchTrackOn).toBe('#34C759');
    expect(colors.dark.sheetDimming).toBe('rgba(0, 0, 0, 0.48)');
    expect(colorVariants.darkElevated.cellGrouped).toBe('#2C2C2E');
  });

  it('every appearance has the same keys', () => {
    const keys = Object.keys(colors.light).sort();
    for (const v of Object.values(colorVariants)) expect(Object.keys(v).sort()).toEqual(keys);
  });
});

describe('type', () => {
  it('styles at Large', () => {
    expect(textStyles.body).toMatchObject({ size: 17, lineHeight: 20.287 });
    expect(textStyles.headline.weight).toBe(590);
    expect(textStyles.largeTitle.size).toBe(34);
  });
  it('Dynamic Type table', () => {
    expect(dynamicTypeSize('body', 'AX3')).toBe(40);
    expect(dynamicTypeSize('largeTitle', 'AX5')).toBe(60);
    expect(dynamicTypeSize('caption2')).toBe(11);
  });
});

describe('metrics and radii', () => {
  it('contract values', () => {
    expect(metrics.barButton).toBe(44);
    expect(metrics.rowHeight).toBe(52);
    expect(metrics.insetGroupedRadius).toBe(26);
    expect(metrics.navBarHeight).toBe(54);
    expect(metrics.tabBarHeight).toBe(83);
    expect(radii.display).toBe(62);
    expect(radii.alert).toBe(34);
  });
});

describe('haptics (haptics-framerate §3)', () => {
  it('keeps the extracted intensities', () => {
    expect(hapticEvents.impactLight).toEqual([{ t: 0, intensity: 0.7, sharpness: 0.1304 }]);
    expect(hapticEvents.success[1]).toEqual({ t: 0.185, intensity: 1, sharpness: 0.6522 });
  });

  it('vibrate patterns keep the time offsets', () => {
    const p = toVibratePattern(hapticEvents.success);
    expect(p).toHaveLength(3);
    expect(p[0]! + p[1]!).toBe(185);
    expect(haptics.error).toHaveLength(7);
    for (const pattern of Object.values(haptics)) for (const ms of pattern) expect(ms).toBeGreaterThanOrEqual(0);
  });
});
