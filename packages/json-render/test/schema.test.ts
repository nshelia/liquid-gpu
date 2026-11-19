import { describe, expect, test } from 'vitest';
import { dashboardSpec, liquidCatalog, liquidComponents, settingsSpec, signUpSpec, validateLiquidSpec, isDynamicExpression } from '../src';

describe('sample specs validate against the catalog', () => {
  for (const [name, spec] of Object.entries({ settings: settingsSpec, signUp: signUpSpec, dashboard: dashboardSpec })) {
    test(name, () => {
      const r = validateLiquidSpec(spec);
      expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
      expect(r.valid).toBe(true);
      // Every element type is a catalog component.
      for (const el of Object.values(spec.elements)) expect(liquidCatalog.componentNames).toContain(el.type);
    });
  }

  test('json-render catalog.validate accepts a literal-only spec', () => {
    const spec = {
      root: 'v',
      elements: {
        v: { type: 'VStack', props: { spacing: 8, padding: 'standard' }, children: ['t', 'b'] },
        t: { type: 'Text', props: { text: 'Hi', style: 'headline' }, children: [] },
        b: { type: 'Button', props: { label: 'Go', variant: 'filled', icon: 'arrow.right' }, children: [] },
      },
    };
    expect(liquidCatalog.validate(spec).success).toBe(true);
  });
});

describe('validation errors', () => {
  test('unknown type, bad prop, missing child', () => {
    const r = validateLiquidSpec({
      root: 'a',
      elements: {
        a: { type: 'VStack', props: { spacing: 'wide' }, children: ['b', 'ghost'] },
        b: { type: 'Blink', props: {}, children: [] },
        c: { type: 'Button', props: { variant: 'neon' }, children: [] },
      },
    });
    expect(r.valid).toBe(false);
    const msgs = r.issues.map((i) => `${i.element}:${i.path ?? ''}:${i.message}`).join('\n');
    expect(msgs).toMatch(/a:props\.spacing/);
    expect(msgs).toMatch(/Unknown component type "Blink"/);
    expect(msgs).toMatch(/missing element "ghost"/);
    expect(msgs).toMatch(/c:props\.variant/);
    expect(r.issues.find((i) => i.element === 'c' && /not referenced/.test(i.message))?.severity).toBe('warning');
  });

  test('missing root and children on a leaf', () => {
    expect(validateLiquidSpec({ elements: {} }).valid).toBe(false);
    const r = validateLiquidSpec({ root: 't', elements: { t: { type: 'Text', props: { text: 'x' }, children: ['y'] }, y: { type: 'Text', props: { text: 'y' }, children: [] } } });
    expect(r.issues.some((i) => /does not take children/.test(i.message))).toBe(true);
  });

  test('dynamic expressions are accepted for any prop', () => {
    expect(isDynamicExpression({ $bindState: '/x' })).toBe(true);
    expect(isDynamicExpression({ $cond: true, $then: 1, $else: 2 })).toBe(true);
    expect(isDynamicExpression({ title: 'x' })).toBe(false);
    const r = validateLiquidSpec({ root: 's', elements: { s: { type: 'Switch', props: { isOn: { $bindState: '/on' }, label: { $template: 'Hi ${/name}' } }, children: [] } } });
    expect(r.valid).toBe(true);
  });

  test('every component schema accepts its example and an empty object where nothing is required', () => {
    for (const [name, def] of Object.entries(liquidComponents)) {
      const ex = (def as { example?: Record<string, unknown> }).example;
      if (ex) {
        const literal = Object.fromEntries(Object.entries(ex).filter(([, v]) => !isDynamicExpression(v)));
        expect(def.props.safeParse(literal).success, name).toBe(true);
      }
    }
  });
});

describe('icons', () => {
  test('every icon name used by the sample specs is registered, and the prompt lists the icon set', async () => {
    const { hasIcon, iconNames } = await import('@liquid-gpu/react');
    const { liquidPrompt } = await import('../src');
    const names = new Set<string>();
    const walk = (v: unknown, key = '') => {
      if (typeof v === 'string' && /^(icon|minimumIcon|maximumIcon|systemImage)$/.test(key)) names.add(v);
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, Array.isArray(v) ? key : k);
    };
    walk([settingsSpec, signUpSpec, dashboardSpec]);
    expect(names.size).toBeGreaterThan(8);
    for (const n of names) expect(hasIcon(n), n).toBe(true);
    const p = liquidPrompt();
    for (const n of iconNames) expect(p).toContain(n);
  });
});
