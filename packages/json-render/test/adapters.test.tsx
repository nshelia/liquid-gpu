// @vitest-environment jsdom
import './dom';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { isValidElement, type ReactElement } from 'react';
import { createStateStore, type Spec } from '@json-render/core';
import { click, flush, render, type Rendered } from './dom';
import { LiquidRenderer, createMenuSelect, toFormCheck, toFormChecks, toMenuContent, toSwipeActions, toValidationCheck } from '../src';

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});
const show = async (spec: Spec, props: Partial<Parameters<typeof LiquidRenderer>[0]> = {}) => (mounted = await render(<LiquidRenderer fallback spec={spec} {...props} />));
const one = (type: string, props: Record<string, unknown>, extra: Record<string, unknown> = {}): Spec => ({ root: 'x', elements: { x: { type, props, children: [], ...extra } } });

describe('pure conversions', () => {
  test('menu items JSON → MenuContent (flat and grouped), select reports the JSON item', () => {
    const picked: string[] = [];
    const flat = toMenuContent([{ id: 'a', title: 'A', icon: 'star', destructive: true }, { title: 'B', checked: true }, { nope: 1 }], (it) => picked.push(it.title));
    expect(flat).toHaveLength(2);
    const [a, b] = flat as { title: string; icon?: unknown; destructive?: boolean; checked?: boolean; onSelect?: () => void }[];
    expect(a!.title).toBe('A');
    expect(isValidElement(a!.icon)).toBe(true);
    expect((a!.icon as ReactElement<{ name: string }>).props.name).toBe('star');
    expect(a!.destructive).toBe(true);
    expect(b!.checked).toBe(true);
    b!.onSelect!();
    expect(picked).toEqual(['B']);
    const grouped = toMenuContent([[{ title: 'X' }], [{ title: 'Y' }, { title: 'Z' }]], () => {});
    expect(grouped).toHaveLength(2);
    expect((grouped[1] as unknown[]).length).toBe(2);
    expect(toMenuContent('garbage', () => {})).toEqual([]);
  });

  test('swipe actions emit their event', () => {
    const emit = vi.fn();
    const acts = toSwipeActions([{ label: 'Delete', event: 'delete', role: 'destructive', icon: 'trash' }, { label: 'Flag', event: 'flag', color: 'orange' }], emit)!;
    expect(acts.map((a) => a.label)).toEqual(['Delete', 'Flag']);
    expect(acts[0]!.role).toBe('destructive');
    expect(isValidElement(acts[0]!.icon)).toBe(true);
    acts[1]!.onAction();
    expect(emit).toHaveBeenCalledWith('flag');
    expect(toSwipeActions([], emit)).toBeUndefined();
  });

  test('checks map straight to the form Check type (both dialects)', () => {
    expect(toFormCheck({ type: 'required' })).toEqual({ type: 'required' });
    expect(toFormCheck({ type: 'minLength', value: 8, message: 'Too short' })).toEqual({ type: 'minLength', value: 8, message: 'Too short' });
    expect(toFormCheck({ type: 'minLength', args: { min: 3 } })).toEqual({ type: 'minLength', value: 3 });
    expect(toFormCheck({ type: 'max', args: { max: 9 } })).toEqual({ type: 'max', value: 9 });
    expect(toFormCheck({ type: 'pattern', args: { pattern: '^a' } })).toEqual({ type: 'pattern', value: '^a' });
    expect(toFormCheck({ type: 'matches', args: { other: { $state: '/signup/password' } } })).toEqual({ type: 'matches', value: 'password' });
    expect(toFormCheck({ type: 'url', protocols: ['https'] })).toEqual({ type: 'url', protocols: ['https'] });
    expect(toFormCheck({ type: 'isEven' })).toEqual({ type: 'custom', name: 'isEven' });
    expect(toFormChecks([{ type: 'email' }, { type: 'minLength' }])).toEqual([{ type: 'email' }]);
    expect(toValidationCheck({ type: 'minLength', value: 4 })).toEqual({ type: 'minLength', args: { min: 4 }, message: 'Must be at least 4 characters.' });
  });
});

