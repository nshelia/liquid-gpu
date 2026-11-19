/**
 * Shared adapter plumbing: spec access (render another element by id), two-way bound values, `openPath` overlays and
 * prop normalisation (icon names → nodes, menu JSON → MenuContent, checks → form checks).
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getByPath, type Spec } from '@json-render/core';
import { Renderer, useStateStore, type ComponentRegistry, type ComponentRenderer, type ComponentRenderProps } from '@json-render/react';
import { resolveIcon, type Check, type FormFieldApi, type MenuContent, type MenuItem, type SwipeAction } from '@liquid-gpu/react';
import type { CheckInput, MenuItemInput, SwipeActionInput } from './schemas';

// ---------------------------------------------------------------------------------------------------------------------
// Spec context: lets adapters render other elements by id (NavigationStack destinations, TabView tabs).
// ---------------------------------------------------------------------------------------------------------------------

export interface SpecContextValue {
  spec: Spec;
  registry: ComponentRegistry;
  loading: boolean;
  fallback?: ComponentRenderer;
}

export const SpecContext = createContext<SpecContextValue | null>(null);

/** Renders the spec element `id` (with the surrounding state, actions and validation). */
export function ElementById({ id }: { id: string }) {
  const ctx = useContext(SpecContext);
  if (!ctx || !ctx.spec.elements[id]) return null;
  const sub: Spec = { root: id, elements: ctx.spec.elements, ...(ctx.spec.state ? { state: ctx.spec.state } : {}) };
  return <Renderer spec={sub} registry={ctx.registry} loading={ctx.loading} {...(ctx.fallback ? { fallback: ctx.fallback } : {})} />;
}

// ---------------------------------------------------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------------------------------------------------

/** The binding of the enclosing form `Field`: controls inside it without their own `$bindState` use it. */
export const FieldBindingContext = createContext<FormFieldApi<unknown> | null>(null);

/**
 * `[value, setValue]` for a two-way prop: a `$bindState` / `$bindItem` path writes the state; inside a form `Field`
 * the field value; otherwise local state seeded from the prop (so an unbound control still responds).
 */
export function useBound<T>(value: T | undefined, bindingPath: string | undefined, fallback?: T): [T | undefined, (v: T) => void] {
  const { set } = useStateStore();
  const field = useContext(FieldBindingContext);
  const [local, setLocal] = useState<T | undefined>(value);
  const last = useRef(value);
  useEffect(() => {
    if (!Object.is(last.current, value)) {
      last.current = value;
      setLocal(value);
    }
  }, [value]);
  const setter = useCallback(
    (v: T) => {
      if (bindingPath) set(bindingPath, v);
      else if (field) field.setValue(v);
      else setLocal(v);
    },
    [bindingPath, field, set],
  );
  if (bindingPath) return [value ?? fallback, setter];
  if (field) return [(field.value as T | undefined) ?? value ?? fallback, setter];
  return [local ?? fallback, setter];
}

/** A two-way prop that also emits `event` after each change. */
export function useBoundProp<T>(p: ComponentRenderProps<Record<string, unknown>>, prop: string, event = 'change', fallback?: T) {
  const [value, setValue] = useBound<T>(p.element.props[prop] as T | undefined, p.bindings?.[prop], fallback);
  const emit = p.emit;
  const onChange = useCallback(
    (v: T) => {
      setValue(v);
      emit(event);
    },
    [setValue, emit, event],
  );
  return [value, onChange] as const;
}

/**
 * Overlay presentation from a boolean state path: `[isPresented, dismiss]`. `dismiss` writes `false` and emits
 * `dismiss`. Without `openPath` the overlay follows a bound `isPresented` prop if any (else it is shown).
 */
export function useOpenPath(openPath: string | undefined, emit: (e: string) => void): [boolean, () => void] {
  const { state, set } = useStateStore();
  const open = openPath ? !!getByPath(state, openPath) : false;
  const dismiss = useCallback(() => {
    if (openPath) set(openPath, false);
    emit('dismiss');
  }, [openPath, set, emit]);
  return [open, dismiss];
}

