/**
 * Form state, framework-free (the React layer subscribes with `useSyncExternalStore`).
 *
 * - Values: uncontrolled (`initialValues`) or controlled (the Form pushes `values` in with `syncValues`, and
 *   `setValue` reports `onValuesChange` while updating its own copy so reads in the same tick see the new value).
 * - Registry: each mounted field registers a config object (checks, label, element). Several registrations may share
 *   a name (a `Field` plus a picker's own `useFormField`); their checks are concatenated.
 * - When errors show (`mode`):
 *   `submit` (default) — nothing until the first submit; afterwards every change and blur re-validates the field.
 *   `blur` — also after a field's first blur (then live on change). `change` — on every change from the start.
 *   Fields whose `matches` check targets a changed field re-validate with it once they are active.
 * - Async checks: each validation run per field carries a token; stale results are dropped.
 * - Submit: validates every registered field, focuses the first invalid one (document order when elements are known,
 *   else registration order), and otherwise calls `onSubmit(values)`; `submitting` stays true until it settles.
 */
import { dependencies, runChecks, type Check, type FormValues, type Messages, type Validator } from './validation';

export type ValidationMode = 'submit' | 'blur' | 'change';

export interface FieldRegistration {
  checks?: readonly Check[];
  label?: string;
  /** The row/control element: used for focus and document order. */
  getElement?: () => HTMLElement | null;
  /** Custom focus (otherwise the first focusable element inside `getElement()`). */
  focus?: () => void;
}

export interface FormState {
  values: FormValues;
  /** Visible errors by field name. */
  errors: Readonly<Record<string, string>>;
  /** Fields that have been blurred at least once. */
  touched: Readonly<Record<string, true>>;
  /** Fields with an async validation in flight. */
  validating: Readonly<Record<string, true>>;
  submitCount: number;
  submitting: boolean;
}

export interface FormStoreOptions {
  initialValues?: FormValues;
  mode?: ValidationMode;
  messages?: Messages;
  validators?: Record<string, Validator>;
  onValuesChange?(values: FormValues): void;
  onSubmit?(values: FormValues): void | Promise<unknown>;
  /** Called with the errors when a submit fails validation. */
  onInvalid?(errors: Record<string, string>): void;
}

const FOCUSABLE = 'input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled]),[tabindex]:not([tabindex="-1"])';

export class FormStore {
  private state: FormState;
  private listeners = new Set<() => void>();
  private regs = new Map<string, Set<FieldRegistration>>();
  private order: string[] = [];
  private tokens = new Map<string, number>();
  private submitPending = false;
  options: FormStoreOptions;

  constructor(options: FormStoreOptions = {}) {
    this.options = options;
    this.state = { values: { ...options.initialValues }, errors: {}, touched: {}, validating: {}, submitCount: 0, submitting: false };
  }

