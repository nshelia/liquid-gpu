/**
 * Form / FormSection / useFormField / useForm / SubmitButton.
 *
 * SwiftUI `Form` on iPhone renders as an insetGrouped List: 52 pt rows, radius 26 cards, text at x 40
 * (SC = uikit-internals/deep/swiftui-components/spec.md §6 "Form (automatic) = insetGrouped"), so `Form` is a
 * `<form>` around `<List>`, and `FormSection` is `<Section>` (header Semibold 17 not uppercased, footer 13 pt in
 * secondaryLabel, LS = components/lists.md §0 typography, §1.3).
 *
 * Validation state lives in a `FormStore` (store.ts); fields subscribe with `useFormField(name)`, which other
 * controls (pickers, date fields) use to plug in: `{ value, setValue, error, onBlur, ref }`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { metrics } from '@liquid-gpu/core';
import { List, Section, type SectionProps } from '../list/List';
import { Button } from '../controls/Button';
import { ActivityIndicator } from '../controls/Progress';
import type { ButtonSize, ButtonVariant } from '../controls/logic';
import { FormStore, type FieldRegistration, type FormState, type ValidationMode } from './store';
import type { Check, FormValues, Messages, Validator } from './validation';
import { FormRow } from './FormRow';

export const FormContext = createContext<FormStore | null>(null);

/** The enclosing form's store (null outside a Form). */
export function useFormStore(): FormStore | null {
  return useContext(FormContext);
}

const NO_STORE = new FormStore();

export interface FormProps {
  children?: ReactNode;
  /** Controlled values; pair with `onValuesChange`. */
  values?: FormValues;
  onValuesChange?(values: FormValues): void;
  /** Uncontrolled starting values. */
  initialValues?: FormValues;
  /** Called with the values after a submit passes validation; a returned Promise keeps `submitting` true. */
  onSubmit?(values: FormValues): void | Promise<unknown>;
  /** Called with the errors when a submit fails validation (after the first invalid field is focused). */
  onInvalid?(errors: Record<string, string>): void;
  /** When errors start showing; afterwards a field re-validates on change and blur. Default `submit`. */
  mode?: ValidationMode;
  /** Message overrides per check type (`{label}`, `{value}`, `{otherLabel}` are interpolated). */
  messages?: Messages;
  /** Named validators for `{ type: 'custom', name }` checks (keeps specs serialisable). */
  validators?: Record<string, Validator>;
  /** Enter in a single-line field submits (default true). */
  submitOnEnter?: boolean;
  /** Use an existing store (e.g. to call `submit()` from a nav-bar button outside the form). */
  store?: FormStore;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
}

/** Creates a store you can hold outside the Form (pass it as `store`). */
export function useCreateFormStore(options?: ConstructorParameters<typeof FormStore>[0]): FormStore {
  const [s] = useState(() => new FormStore(options));
  return s;
}

const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color']);

export function Form({
  children,
  values,
  onValuesChange,
  initialValues,
  onSubmit,
  onInvalid,
  mode,
  messages,
  validators,
  submitOnEnter = true,
  store: external,
  className,
  style,
  ...aria
}: FormProps) {
  const [own] = useState(() => new FormStore({ initialValues: values ?? initialValues }));
  const store = external ?? own;
  // An external store (`useCreateFormStore()`) was built without the initial values: seed them once, before the
  // fields render (each field's `ensureValue` would otherwise fill in its own default, e.g. a ToggleRow's false).
  useState(() => {
    if (external && initialValues && !external.options.initialValues) external.seedValues(initialValues);
  });
  // Latest callbacks/options without re-creating the store.
  store.options = { ...store.options, initialValues: store.options.initialValues ?? initialValues, mode, messages, validators, onValuesChange, onSubmit, onInvalid };
  useLayoutEffect(() => {
    if (values !== undefined) store.syncValues(values);
  }, [values, store]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void store.submit();
  };
  const handleKey = (e: KeyboardEvent<HTMLFormElement>) => {
    if (!submitOnEnter || e.key !== 'Enter' || e.nativeEvent.isComposing || e.shiftKey || e.altKey || e.metaKey || e.ctrlKey) return;
    const t = e.target as HTMLElement;
    if (!(t instanceof HTMLInputElement) || NON_TEXT_INPUTS.has(t.type)) return;
    e.preventDefault(); // we submit ourselves: native implicit submission needs a submit button and one field
    void store.submit();
  };

  return (
    <FormContext.Provider value={store}>
      <form noValidate className={className} style={{ margin: 0, ...style }} onSubmit={handleSubmit} onKeyDown={handleKey} aria-label={aria['aria-label']}>
        <List>{children}</List>
      </form>
    </FormContext.Provider>
  );
}

/** A form section: SwiftUI `Section { } header: { } footer: { }` in an insetGrouped list (LS §1.3). */
export function FormSection(props: Omit<SectionProps, 'onMove'>) {
  return <Section {...props} />;
}

/** Subscribes to a slice of the form state (`selector` must return a stable value for unchanged state). */
export function useFormSelector<T>(selector: (s: FormState) => T): T {
  const store = useFormStore() ?? NO_STORE;
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()), () => selector(store.getState()));
}

export interface UseFormFieldOptions<V> {
  checks?: readonly Check[];
  /** Used in messages ("Email is required.") and by `matches` on other fields. */
  label?: string;
  /** Value written into the form at mount when it has none (a control's own default, e.g. `false` for a toggle). */
  defaultValue?: V;
  /** Custom focus for "focus the first invalid field". */
  focus?: () => void;
}

