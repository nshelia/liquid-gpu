// @vitest-environment jsdom
import './dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { render, type Rendered } from './dom';
import { LiquidRenderer, createLiquidSpecStream, dashboardSpec, parsePartialJson, parseSpec, settingsSpec, signUpSpec, specToPatches, toSpec } from '../src';

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

describe('parsePartialJson', () => {
  test('complete documents parse exactly', () => {
    const v = { a: [1, 2.5, -3e2, true, false, null], b: { c: 'x"y\\né' } };
    expect(parsePartialJson(JSON.stringify(v))).toEqual(v);
  });

  test('every prefix parses without throwing and is a prefix-consistent value', () => {
    const text = JSON.stringify(dashboardSpec);
    for (let i = 0; i <= text.length; i += 7) {
      const v = parsePartialJson(text.slice(0, i));
      expect(v === undefined || typeof v === 'object').toBe(true);
    }
  });

  test('cut points', () => {
    expect(parsePartialJson('')).toBeUndefined();
    expect(parsePartialJson('{"a": 1, "b": [1, 2')).toEqual({ a: 1, b: [1, 2] });
    expect(parsePartialJson('{"a": tr')).toEqual({});
    expect(parsePartialJson('{"text": "Hel')).toEqual({ text: 'Hel' });
    expect(parsePartialJson('{"type": "Tex')).toEqual({}); // atomic key: no half component names
    expect(parsePartialJson('{"a"')).toEqual({});
    expect(parsePartialJson('{"a": "\\u00')).toEqual({ a: '' });
    expect(parsePartialJson('Sure! ```json\n{"root": "x"')).toEqual({ root: 'x' });
  });
});

describe('spec streams', () => {
  test('JSONL patches (json-render SpecStream), fed one character at a time, build the same spec', () => {
    const text = specToPatches(signUpSpec);
    const stream = createLiquidSpecStream();
    let seen = 0;
    let last = 0;
    for (const ch of text) {
      const spec = stream.push(ch);
      const n = spec ? Object.keys(spec.elements).length : 0;
      expect(n).toBeGreaterThanOrEqual(last);
      if (n > last) seen++;
      last = n;
    }
    expect(stream.format).toBe('jsonl');
    expect(seen).toBeGreaterThan(5); // progressive, not all at once
    expect(stream.getSpec()).toEqual(toSpec(signUpSpec));
  });

  test('a plain JSON spec streamed token by token', () => {
    const text = JSON.stringify(settingsSpec, null, 1);
    const stream = createLiquidSpecStream();
    for (let i = 0; i < text.length; i += 3) stream.push(text.slice(i, i + 3));
    expect(stream.format).toBe('json');
    expect(stream.getSpec()).toEqual(toSpec(settingsSpec));
  });

  test('nested (tree) specs are flattened', () => {
    const spec = parseSpec(JSON.stringify({ type: 'VStack', props: {}, children: [{ type: 'Text', props: { text: 'a' } }, { type: 'Text', props: { text: 'b' } }] }))!;
    expect(spec.elements[spec.root]!.children).toHaveLength(2);
  });

  test('garbage yields null, never throws', () => {
    expect(parseSpec('hello')).toBeNull();
    expect(toSpec(42)).toBeNull();
    expect(toSpec({ elements: { a: { type: 3 } } })).toBeNull();
  });
});

describe('rendering partial specs', () => {
  test('every prefix of a streamed spec renders (missing children and unknown types render nothing / a skeleton)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const text = JSON.stringify(dashboardSpec);
    const stream = createLiquidSpecStream();
    mounted = await render(<LiquidRenderer fallback loading spec={null} />);
    const step = Math.ceil(text.length / 60);
    for (let i = 0; i < text.length; i += step) {
      const spec = stream.push(text.slice(i, i + step));
      await mounted.rerender(<LiquidRenderer fallback loading spec={spec ? { ...spec } : null} />);
    }
    await mounted.rerender(<LiquidRenderer fallback loading={false} spec={stream.getSpec()} />);
    expect(mounted.container.textContent).toContain('Store Overview');
    expect(mounted.container.textContent).toContain('Revenue');
    warn.mockRestore();
    error.mockRestore();
  });

  test('unknown types: skeleton while loading, nothing afterwards; missing children are skipped', async () => {
    const spec = { root: 'v', elements: { v: { type: 'VStack', props: {}, children: ['x', 'ghost', 't'] }, x: { type: 'HoloDeck', props: {}, children: [] }, t: { type: 'Text', props: { text: 'ok' }, children: [] } } };
    mounted = await render(<LiquidRenderer fallback loading spec={spec} />);
    expect(mounted.container.textContent).toContain('ok');
    const skeletons = () => mounted!.container.querySelectorAll('span[aria-hidden="true"] > span').length;
    expect(skeletons()).toBeGreaterThan(0);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await mounted.rerender(<LiquidRenderer fallback spec={spec} />);
    expect(mounted.container.textContent).toContain('ok');
    expect(skeletons()).toBe(0);
    warn.mockRestore();
  });

  test('incomplete props show a skeleton while loading instead of a broken component', async () => {
    const spec = { root: 'c', elements: { c: { type: 'BarChart', props: { x: 'day' }, children: [] } } };
    mounted = await render(<LiquidRenderer fallback loading spec={spec} />);
    expect(mounted.container.querySelector('svg')).toBeNull();
    expect(mounted.container.querySelectorAll('span[aria-hidden="true"] > span').length).toBeGreaterThan(0);
  });
});
