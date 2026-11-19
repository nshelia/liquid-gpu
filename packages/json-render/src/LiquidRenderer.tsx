/**
 * `<LiquidRenderer spec onAction />`: renders a (possibly still streaming) json-render spec as iOS 27 UI inside an
 * inline, auto-height `LiquidRoot`, so it can sit in a chat message.
 */
import { useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from 'react';
import { createStateStore, getByPath, type ComputedFunction, type Spec, type StateModel, type StateStore } from '@json-render/core';
import {
  ActionProvider,
  JSONUIProvider,
  Renderer,
  StateProvider,
  ValidationProvider,
  VisibilityProvider,
  useActions,
  type ComponentRegistry,
} from '@json-render/react';
import { Alert, LiquidRoot, type LiquidRootProps, type ThemeOverrides } from '@liquid-gpu/react';
import { LiquidFallback, createLiquidRegistry, liquidRegistry } from './registry';
import { SpecContext } from './runtime';
import { toSpec } from './stream';

export type ActionHandlerFn = (params: Record<string, unknown>) => unknown;

export interface LiquidRendererProps {
  /** The spec (partial while streaming). `null` renders nothing. */
  spec: Spec | null | undefined;
  /**
   * Catalog the spec was generated against (default: `liquidCatalog`). Element types outside it render a Skeleton
   * while streaming and nothing afterwards.
   */
  catalog?: { componentNames: string[] };
  /** Extra components (json-render renderers) merged over the Liquid adapters. */
  components?: ComponentRegistry;
  /** Initial state merged under `spec.state` (uncontrolled). */
  state?: StateModel;
  /** External state store (controlled mode); `state` and `spec.state` then only fill paths the store lacks. */
  store?: StateStore;
  /** Called for every action that has no entry in `handlers` (catalog actions bound with `on`). */
  onAction?: (name: string, params: Record<string, unknown>) => unknown;
  /** Named action handlers. Built-ins (setState, pushState, removeState, validateForm) are handled internally. */
  handlers?: Record<string, ActionHandlerFn>;
  onStateChange?: (changes: Array<{ path: string; value: unknown }>) => void;
  /** Functions for `$computed` props. */
  functions?: Record<string, ComputedFunction>;
  /** Custom validators for `checks` of standalone inputs (`{ type: "myCheck" }`). */
  validationFunctions?: Record<string, (value: unknown, args?: Record<string, unknown>) => boolean>;
  /** The spec is still streaming: missing pieces render as skeletons and no warnings are logged. */
  loading?: boolean;
  /**
   * Wrap the output in `<LiquidRoot mode="inline" autoHeight>` (default true). Pass false when the renderer already
   * sits inside a LiquidRoot, or an object to override root props.
   */
  root?: boolean | Omit<LiquidRootProps, 'children'>;
  theme?: ThemeOverrides;
  appearance?: LiquidRootProps['appearance'];
  /** Force the CSS (non-WebGPU) renderer. */
  fallback?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Fill every leaf of `src` whose path is undefined in the store (streamed `/state/...` patches arrive late). */
function fillMissing(store: StateStore, src: unknown, path = '') {
  if (src === null || typeof src !== 'object') {
    if (path && store.get(path) === undefined) store.set(path, src);
    return;
  }
  if (path && store.get(path) === undefined) {
    store.set(path, Array.isArray(src) ? [...src] : { ...(src as object) });
    return;
  }
  for (const [k, v] of Object.entries(src as Record<string, unknown>)) fillMissing(store, v, `${path}/${k.replace(/~/g, '~0').replace(/\//g, '~1')}`);
}

/** Renders the pending `confirm` of an action binding as a Liquid alert. */
function ConfirmationHost() {
  const { pendingConfirmation, confirm, cancel } = useActions();
  const c = pendingConfirmation?.action.confirm;
  return (
    <Alert
      isPresented={!!c}
      title={c?.title ?? ''}
      message={c?.message ?? ''}
      onDismiss={() => undefined}
      actions={[
        { title: c?.cancelLabel ?? 'Cancel', role: 'cancel', onPress: cancel },
        { title: c?.confirmLabel ?? 'OK', preferred: true, ...(c?.variant === 'danger' ? { role: 'destructive' as const } : {}), onPress: confirm },
      ]}
    />
  );
}

export function LiquidRenderer({
  spec: rawSpec,
  catalog,
  components,
  state,
  store: externalStore,
  onAction,
  handlers,
  onStateChange,
  functions,
  validationFunctions,
  loading = false,
  root = true,
  theme,
  appearance,
  fallback,
  className,
  style,
}: LiquidRendererProps) {
  // Accept anything spec-shaped (also nested specs) and never throw on garbage.
  const spec = useMemo(() => (rawSpec ? toSpec(rawSpec) : null), [rawSpec]);

  const ownStore = useRef<StateStore | null>(null);
  if (!externalStore && !ownStore.current) {
    ownStore.current = createStateStore({});
    fillMissing(ownStore.current, state ?? {});
    fillMissing(ownStore.current, spec?.state ?? {});
  }
  const store = externalStore ?? ownStore.current!;
  // Streamed state arrives after the first render: fill paths the store does not have yet.
  useLayoutEffect(() => {
    if (spec?.state) fillMissing(store, spec.state);
  }, [spec?.state, store]);

  const changeRef = useRef(onStateChange);
  changeRef.current = onStateChange;
  useLayoutEffect(() => {
    if (!onStateChange) return;
    let prev = store.getSnapshot();
    return store.subscribe(() => {
      const next = store.getSnapshot();
      if (next !== prev) {
        const changes = Object.keys({ ...prev, ...next })
          .filter((k) => prev[k] !== next[k])
          .map((k) => ({ path: `/${k}`, value: getByPath(next, `/${k}`) }));
        prev = next;
        if (changes.length) changeRef.current?.(changes);
      }
    });
  }, [store, !!onStateChange]); // eslint-disable-line react-hooks/exhaustive-deps

  const registry = useMemo(() => {
    const base = components ? createLiquidRegistry(components) : liquidRegistry;
    if (!catalog) return base;
    const allowed = new Set([...catalog.componentNames, ...Object.keys(components ?? {})]);
    return Object.fromEntries(Object.entries(base).filter(([k]) => allowed.has(k)));
  }, [components, catalog]);

  const actionRef = useRef({ onAction, handlers });
  actionRef.current = { onAction, handlers };
  const actionHandlers = useMemo(
    () =>
      new Proxy({} as Record<string, ActionHandlerFn>, {
        get: (_t, name) => {
          if (typeof name !== 'string') return undefined;
          return (params: Record<string, unknown>) => {
            const { handlers: h, onAction: a } = actionRef.current;
            const fn = h?.[name];
            if (fn) return fn(params ?? {});
            if (a) return a(name, params ?? {});
            console.warn(`[liquid json-render] No handler for action "${name}".`);
            return undefined;
          };
        },
        has: () => true,
      }),
    [],
  );

  const specCtx = useMemo(() => (spec ? { spec, registry, loading, fallback: LiquidFallback } : null), [spec, registry, loading]);

  const body = (
    <SpecContext.Provider value={specCtx}>
      {spec ? <Renderer spec={spec} registry={registry} loading={loading} fallback={LiquidFallback} /> : null}
    </SpecContext.Provider>
  );
  // `$computed` functions live in a context only JSONUIProvider can fill; it brings json-render's own (unstyled)
  // confirmation dialog, so it is used only when functions are passed. Otherwise confirms use a Liquid alert.
  const content: ReactNode = functions ? (
    <JSONUIProvider
      registry={registry}
      store={store}
      handlers={actionHandlers}
      functions={functions}
      {...(validationFunctions ? { validationFunctions } : {})}
    >
      {body}
    </JSONUIProvider>
  ) : (
    <StateProvider store={store}>
      <VisibilityProvider>
        <ValidationProvider {...(validationFunctions ? { customFunctions: validationFunctions } : {})}>
          <ActionProvider handlers={actionHandlers}>
            {body}
            <ConfirmationHost />
          </ActionProvider>
        </ValidationProvider>
      </VisibilityProvider>
    </StateProvider>
  );

  if (root === false) return content;
  const rootProps: Omit<LiquidRootProps, 'children'> = {
    mode: 'inline',
    autoHeight: true,
    ...(theme ? { theme } : {}),
    ...(appearance ? { appearance } : {}),
    ...(fallback !== undefined ? { fallback } : {}),
    ...(className ? { className } : {}),
    ...(style ? { style } : {}),
    ...(typeof root === 'object' ? root : {}),
  };
  return <LiquidRoot {...rootProps}>{content}</LiquidRoot>;
}