export interface FormFieldApi<V = unknown> {
  name: string;
  value: V | undefined;
  setValue(value: V): void;
  /** Visible error message, or undefined. */
  error: string | undefined;
  invalid: boolean;
  /** An async check is running. */
  validating: boolean;
  /** Call when the control loses focus (validates per the form's mode). */
  onBlur(): void;
  /** Attach to the control or its row: used to focus the field and order "first invalid". */
  ref(el: HTMLElement | null): void;
  /** Stable DOM id for the control, and the id of its message line (for `aria-describedby`). */
  id: string;
  messageId: string;
  required: boolean;
}

/**
 * Binds a control to the enclosing Form's field `name`. Outside a Form it still works as local state, so a picker
 * using it renders standalone too.
 */
export function useFormField<V = unknown>(name: string, options: UseFormFieldOptions<V> = {}): FormFieldApi<V> {
  const ctxStore = useFormStore();
  const [local] = useState(() => new FormStore());
  const store = ctxStore ?? local;
  const elRef = useRef<HTMLElement | null>(null);
  // One registration object per hook instance, read lazily by the store (inline `checks` arrays don't re-register).
  const reg = useRef<FieldRegistration>({}).current;
  reg.checks = options.checks;
  reg.label = options.label;
  reg.focus = options.focus;
  reg.getElement = () => elRef.current;
  useLayoutEffect(() => {
    const off = store.register(name, reg);
    store.ensureValue(name, options.defaultValue);
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, name]);

  const value = useSyncExternalStore(store.subscribe, () => store.getState().values[name], () => store.getState().values[name]) as V | undefined;
  const error = useSyncExternalStore(store.subscribe, () => store.getState().errors[name], () => store.getState().errors[name]);
  const validating = useSyncExternalStore(store.subscribe, () => !!store.getState().validating[name], () => false);
  const setValue = useCallback((v: V) => store.setValue(name, v), [store, name]);
  const onBlur = useCallback(() => store.blur(name), [store, name]);
  const ref = useCallback((el: HTMLElement | null) => {
    elRef.current = el;
  }, []);
  const id = useId();
  return {
    name,
    value: value === undefined ? options.defaultValue : value,
    setValue,
    error,
    invalid: !!error,
    validating,
    onBlur,
    ref,
    id: `${id}field`,
    messageId: `${id}msg`,
    required: !!options.checks?.some((c) => c.type === 'required'),
  };
}

export interface FormApi {
  store: FormStore;
  values: FormValues;
  errors: Readonly<Record<string, string>>;
  submitting: boolean;
  submitCount: number;
  submit(): Promise<boolean>;
  reset(values?: FormValues): void;
  setValue(name: string, value: unknown): void;
  setFieldError(name: string, error: string | null): void;
}

/** The enclosing form's state and actions. */
export function useForm(): FormApi {
  const store = useFormStore() ?? NO_STORE;
  const s = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return useMemo(
    () => ({
      store,
      values: s.values,
      errors: s.errors,
      submitting: s.submitting,
      submitCount: s.submitCount,
      submit: () => store.submit(),
      reset: (v?: FormValues) => store.reset(v),
      setValue: (n: string, v: unknown) => store.setValue(n, v),
      setFieldError: (n: string, e: string | null) => store.setFieldError(n, e),
    }),
    [store, s],
  );
}

export interface SubmitButtonProps {
  children?: ReactNode;
  /**
   * `prominent` (default): a full-width `.borderedProminent` (filled) large button below the sections, the sign-up
   * idiom. `row`: SwiftUI `Button` inside a Form section, a 52 pt row with tint text (SC §6).
   */
  appearance?: 'prominent' | 'row';
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  /** Show an activity indicator while `onSubmit` is pending (default true). */
  showProgress?: boolean;
  style?: CSSProperties;
}

export function SubmitButton({ children = 'Submit', appearance = 'prominent', variant = 'filled', size = 'large', disabled, showProgress = true, style }: SubmitButtonProps) {
  const store = useFormStore() ?? NO_STORE;
  const submitting = useSyncExternalStore(store.subscribe, () => store.getState().submitting, () => false);
  const off = disabled || submitting;
  const spinner = showProgress && submitting ? <ActivityIndicator aria-label="Submitting" /> : null;
  if (appearance === 'row') {
    return (
      <FormRow>
        <button
          type="button"
          disabled={off}
          onClick={() => void store.submit()}
          aria-busy={submitting || undefined}
          style={{
            flex: 1,
            minHeight: metrics.rowHeight,
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            color: off ? 'var(--lq-tertiary-label)' : 'var(--lq-tint)',
            textAlign: 'left',
            ...style,
          }}
        >
          {children}
          {spinner}
        </button>
      </FormRow>
    );
  }
  return (
    // Placed after the last section: same 35 pt gap as a header-less section (LS §1.3 via list/List.tsx), card inset
    // 20 (metrics.insetGroupedSideInset). TODO(unknown): no native sign-up form capture; spacing follows List.
    <div style={{ padding: `35px ${metrics.insetGroupedSideInset}px 0`, ...style }}>
      <Button variant={variant} size={size} fullWidth disabled={off} onClick={() => void store.submit()} icon={spinner ?? undefined}>
        {children}
      </Button>
    </div>
  );
}

export type { FormState, ValidationMode };
