# @liquid-gpu/json-render

Generative UI for `@liquid-gpu/react`. An LLM streams a [json-render](https://json-render.dev) spec and `<LiquidRenderer>` renders it as iOS 27 UI (Liquid Glass through WebGPU, with a CSS fallback). It keeps rendering while the spec is still arriving.

The package builds on the real json-render packages (`@json-render/core` and `@json-render/react` 0.23.2, plus `zod` 4). It provides:

- **The catalog** (`liquidCatalog`): 77 components, each with zod props, a one-line description, slots and events. It is built with json-render's `defineCatalog` and the React `schema`.
- **The registry** (`liquidRegistry`): thin adapters that turn JSON props into the real components. Each element gets its own error boundary, and while the spec streams an element shows a Skeleton until its props are complete.
- **`<LiquidRenderer>`**: json-render's providers wrapped in `<LiquidRoot mode="inline" autoHeight>`, so the output can sit in a chat message.
- **Streaming helpers**: these accept json-render SpecStream (JSONL patches), a plain or partial JSON spec, or a nested spec.
- **`liquidPrompt()`**: the system prompt for the model.

```bash
npm install @liquid-gpu/json-render @liquid-gpu/react react react-dom
```

## Render a spec

```tsx
import { LiquidRenderer, type Spec } from '@liquid-gpu/json-render';

const spec: Spec = {
  root: 'card',
  elements: {
    card: { type: 'VStack', props: { spacing: 12, padding: 'standard' }, children: ['title', 'wifi', 'save'] },
    title: { type: 'Heading', props: { text: 'Network', level: 2 }, children: [] },
    wifi: { type: 'Switch', props: { label: 'Wi-Fi', isOn: { $bindState: '/wifi' } }, children: [] },
    save: {
      type: 'Button',
      props: { label: 'Save', variant: 'filled', icon: 'checkmark' },
      on: { press: { action: 'save', params: { wifi: { $state: '/wifi' } } } },
      children: [],
    },
  },
  state: { wifi: true },
};

<LiquidRenderer spec={spec} onAction={(name, params) => console.log(name, params)} />;
```

`LiquidRenderer` props:

| prop | |
| --- | --- |
| `spec` | The spec, or a partial spec while it streams. Anything spec-shaped is accepted, including a nested `{ type, props, children: [{…}] }` tree. |
| `loading` | `true` while the spec streams. Incomplete elements and unknown types show a Skeleton, and missing children render nothing. |
| `onAction(name, params)` / `handlers` | Your actions. The json-render built-ins (`setState`, `pushState`, `removeState`, `validateForm`) are handled for you. If a binding sets `confirm`, a Liquid alert asks first. |
| `state` / `store` / `onStateChange` | The initial state (merged under `spec.state`), or an external json-render `StateStore`. `/state` paths that stream in late only fill paths the store does not have yet. |
| `theme`, `appearance`, `fallback` | Passed to `LiquidRoot`. `fallback` forces the CSS renderer. |
| `root` | `false` skips the `LiquidRoot` when you already render inside one. An object overrides root props, for example `{ mode: 'inline', autoHeight: false, style: { height: 640 } }` for a `NavigationStack` or `TabView`. |
| `components` | Extra json-render renderers (`({ element, children, emit }) => …`) merged into the registry. |
| `catalog` | Restricts rendering to the components in this catalog. |
| `functions`, `validationFunctions` | Functions for `$computed` props, and custom validators for standalone `checks`. |

## Get the system prompt for an LLM

```ts
import { liquidPrompt, createLiquidCatalog } from '@liquid-gpu/json-render';
import { z } from 'zod';

// Every component with its props, slots and events, json-render's JSONL patch format, the built-in actions,
// and the Liquid rules (iOS idioms, the openPath convention, form checks, and the full list of icon names).
const system = liquidPrompt();

// With app actions and extra rules; `mode: 'inline'` lets the model write prose first, then the UI.
const catalog = createLiquidCatalog({
  actions: { bookTable: { params: z.object({ time: z.string(), guests: z.number() }), description: 'Book a table' } },
});
const chatSystem = liquidPrompt({ catalog, mode: 'inline', customRules: ['Offer at most three time slots.'] });
```

`liquidCatalog.prompt()` also works. `liquidPrompt` is a wrapper around it that adds the Liquid rules. `catalog.jsonSchema()` exports a JSON Schema if you use structured outputs.

## Stream model output

```tsx
import { LiquidRenderer, useLiquidSpecStream } from '@liquid-gpu/json-render';

function Message({ response }: { response: Response }) {
  const { spec, push, end, streaming } = useLiquidSpecStream();
  useEffect(() => {
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        push(value);
      }
      end();
    })();
  }, [response]);
  return <LiquidRenderer spec={spec} loading={streaming} />;
}
```

`createLiquidSpecStream()` is the framework-free version, with `push(chunk)` returning the spec so far. It detects the format from the first key it sees:

- `{"op":…}` lines are json-render SpecStream. Each line is applied with json-render's `createSpecStreamCompiler`.
- Anything else is one JSON object, read with `parsePartialJson`. A truncated value yields what has arrived so far. A half-received `"type"`, `"root"` or `$`-expression string is held back, so `"Tex…"` never renders as `Text`.

json-render's own `useUIStream` and `useChatUI` (from `@json-render/react`) also produce specs that `LiquidRenderer` renders.

## Conventions the catalog uses

- **Icons** are SF-Symbol-style names (`"gear"`, `"bell.fill"`). The names come from `iconNames`, `resolveIcon` turns them into nodes, and the prompt lists all of them.
- **Two-way values** use `{ "$bindState": "/path" }` on the natural prop: `isOn`, `value`, `selection`, `page`, `isExpanded`, the Form's `values`, a Menu's `value`. Inside `repeat`, use `$bindItem`. Unbound controls keep their own local state.
- **Events** go in the element's `on` field: `press`, `change`, `submit`, `select`, `dismiss`, `complete`. Menu and ContextMenu items, Row swipe actions and Alert buttons each name an `event` (a menu item defaults to its `id`), and you bind that event in `on` like any other.
- **Overlays** (Sheet, Alert, ConfirmationDialog, Toast, Popover) are shown while the boolean at `openPath` is true. Dismissing them writes `false`. A Popover's `anchor` is the `id` prop of another element.
- **Forms**: `Form { values: { $bindState: "/signup" } }` holds the rows. Each row (`TextFieldRow`, `SecureFieldRow`, `ToggleRow`, `StepperRow`, `SliderRow`, or `Field` around any control) writes `values[name]`. `checks` maps directly to the form's `Check` type, either as `{ type, value }` or in json-render's `{ type, args }` form. `SubmitButton` validates every field, and the Form emits `submit` only when all checks pass. Standalone `TextField` and `TextEditor` take `checks` too, and those go through json-render's ValidationProvider, so `validateForm` sees them.
- **Navigation**: the child of `NavigationStack` is the root `Screen`. `destinations` maps a `value` to an element id, and `NavigationLink { value }` pushes that element. `TabView` children are `Tab` elements. A `Screen` wraps its content in a ScrollView under the bar. Its `leading`, `trailing` and `toolbar` slots take bar buttons.
- **Charts** take plain rows (`data`) with string keys `x`, `y` and `series`.

## Validation

```ts
import { validateLiquidSpec } from '@liquid-gpu/json-render';
validateLiquidSpec(spec); // { valid, issues: [{ element, type, path, message, severity }] }
```

It checks types, props against the zod schemas, children, slots and destinations that must resolve, and unreferenced elements (reported as warnings). Unlike `catalog.validate()`, it accepts dynamic expressions (`$state`, `$bindState`, `$cond`, `$template`…) for any prop.

## Other exports

`liquidComponents` (definitions), `liquidAdapters` / `createLiquidRegistry` / `wrapAdapter` (build your own registry), `ElementById` (render a spec element by id from inside an adapter), `useBound` / `useBoundProp` / `useOpenPath`, `toMenuContent` / `toSwipeActions` / `toFormCheck`, and the example specs `settingsSpec`, `signUpSpec`, `dashboardSpec` with `specToPatches(spec)` (a spec as SpecStream).

The demo is `apps/demo/genui.html`.