// ---------------------------------------------------------------------------------------------------------------------
// Prop conversion
// ---------------------------------------------------------------------------------------------------------------------

/** Icon name → `<Icon>`; undefined stays undefined. */
export function icon(name: unknown, size?: number): ReactNode {
  if (typeof name !== 'string' || !name) return undefined;
  return resolveIcon(name, size !== undefined ? { size } : undefined);
}

function toMenuItem(it: MenuItemInput, onSelect: (it: MenuItemInput) => void): MenuItem {
  const item: MenuItem = { title: String(it.title ?? ''), onSelect: () => onSelect(it) };
  if (it.id !== undefined) item.id = it.id;
  if (it.subtitle !== undefined) item.subtitle = it.subtitle;
  if (it.icon) item.icon = icon(it.icon);
  if (it.destructive !== undefined) item.destructive = it.destructive;
  if (it.disabled !== undefined) item.disabled = it.disabled;
  if (it.checked !== undefined) item.checked = it.checked;
  return item;
}

/** Menu items JSON (flat or grouped) → `MenuContent`; selecting calls `onSelect` with the JSON item. */
export function toMenuContent(items: unknown, onSelect: (it: MenuItemInput) => void): MenuContent {
  if (!Array.isArray(items)) return [];
  if (items.some((g) => Array.isArray(g))) {
    return items
      .filter((g): g is MenuItemInput[] => Array.isArray(g))
      .map((g) => g.filter(isItem).map((it) => toMenuItem(it, onSelect)));
  }
  return (items as unknown[]).filter(isItem).map((it) => toMenuItem(it, onSelect));
}

const isItem = (v: unknown): v is MenuItemInput => !!v && typeof v === 'object' && typeof (v as MenuItemInput).title === 'string';

/**
 * Menu selection: write the item id to the bound `value` path (if any), emit the item's event (default: its id), then
 * `select`.
 */
export function createMenuSelect(set: (path: string, value: unknown) => void, valuePath: string | undefined, emit: (e: string) => void) {
  return (it: MenuItemInput) => {
    if (valuePath && it.id !== undefined) set(valuePath, it.id);
    const ev = it.event ?? it.id;
    if (ev) emit(ev);
    emit('select');
  };
}

/** Swipe actions JSON → `SwipeAction[]` emitting each action's event. */
export function toSwipeActions(actions: SwipeActionInput[] | undefined, emit: (e: string) => void): SwipeAction[] | undefined {
  if (!Array.isArray(actions) || actions.length === 0) return undefined;
  return actions
    .filter((a) => a && typeof a.label === 'string')
    .map((a) => {
      const out: SwipeAction = { label: a.label, onAction: () => emit(a.event) };
      if (a.role) out.role = a.role;
      if (a.color) out.color = a.color;
      if (a.icon) out.icon = icon(a.icon, 20);
      return out;
    });
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return undefined;
}

