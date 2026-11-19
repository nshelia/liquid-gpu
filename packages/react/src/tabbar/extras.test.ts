import { describe, expect, it } from 'vitest';
import { scaleRectAbout, tabBarLayout } from '../logic/tabbar';

// Values: deep/demo-audit/tabbar-extras/dumps (iOS 27.0, 440 × 956).
describe('tab bar extras layout', () => {
  it('search / prominent circle: leading 188 platter + 62 circle at (357, 873)', () => {
    const l = tabBarLayout([26, 26], 440, 956, { aux: true });
    expect(l.platter).toEqual({ x: 21, y: 873, width: 188, height: 62 });
    expect(l.aux).toEqual({ x: 357, y: 873, width: 62, height: 62 });
    expect(l.buttons.map((b) => b.x)).toEqual([4, 90]);
  });

  it('search active: button, field and close on the minimized row', () => {
    const { search } = tabBarLayout([26, 26], 440, 956, { aux: true });
    expect(search.button).toEqual({ x: 28, y: 880, width: 48, height: 48 });
    expect(search.field).toEqual({ x: 88, y: 880, width: 264, height: 48 });
    expect(search.close).toEqual({ x: 364, y: 880, width: 48, height: 48 });
  });

  it('bottom accessory: 398 platter, capsule 8 above, inline when minimized', () => {
    const l = tabBarLayout([26, 26, 26], 440, 956, { accessory: true });
    expect(l.platter).toEqual({ x: 21, y: 873, width: 398, height: 62 });
    expect(l.buttons[1]!.x + 21).toBeCloseTo(151.667, 3);
    expect(l.buttons[0]!.width).toBeCloseTo(136.667, 3);
    expect(l.accessory!.full).toEqual({ x: 21, y: 817, width: 398, height: 48 });
    expect(l.accessory!.minimized).toEqual({ x: 90, y: 880, width: 322, height: 48 });
    expect(l.squeezeAnchor.y).toBeCloseTo(890, 0);
    expect(tabBarLayout([26, 26, 26], 440, 956).squeezeAnchor.y).toBeCloseTo(918, 0);
  });

  it('squeeze about the group anchor reproduces the measured accessory frame', () => {
    const l = tabBarLayout([26, 26, 26], 440, 956, { accessory: true });
    // rec/accessory_scroll.jsonl t 3.754: platter width 380.224 → s 0.95534; accessory (29.888, 820.26, 380.224).
    const r = scaleRectAbout(l.accessory!.full, 380.224 / 398, l.squeezeAnchor);
    expect(r.x).toBeCloseTo(29.888, 1);
    expect(r.y).toBeCloseTo(820.26, 0);
  });
});
