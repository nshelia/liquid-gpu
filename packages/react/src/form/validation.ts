/**
 * Form validation engine: pure, framework-free, JSON-friendly.
 *
 * A field's `checks` array follows the json-render.dev shape, e.g.
 * `[{ type: 'required' }, { type: 'email' }, { type: 'minLength', value: 8, message: 'Too short' }]`, so a generated
 * UI spec can be validated without code. `custom` checks either carry a function (`validate`) or name one registered
 * on the Form (`validators`), so specs stay serialisable.
 *
 * Rules:
 * - Checks run in order; the first failing check's message is the field's error.
 * - Every check except `required` (and `custom`, which decides for itself) passes on an empty value, so an optional
 *   email field may be left blank.
 * - A `custom` validator may return a Promise (async check). `runChecks` stays synchronous until the first async
 *   result and then returns a Promise for the rest.
 *
 * No iOS spec covers form validation copy (SwiftUI has no validation API); the default English messages are ours.
 */

export type FormValues = Record<string, unknown>;

/** Result of a custom validator: `true` / `null` / `undefined` / `''` pass, `false` fails with the default message, a string fails with that message. */
export type ValidatorResult = boolean | string | null | undefined;
export type Validator = (value: unknown, values: FormValues, args?: unknown) => ValidatorResult | Promise<ValidatorResult>;

interface CheckBase {
  /** Overrides the message for this check; `{label}` and `{value}` are interpolated. */
  message?: string;
}

export type Check =
  | ({ type: 'required' } & CheckBase)
  | ({ type: 'email' } & CheckBase)
  | ({ type: 'url'; /** Allowed schemes without the colon. Default `['http', 'https']`. */ protocols?: string[] } & CheckBase)
  | ({ type: 'minLength'; value: number } & CheckBase)
  | ({ type: 'maxLength'; value: number } & CheckBase)
  | ({ type: 'min'; value: number } & CheckBase)
  | ({ type: 'max'; value: number } & CheckBase)
  | ({ type: 'pattern'; value: string | RegExp; flags?: string } & CheckBase)
  /** Equals another field's value (`value` = that field's name), e.g. "confirm password". */
  | ({ type: 'matches'; value: string } & CheckBase)
  /** `validate` (a function) or `name` (a validator registered on the Form) — `args` is passed through. */
  | ({ type: 'custom'; validate?: Validator; name?: string; args?: unknown } & CheckBase);

export type CheckType = Check['type'];

export interface MessageParams {
  /** The field's label, or "This field". */
  label: string;
  check: Check;
  /** The check's `value` (length, bound, pattern source, other field name). */
  value?: unknown;
  /** `matches`: the other field's label. */
  otherLabel?: string;
}

export type MessageTemplate = string | ((p: MessageParams) => string);
export type Messages = Partial<Record<CheckType, MessageTemplate>>;

export const defaultMessages: Readonly<Record<CheckType, MessageTemplate>> = {
  required: '{label} is required.',
  email: 'Enter a valid email address.',
  url: 'Enter a valid URL.',
  minLength: (p) => `${p.label} must be at least ${p.value} ${p.value === 1 ? 'character' : 'characters'}.`,
  maxLength: (p) => `${p.label} must be at most ${p.value} ${p.value === 1 ? 'character' : 'characters'}.`,
  min: '{label} must be at least {value}.',
  max: '{label} must be at most {value}.',
  pattern: '{label} is not in the correct format.',
  matches: '{label} must match {otherLabel}.',
  custom: '{label} is invalid.',
};

export const DEFAULT_LABEL = 'This field';

export interface CheckContext {
  /** All form values (for `matches` and custom validators). */
  values?: FormValues;
  /** This field's label for messages. */
  label?: string;
  /** Label lookup for other fields (`matches`). */
  labelOf?: (name: string) => string | undefined;
  /** Message overrides per check type. */
  messages?: Messages;
  /** Named validators for `{ type: 'custom', name }`. */
  validators?: Record<string, Validator>;
}

/** Empty for validation: undefined, null, NaN, a blank string, `false`, an empty array. `0` is not empty. */
export function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null || v === false) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number') return Number.isNaN(v);
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

// Pragmatic address shape (one @, no spaces, a dot in the domain). Not RFC 5322; servers do the real check.
const EMAIL_RE = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@.]{2,}$/;

export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim()) && !v.includes('..');
}

export function isUrl(v: string, protocols: readonly string[] = ['http', 'https']): boolean {
  try {
    const u = new URL(v.trim());
    return protocols.includes(u.protocol.replace(/:$/, '')) && (u.hostname.length > 0 || u.protocol === 'mailto:');
  } catch {
    return false;
  }
}

/** Length in code points (an emoji counts once), or array length. */
function lengthOf(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  return Array.from(String(v)).length;
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() !== '') return Number(v);
  return NaN;
}

const patternCache = new Map<string, RegExp>();
function toRegExp(p: string | RegExp, flags?: string): RegExp {
  if (p instanceof RegExp) return p;
  const key = `${flags ?? ''}/${p}`;
  let re = patternCache.get(key);
  if (!re) {
    re = new RegExp(p, flags);
    patternCache.set(key, re);
  }
  return re;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  // Treat missing and empty string alike ("" vs undefined before the other field is typed into).
  return (a ?? '') === (b ?? '');
}