  // ── subscription ────────────────────────────────────────────────────────────
  getState = (): FormState => this.state;
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  private update(patch: Partial<FormState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of [...this.listeners]) l();
  }

  // ── registry ────────────────────────────────────────────────────────────────
  register(name: string, reg: FieldRegistration): () => void {
    let set = this.regs.get(name);
    if (!set) {
      set = new Set();
      this.regs.set(name, set);
      this.order.push(name);
    }
    set.add(reg);
    return () => {
      const s = this.regs.get(name);
      if (!s) return;
      s.delete(reg);
      if (s.size) return;
      this.regs.delete(name);
      this.order = this.order.filter((n) => n !== name);
      this.tokens.set(name, (this.tokens.get(name) ?? 0) + 1);
      // The value stays (SwiftUI-like: state outlives the view); a stale error does not.
      if (name in this.state.errors || name in this.state.validating) {
        this.update({ errors: omit(this.state.errors, name), validating: omit(this.state.validating, name) });
      }
    };
  }

  /** Registered field names in registration order. */
  fieldNames(): string[] {
    return [...this.order];
  }

  checksOf(name: string): Check[] {
    const out: Check[] = [];
    for (const r of this.regs.get(name) ?? []) if (r.checks) out.push(...r.checks);
    return out;
  }

  labelOf = (name: string): string | undefined => {
    for (const r of this.regs.get(name) ?? []) if (r.label) return r.label;
    return undefined;
  };

  // ── values ──────────────────────────────────────────────────────────────────
  getValue(name: string): unknown {
    return this.state.values[name];
  }

  /** Controlled mode: adopt the owner's values (no `onValuesChange`). Re-validates fields whose value changed. */
  syncValues(values: FormValues): void {
    const prev = this.state.values;
    if (prev === values) return;
    const changed = unionKeys(prev, values).filter((k) => !Object.is(prev[k], values[k]));
    if (!changed.length) {
      this.state = { ...this.state, values };
      return;
    }
    this.update({ values });
    for (const n of changed) this.afterChange(n);
  }

  setValue(name: string, value: unknown): void {
    if (Object.is(this.state.values[name], value)) return;
    const values = { ...this.state.values, [name]: value };
    this.update({ values });
    this.options.onValuesChange?.(values);
    this.afterChange(name);
  }

  /** Sets a field's starting value when it has none (a control's own default). */
  /** Fill values that are still undefined, without notifying (used once by `<Form initialValues>` with an external store, before any field subscribes). */
  seedValues(values: FormValues): void {
    const merged = { ...this.state.values };
    for (const [k, v] of Object.entries(values)) if (merged[k] === undefined) merged[k] = v;
    this.state = { ...this.state, values: merged };
  }

  ensureValue(name: string, value: unknown): void {
    if (value === undefined || this.state.values[name] !== undefined) return;
    const values = { ...this.state.values, [name]: value };
    this.update({ values });
    this.options.onValuesChange?.(values);
  }

  /** Back to `values` (default: the initial values); clears errors, touched and the submit count. */
  reset(values: FormValues = { ...this.options.initialValues }): void {
    for (const n of this.order) this.tokens.set(n, (this.tokens.get(n) ?? 0) + 1);
    this.update({ values, errors: {}, touched: {}, validating: {}, submitCount: 0 });
    this.options.onValuesChange?.(values);
  }

  // ── validation triggers ─────────────────────────────────────────────────────
  /** Whether a field shows live validation now. */
  isActive(name: string): boolean {
    const { mode = 'submit' } = this.options;
    return this.state.submitCount > 0 || mode === 'change' || (mode === 'blur' && !!this.state.touched[name]);
  }

  private afterChange(name: string): void {
    if (this.isActive(name)) void this.validateField(name);
    // Dependents (`matches` → name) re-check once active, so "Passwords don't match" clears as soon as they do.
    for (const other of this.order) {
      if (other !== name && this.isActive(other) && dependencies(this.checksOf(other)).includes(name)) void this.validateField(other);
    }
  }

  blur(name: string): void {
    if (!this.state.touched[name]) this.update({ touched: { ...this.state.touched, [name]: true } });
    if (this.isActive(name)) void this.validateField(name);
  }

  /** Validates one field now and shows the result. */
  validateField(name: string): Promise<string | null> {
    const token = (this.tokens.get(name) ?? 0) + 1;
    this.tokens.set(name, token);
    const r = runChecks(this.state.values[name], this.checksOf(name), {
      values: this.state.values,
      label: this.labelOf(name),
      labelOf: this.labelOf,
      messages: this.options.messages,
      validators: this.options.validators,
    });
    if (!(r instanceof Promise)) {
      this.setError(name, r);
      return Promise.resolve(r);
    }
    if (!this.state.validating[name]) this.update({ validating: { ...this.state.validating, [name]: true } });
    return r.then((err) => {
      if (this.tokens.get(name) !== token) return err; // stale
      this.update({ validating: omit(this.state.validating, name) });
      this.setError(name, err);
      return err;
    });
  }

  private setError(name: string, err: string | null): void {
    const cur = this.state.errors[name];
    if ((cur ?? null) === err) return;
    this.update({ errors: err ? { ...this.state.errors, [name]: err } : omit(this.state.errors, name) });
  }

  /** Validates every registered field and shows the results. */
  async validate(): Promise<Record<string, string>> {
    const results = await Promise.all(this.order.map(async (n) => [n, await this.validateField(n)] as const));
    const errors: Record<string, string> = {};
    for (const [n, e] of results) if (e) errors[n] = e;
    return errors;
  }

  /** First invalid field in document order (registration order when elements are unknown). */
  firstInvalid(errors: Record<string, string> = this.state.errors as Record<string, string>): string | undefined {
    const names = this.order.filter((n) => errors[n]);
    const el = (n: string) => {
      for (const r of this.regs.get(n) ?? []) {
        const e = r.getElement?.();
        if (e) return e;
      }
      return null;
    };
    return names.sort((a, b) => {
      const ea = el(a);
      const eb = el(b);
      if (!ea || !eb || typeof Node === 'undefined') return 0;
      return ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
    })[0];
  }

  focus(name: string): boolean {
    for (const r of this.regs.get(name) ?? []) {
      if (r.focus) {
        r.focus();
        return true;
      }
      const host = r.getElement?.();
      const target = host?.matches?.(FOCUSABLE) ? host : host?.querySelector<HTMLElement>(FOCUSABLE);
      if (target) {
        target.focus();
        return true;
      }
    }
    return false;
  }

  /** Validate, then `onSubmit(values)`; resolves true when submitted. Ignored while a submit is in flight. */
  async submit(): Promise<boolean> {
    if (this.submitPending) return false;
    this.submitPending = true;
    try {
      this.update({ submitCount: this.state.submitCount + 1 });
      const errors = await this.validate();
      if (Object.keys(errors).length) {
        const first = this.firstInvalid(errors);
        if (first) this.focus(first);
        this.options.onInvalid?.(errors);
        return false;
      }
      const values = this.state.values;
      const r = this.options.onSubmit?.(values);
      if (r instanceof Promise) {
        this.update({ submitting: true });
        try {
          await r;
        } finally {
          this.update({ submitting: false });
        }
      }
      return true;
    } finally {
      this.submitPending = false;
    }
  }

  /** Shows a server-side error on a field (e.g. "Email already registered"). `null` clears it. */
  setFieldError(name: string, error: string | null): void {
    this.setError(name, error);
  }
}

function omit<T extends Record<string, unknown>>(o: T, k: string): T {
  if (!(k in o)) return o;
  const { [k]: _, ...rest } = o;
  return rest as T;
}

function unionKeys(a: object, b: object): string[] {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])];
}