describe('rendered adapters', () => {
  test('icon names render as SVG icons', async () => {
    const r = await show({
      root: 'v',
      elements: {
        v: { type: 'HStack', props: {}, children: ['i', 'b'] },
        i: { type: 'Icon', props: { name: 'heart.fill', color: 'red' }, children: [] },
        b: { type: 'Button', props: { label: 'Share', icon: 'square.and.arrow.up' }, children: [] },
      },
    });
    const icons = [...r.container.querySelectorAll('svg[data-icon]')].map((s) => s.getAttribute('data-icon'));
    expect(icons).toContain('heart.fill');
    expect(icons).toContain('square.and.arrow.up');
  });

  test('Button press dispatches the bound action with resolved params', async () => {
    const onAction = vi.fn();
    const r = await show(one('Button', { label: 'Buy' }, { on: { press: { action: 'buy', params: { sku: { $state: '/sku' } } } } }), { onAction, state: { sku: 'A-1' } });
    await click([...r.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Buy')));
    await flush();
    expect(onAction).toHaveBeenCalledWith('buy', { sku: 'A-1' });
  });

  test('named handlers win over onAction', async () => {
    const onAction = vi.fn();
    const save = vi.fn();
    const r = await show(one('Button', { label: 'Save' }, { on: { press: { action: 'save' } } }), { onAction, handlers: { save } });
    await click(r.container.querySelector('button'));
    await flush();
    expect(save).toHaveBeenCalled();
    expect(onAction).not.toHaveBeenCalled();
  });

  test('openPath presents an Alert; an action emits its event and writes false', async () => {
    const store = createStateStore({ ui: { confirm: true } });
    const onAction = vi.fn();
    const spec = one(
      'Alert',
      { openPath: '/ui/confirm', title: 'Delete photo?', message: 'This cannot be undone.', actions: [{ title: 'Cancel', role: 'cancel' }, { title: 'Delete', role: 'destructive', event: 'delete' }] },
      { on: { delete: { action: 'deletePhoto', params: { id: 7 } } } },
    );
    await show(spec, { store, onAction });
    await flush();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Delete photo?');
    const del = [...document.body.querySelectorAll('button')].find((b) => b.textContent === 'Delete');
    await click(del);
    await flush();
    expect(onAction).toHaveBeenCalledWith('deletePhoto', { id: 7 });
    expect(store.get('/ui/confirm')).toBe(false);
  });

  test('closed overlays render nothing', async () => {
    await show(one('Alert', { openPath: '/ui/a', title: 'Hidden alert' }), { state: { ui: { a: false } } });
    expect(document.body.textContent ?? '').not.toContain('Hidden alert');
  });

  test('Menu renders its trigger (label + icon); selection writes the bound value and emits the item event', async () => {
    const r = await show(one('Menu', { label: 'Sort', icon: 'arrow.up.arrow.down', items: [{ id: 'name', title: 'Name' }] }));
    const trigger = [...r.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Sort'));
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger?.querySelector('svg[data-icon="arrow.up.arrow.down"]')).toBeTruthy();

    const store = createStateStore({ sort: 'name' });
    const emit = vi.fn();
    const select = createMenuSelect(store.set, '/sort', emit);
    const [, date] = toMenuContent([{ id: 'name', title: 'Name' }, { id: 'date', title: 'Date', event: 'byDate' }], select) as unknown as { onSelect: () => void }[];
    date!.onSelect();
    expect(store.get('/sort')).toBe('date');
    expect(emit.mock.calls.map((c) => c[0])).toEqual(['byDate', 'select']);
  });

  test('Row: title / detail / settings icon, press, trailing slot', async () => {
    const onAction = vi.fn();
    const r = await show(
      {
        root: 'l',
        elements: {
          l: { type: 'List', props: {}, children: ['s'] },
          s: { type: 'Section', props: { header: 'General' }, children: ['r'] },
          r: { type: 'Row', props: { title: 'Wi-Fi', detail: 'Home', icon: 'wifi', iconBackground: 'blue', trailingActions: [{ label: 'Forget', event: 'forget' }] }, slots: { trailing: ['sw'] }, on: { press: { action: 'open' } }, children: [] },
          sw: { type: 'Switch', props: { isOn: true }, children: [] },
        },
      },
      { onAction },
    );
    expect(r.container.textContent).toContain('Wi-Fi');
    expect(r.container.textContent).toContain('Home');
    expect(r.container.querySelector('svg[data-icon="wifi"]')).toBeTruthy();
    expect(r.container.querySelector('[role="switch"]')).toBeTruthy();
  });

  test('Metric and charts render from plain data rows', async () => {
    const r = await show({
      root: 'v',
      elements: {
        v: { type: 'VStack', props: {}, children: ['m', 'c'] },
        m: { type: 'Metric', props: { label: 'Revenue', value: 1200, format: 'currency', delta: 0.1 }, children: [] },
        c: { type: 'BarChart', props: { data: [{ d: 'Mon', v: 3 }, { d: 'Tue', v: 5 }], x: 'd', y: 'v' }, children: [] },
      },
    });
    expect(r.container.textContent).toContain('Revenue');
    expect(r.container.querySelector('svg')).toBeTruthy();
  });

  test('a throwing element is isolated by its error boundary', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Boom = () => {
      throw new Error('boom');
    };
    const r = await show(
      { root: 'v', elements: { v: { type: 'VStack', props: {}, children: ['bad', 'ok'] }, bad: { type: 'Boom', props: {}, children: [] }, ok: { type: 'Text', props: { text: 'still here' }, children: [] } } },
      { components: { Boom } },
    );
    expect(r.container.textContent).toContain('still here');
    warn.mockRestore();
    err.mockRestore();
  });

  test('NavigationStack destinations render the root screen; TabView builds tabs from Tab elements', async () => {
    const r = await show({
      root: 'tabs',
      elements: {
        tabs: { type: 'TabView', props: { height: 400 }, children: ['t1', 't2'] },
        t1: { type: 'Tab', props: { id: 'home', label: 'Home', icon: 'house' }, children: ['nav'] },
        t2: { type: 'Tab', props: { id: 'me', label: 'Profile', icon: 'person' }, children: ['p'] },
        nav: { type: 'NavigationStack', props: { destinations: { more: 'more' } }, children: ['scr'] },
        scr: { type: 'Screen', props: { title: 'Home Screen' }, children: ['link'] },
        link: { type: 'NavigationLink', props: { value: 'more', title: 'More' }, children: [] },
        more: { type: 'Screen', props: { title: 'More Screen' }, children: [] },
        p: { type: 'Text', props: { text: 'Profile body' }, children: [] },
      },
    });
    await flush();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Home Screen');
    expect(text).toContain('Profile');
  });
});
