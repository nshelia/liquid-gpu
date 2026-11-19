/**
 * The Liquid json-render catalog: every @liquid-gpu/react component a model may use, with its zod props, slots and
 * events. `liquidCatalog.prompt()` (or `liquidPrompt()`) is the system prompt for the LLM.
 */
import { defineCatalog, type PromptOptions } from '@json-render/core';
import { schema } from '@json-render/react/schema';
import type { z } from 'zod';
import { iconNames } from '@liquid-gpu/react';
import { liquidComponents } from './schemas';

/** App-specific actions a model may bind with `on` (built-ins setState / pushState / removeState / validateForm are always available). */
export type LiquidActionDefinitions = Record<string, { params?: z.ZodType; description?: string }>;

/** Rules appended to every Liquid prompt (iOS idioms the generic json-render prompt does not know). */
export const liquidRules: string[] = [
  'This UI renders as native-looking iOS 27 (Liquid Glass). Prefer iOS idioms: Settings-style List > Section > Row, Form > FormSection > *Row fields, Screen with a title, glass BarButtons.',
  'Icons are SF Symbol names as strings (e.g. "gear", "bell.fill", "wifi", "person.crop.circle", "chevron.right", "heart.fill", "square.and.arrow.up") from the available icon list below. Never use emoji or image URLs for icons.',
  'Colours are system colour names ("blue", "red", "green", "orange", "purple", "gray", "tint", "secondaryLabel") or CSS colours.',
  'Overlays (Sheet, Alert, ConfirmationDialog, Toast, Popover) are shown while the boolean at their openPath is true: seed it in /state as false and open it with on.press { "action": "setState", "params": { "statePath": "/ui/x", "value": true } }. Dismissing writes false.',
  'Menu / ContextMenu items, Row swipe actions and Alert actions name an event ("event": "delete"); bind that event in the element\'s `on` field like any other event.',
  'Form fields (TextFieldRow, SecureFieldRow, ToggleRow, StepperRow, SliderRow, Field) are bound by `name` to the Form values; bind the Form values with { "$bindState": "/formName" }. Validation uses `checks`: [{ "type": "required" }, { "type": "email" }, { "type": "minLength", "value": 8 }, { "type": "matches", "value": "password", "message": "Passwords must match" }]. Put a SubmitButton last and bind the Form on.submit.',
  'Push navigation: NavigationStack (child = root Screen, destinations = { value: elementId }) and NavigationLink { value }. The destination Screens are extra elements that are not children of anything else.',
  'Charts take plain data rows in props.data with string keys x / y (and series for multi-series). Metric shows a KPI; delta 0.12 means +12%.',
  'Keep the UI compact: it is shown inline in a chat message. Use a VStack with padding "standard" as the root for cards and dashboards; use Screen only for app-like flows.',
];

/** Rule listing every registered icon name (unknown names render a question-mark placeholder). */
export function iconRule(): string {
  return `Available icon names (use only these): ${iconNames.join(', ')}.`;
}

export function createLiquidCatalog<A extends LiquidActionDefinitions = Record<never, never>>(options: { actions?: A } = {}) {
  return defineCatalog(schema, {
    components: liquidComponents,
    actions: (options.actions ?? {}) as A,
  });
}

/** The catalog with every Liquid component and no app actions. */
export const liquidCatalog = createLiquidCatalog();

export type LiquidCatalog = typeof liquidCatalog;

/** Every component name in the catalog. */
export const liquidComponentNames = Object.keys(liquidComponents) as (keyof typeof liquidComponents)[];

/** Catalog-like value accepted by `liquidPrompt` (any catalog built with `createLiquidCatalog`). */
interface PromptCatalog {
  prompt(options?: PromptOptions): string;
}

/**
 * The system prompt for an LLM: json-render's JSONL patch format, every Liquid component with its props, the actions,
 * and the Liquid rules. `mode: "inline"` lets the model answer in prose and then emit the UI.
 */
export function liquidPrompt(options: PromptOptions & { catalog?: PromptCatalog } = {}): string {
  const { catalog = liquidCatalog, customRules = [], ...rest } = options;
  return catalog.prompt({
    system: 'You are a UI generator for an iOS 27 (Liquid Glass) design system. You output json-render specs.',
    ...rest,
    customRules: [...liquidRules, iconRule(), ...customRules],
  });
}