function fieldNameFrom(v: unknown): string | undefined {
  if (typeof v === 'string') return v.replace(/^\//, '').split('/').pop();
  if (v && typeof v === 'object' && typeof (v as { $state?: unknown }).$state === 'string') return fieldNameFrom((v as { $state: string }).$state);
  return undefined;
}

/**
 * A catalog check (json-render `{ type, args }` or Liquid `{ type, value }`) → the form's `Check`. Unknown types
 * become a named custom check (resolved against the Form's `validators`).
 */
export function toFormCheck(c: CheckInput): Check | null {
  if (!c || typeof c.type !== 'string') return null;
  const args = (c.args ?? {}) as Record<string, unknown>;
  const msg = c.message !== undefined ? { message: c.message } : {};
  switch (c.type) {
    case 'required':
    case 'email':
      return { type: c.type, ...msg };
    case 'url':
      return { type: 'url', ...(c.protocols ? { protocols: c.protocols } : {}), ...msg };
    case 'minLength':
    case 'maxLength':
    case 'min':
    case 'max': {
      const key = c.type === 'minLength' || c.type === 'min' ? 'min' : 'max';
      const value = num(c.value) ?? num(args[key]) ?? num(args.value) ?? num(args.length);
      return value === undefined ? null : { type: c.type, value, ...msg };
    }
    case 'pattern': {
      const value = typeof c.value === 'string' ? c.value : typeof args.pattern === 'string' ? args.pattern : undefined;
      return value === undefined ? null : { type: 'pattern', value, ...(c.flags ? { flags: c.flags } : {}), ...msg };
    }
    case 'numeric':
      return { type: 'pattern', value: '^-?\\d*(\\.\\d+)?$', message: c.message ?? '{label} must be a number.' };
    case 'matches':
    case 'equalTo': {
      const other = fieldNameFrom(c.value) ?? fieldNameFrom(args.other) ?? fieldNameFrom(args.field) ?? fieldNameFrom(args.path);
      return other ? { type: 'matches', value: other, ...msg } : null;
    }
    case 'custom':
      return { type: 'custom', ...(c.name ? { name: c.name } : {}), ...(c.args !== undefined ? { args: c.args } : {}), ...msg };
    default:
      return { type: 'custom', name: c.type, ...(c.args !== undefined ? { args: c.args } : {}), ...msg };
  }
}

export function toFormChecks(checks: unknown): Check[] | undefined {
  if (!Array.isArray(checks)) return undefined;
  return checks.map((c) => toFormCheck(c as CheckInput)).filter((c): c is Check => c !== null);
}

/**
 * A catalog check → json-render's `ValidationCheck` (`{ type, args, message }`) for standalone inputs validated by
 * json-render's ValidationProvider.
 */
export function toValidationCheck(c: CheckInput): { type: string; args?: Record<string, unknown>; message: string } | null {
  if (!c || typeof c.type !== 'string') return null;
  const args: Record<string, unknown> = { ...(c.args ?? {}) };
  if (c.value !== undefined) {
    if (c.type === 'minLength' || c.type === 'min') args.min ??= c.value;
    else if (c.type === 'maxLength' || c.type === 'max') args.max ??= c.value;
    else if (c.type === 'pattern') args.pattern ??= c.value;
    else if (c.type === 'matches' || c.type === 'equalTo') args.other ??= typeof c.value === 'string' && c.value.startsWith('/') ? { $state: c.value } : c.value;
  }
  const message = c.message ?? defaultCheckMessage(c.type, args);
  return Object.keys(args).length ? { type: c.type, args, message } : { type: c.type, message };
}

function defaultCheckMessage(type: string, args: Record<string, unknown>): string {
  switch (type) {
    case 'required':
      return 'This field is required.';
    case 'email':
      return 'Enter a valid email address.';
    case 'url':
      return 'Enter a valid URL.';
    case 'minLength':
      return `Must be at least ${String(args.min)} characters.`;
    case 'maxLength':
      return `Must be at most ${String(args.max)} characters.`;
    case 'min':
      return `Must be at least ${String(args.min)}.`;
    case 'max':
      return `Must be at most ${String(args.max)}.`;
    case 'numeric':
      return 'Must be a number.';
    case 'matches':
    case 'equalTo':
      return 'Values do not match.';
    default:
      return 'Invalid value.';
  }
}

/** Replace `{value}` in a format template. */
export function formatTemplate(template: string | undefined, value: unknown): string | undefined {
  return template === undefined ? undefined : template.replace(/\{value\}/g, String(value ?? ''));
}

/** Children rendered by json-render, as an array aligned with `element.children`. */
export function childArray(children: ReactNode): ReactNode[] {
  if (Array.isArray(children)) return children as ReactNode[];
  return children === undefined || children === null ? [] : [children];
}
