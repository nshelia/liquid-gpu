// @vitest-environment jsdom
import './dom';
import { act } from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createStateStore, type Spec } from '@json-render/core';
import { click, flush, render, type Rendered } from './dom';
import { LiquidRenderer } from '../src';

let mounted: Rendered | null = null;
afterEach(() => {
  mounted?.unmount();
  mounted = null;
});

/** Set an <input>/<textarea> value the way React listens for it. */
async function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('$bindState round trip', () => {
  test('Switch: click writes the state; a state write re-renders the switch; change event fires', async () => {
    const store = createStateStore({ settings: { wifi: true } });
    const onAction = vi.fn();
    const spec: Spec = {
      root: 's',
      elements: { s: { type: 'Switch', props: { label: 'Wi-Fi', isOn: { $bindState: '/settings/wifi' } }, on: { change: { action: 'wifiChanged', params: { on: { $state: '/settings/wifi' } } } }, children: [] } },
    };
    mounted = await render(<LiquidRenderer fallback spec={spec} store={store} onAction={onAction} />);
    const sw = () => mounted!.container.querySelector('[role="switch"]')!;
    expect(sw().getAttribute('aria-checked')).toBe('true');
    await click(sw());
    await flush();
    expect(store.get('/settings/wifi')).toBe(false);
    expect(sw().getAttribute('aria-checked')).toBe('false');
    expect(onAction).toHaveBeenCalledWith('wifiChanged', { on: false });
    await act(async () => store.set('/settings/wifi', true));
    expect(sw().getAttribute('aria-checked')).toBe('true');
  });

  test('TextField: typing writes the bound path; $template text follows it', async () => {
    const spec: Spec = {
      root: 'v',
      elements: {
        v: { type: 'VStack', props: {}, children: ['f', 'hello'] },
        f: { type: 'TextField', props: { value: { $bindState: '/form/name' }, placeholder: 'Name' }, children: [] },
        hello: { type: 'Text', props: { text: { $template: 'Hello, ${/form/name}!' } }, children: [] },
      },
      state: { form: { name: 'Ana' } },
    };
    const onStateChange = vi.fn();
    mounted = await render(<LiquidRenderer fallback spec={spec} onStateChange={onStateChange} />);
    const input = mounted.container.querySelector('input')!;
    expect(input.value).toBe('Ana');
    expect(mounted.container.textContent).toContain('Hello, Ana!');
    await type(input, 'Nika');
    expect(mounted.container.textContent).toContain('Hello, Nika!');
    expect(onStateChange).toHaveBeenCalled();
    expect(onStateChange.mock.calls.at(-1)![0][0].path).toBe('/form');
  });

  test('visibility follows bound state', async () => {
    const spec: Spec = {
      root: 'v',
      elements: {
        v: { type: 'VStack', props: {}, children: ['sw', 'secret'] },
        sw: { type: 'Switch', props: { isOn: { $bindState: '/show' } }, children: [] },
        secret: { type: 'Text', props: { text: 'Now you see me' }, visible: { $state: '/show' }, children: [] },
      },
      state: { show: false },
    };
    mounted = await render(<LiquidRenderer fallback spec={spec} />);
    expect(mounted.container.textContent).not.toContain('Now you see me');
    await click(mounted.container.querySelector('[role="switch"]'));
    expect(mounted.container.textContent).toContain('Now you see me');
  });

  test('Form values ↔ state object; fields write values[name]; submit runs only when checks pass', async () => {
    const store = createStateStore({ signup: { email: '' } });
    const onAction = vi.fn();
    const spec: Spec = {
      root: 'form',
      elements: {
        form: { type: 'Form', props: { values: { $bindState: '/signup' } }, on: { submit: { action: 'signUp', params: { values: { $state: '/signup' } } } }, children: ['sec', 'go'] },
        sec: { type: 'FormSection', props: {}, children: ['email', 'news'] },
        email: { type: 'TextFieldRow', props: { name: 'email', label: 'Email', checks: [{ type: 'required' }, { type: 'email' }] }, children: [] },
        news: { type: 'ToggleRow', props: { name: 'news', label: 'News', defaultValue: true }, children: [] },
        go: { type: 'SubmitButton', props: { label: 'Join' }, children: [] },
      },
    };
    mounted = await render(<LiquidRenderer fallback spec={spec} store={store} onAction={onAction} />);
    await flush();
    expect(store.get('/signup/news')).toBe(true); // the toggle's default reached the state
    const submit = () => [...mounted!.container.querySelectorAll('button')].find((b) => b.textContent?.includes('Join'));
    await click(submit());
    await flush();
    expect(onAction).not.toHaveBeenCalled();
    expect(mounted.container.textContent).toMatch(/required|Email/i);

    await type(mounted.container.querySelector('input')!, 'ana@example.com');
    expect(store.get('/signup/email')).toBe('ana@example.com');
    await click(submit());
    await flush();
    expect(onAction).toHaveBeenCalledWith('signUp', { values: { email: 'ana@example.com', news: true } });
  });

  test('state from spec.state streams in late and fills missing paths only', async () => {
    const base: Spec = { root: 's', elements: { s: { type: 'Switch', props: { isOn: { $bindState: '/a' } }, children: [] } } };
    mounted = await render(<LiquidRenderer fallback spec={base} state={{ b: 1 }} />);
    const sw = () => mounted!.container.querySelector('[role="switch"]')!;
    expect(sw().getAttribute('aria-checked')).toBe('false');
    await mounted.rerender(<LiquidRenderer fallback spec={{ ...base, state: { a: true, b: 2 } }} state={{ b: 1 }} />);
    expect(sw().getAttribute('aria-checked')).toBe('true');
  });
});