/** Renders a check's failure message: per-check `message`, then the form's `messages`, then the defaults. */
export function formatMessage(check: Check, ctx: CheckContext = {}): string {
  const label = ctx.label || DEFAULT_LABEL;
  const value = 'value' in check ? (check.value instanceof RegExp ? check.value.source : check.value) : undefined;
  const otherLabel = check.type === 'matches' ? ctx.labelOf?.(check.value) || check.value : undefined;
  const params: MessageParams = { label, check, value, otherLabel };
  const tpl: MessageTemplate = check.message ?? ctx.messages?.[check.type] ?? defaultMessages[check.type];
  if (typeof tpl === 'function') return tpl(params);
  return tpl.replace(/\{(label|value|otherLabel)\}/g, (_, k: string) => String((params as unknown as Record<string, unknown>)[k] ?? ''));
}

/**
 * Runs one check. Returns `null` when it passes, the error message when it fails, or a Promise of either for an
 * async custom validator.
 */
export function runCheck(value: unknown, check: Check, ctx: CheckContext = {}): string | null | Promise<string | null> {
  const fail = () => formatMessage(check, ctx);
  if (check.type === 'custom') {
    const fn = check.validate ?? (check.name ? ctx.validators?.[check.name] : undefined);
    if (!fn) {
      // An unknown named validator is a spec error, not a user error: surface it in development, pass the field.
      if (check.name && typeof console !== 'undefined') console.warn(`[form] unknown validator "${check.name}"`);
      return null;
    }
    const r = fn(value, ctx.values ?? {}, check.args);
    const map = (res: ValidatorResult): string | null => (res === false ? fail() : typeof res === 'string' && res !== '' ? res : null);
    return isPromise(r) ? r.then(map, (e: unknown) => (e instanceof Error && e.message ? e.message : fail())) : map(r);
  }
  const empty = isEmpty(value);
  if (check.type === 'required') return empty ? fail() : null;
  if (empty) return null;
  switch (check.type) {
    case 'email':
      return isEmail(String(value)) ? null : fail();
    case 'url':
      return isUrl(String(value), check.protocols) ? null : fail();
    case 'minLength':
      return lengthOf(value) >= check.value ? null : fail();
    case 'maxLength':
      return lengthOf(value) <= check.value ? null : fail();
    case 'min': {
      const n = toNumber(value);
      return !Number.isNaN(n) && n >= check.value ? null : fail();
    }
    case 'max': {
      const n = toNumber(value);
      return !Number.isNaN(n) && n <= check.value ? null : fail();
    }
    case 'pattern': {
      const re = toRegExp(check.value, check.flags);
      re.lastIndex = 0; // global/sticky regexps are stateful
      return re.test(String(value)) ? null : fail();
    }
    case 'matches':
      return valuesEqual(value, ctx.values?.[check.value]) ? null : fail();
  }
}

function isPromise<T>(v: unknown): v is Promise<T> {
  return !!v && typeof (v as { then?: unknown }).then === 'function';
}

/**
 * Runs a field's checks in order and returns the first error (or null). Synchronous while every check is; once a
 * custom check returns a Promise, the rest run after it resolves and a Promise is returned.
 */
export function runChecks(value: unknown, checks: readonly Check[] | undefined, ctx: CheckContext = {}): string | null | Promise<string | null> {
  if (!checks?.length) return null;
  for (let i = 0; i < checks.length; i++) {
    const r = runCheck(value, checks[i]!, ctx);
    if (isPromise<string | null>(r)) {
      return r.then((err) => (err ? err : (runChecks(value, checks.slice(i + 1), ctx) as string | null | Promise<string | null>)));
    }
    if (r) return r;
  }
  return null;
}

/** Synchronous validation; throws if a check is async (use `validateValueAsync`). */
export function validateValue(value: unknown, checks: readonly Check[] | undefined, ctx: CheckContext = {}): string | null {
  const r = runChecks(value, checks, ctx);
  if (isPromise(r)) throw new Error('validateValue: a check is async; use validateValueAsync');
  return r;
}

export async function validateValueAsync(value: unknown, checks: readonly Check[] | undefined, ctx: CheckContext = {}): Promise<string | null> {
  return runChecks(value, checks, ctx);
}

export interface FieldSpec {
  checks?: readonly Check[];
  label?: string;
}

/** Validates every field in `fields` against `values`; returns only the failing fields' messages. */
export async function validateValues(
  values: FormValues,
  fields: Record<string, FieldSpec>,
  ctx: Omit<CheckContext, 'values' | 'label'> = {},
): Promise<Record<string, string>> {
  const labelOf = ctx.labelOf ?? ((n: string) => fields[n]?.label);
  const entries = await Promise.all(
    Object.entries(fields).map(async ([name, f]) => [name, await runChecks(values[name], f.checks, { ...ctx, values, label: f.label, labelOf })] as const),
  );
  const errors: Record<string, string> = {};
  for (const [name, err] of entries) if (err) errors[name] = err;
  return errors;
}

/** Names of the fields a check list depends on (`matches` targets), for re-validating dependents. */
export function dependencies(checks: readonly Check[] | undefined): string[] {
  return (checks ?? []).filter((c): c is Extract<Check, { type: 'matches' }> => c.type === 'matches').map((c) => c.value);
}

/** True when the checks include `required` (rows can show an indicator or set `aria-required`). */
export function isRequired(checks: readonly Check[] | undefined): boolean {
  return !!checks?.some((c) => c.type === 'required');
}
