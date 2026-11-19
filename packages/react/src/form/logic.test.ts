import { describe, expect, it, vi } from 'vitest';
import {
  defaultMessages,
  dependencies,
  formatMessage,
  isEmail,
  isEmpty,
  isRequired,
  isUrl,
  runChecks,
  validateValue,
  validateValueAsync,
  validateValues,
  type Check,
} from './validation';
import { FormStore } from './store';

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('isEmpty', () => {
  it('treats blank, nullish, false, NaN and [] as empty; 0 is not', () => {
    for (const v of [undefined, null, '', '   ', false, NaN, []]) expect(isEmpty(v)).toBe(true);
    for (const v of [0, 'a', true, [1], {}]) expect(isEmpty(v)).toBe(false);
  });
});

describe('email / url', () => {
  it('accepts common addresses and rejects malformed ones', () => {
    expect(isEmail('a@b.co')).toBe(true);
    expect(isEmail('first.last+tag@sub.example.org')).toBe(true);
    for (const v of ['a', 'a@', '@b.co', 'a@b', 'a b@c.de', 'a@b.c', 'a@@b.co', 'a@b..co']) expect(isEmail(v)).toBe(false);
  });
  it('accepts http(s) URLs by default, configurable protocols', () => {
    expect(isUrl('https://example.com/x?y')).toBe(true);
    expect(isUrl('http://localhost:3000')).toBe(true);
    expect(isUrl('example.com')).toBe(false);
    expect(isUrl('ftp://x.org')).toBe(false);
    expect(isUrl('ftp://x.org', ['ftp'])).toBe(true);
    expect(isUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('checks', () => {
  const v = (value: unknown, checks: Check[], label?: string, values?: Record<string, unknown>) => validateValue(value, checks, { label, values });

  it('required', () => {
    expect(v('', [{ type: 'required' }], 'Name')).toBe('Name is required.');
    expect(v(undefined, [{ type: 'required' }])).toBe('This field is required.');
    expect(v(false, [{ type: 'required' }], 'Terms')).toBe('Terms is required.');
    expect(v('x', [{ type: 'required' }])).toBeNull();
    expect(v(0, [{ type: 'required' }])).toBeNull();
  });

  it('non-required checks pass on empty values', () => {
    const all: Check[] = [{ type: 'email' }, { type: 'url' }, { type: 'minLength', value: 3 }, { type: 'min', value: 5 }, { type: 'pattern', value: '^x$' }];
    expect(v('', all)).toBeNull();
    expect(v(undefined, all)).toBeNull();
  });

  it('email, url', () => {
    expect(v('nope', [{ type: 'email' }])).toBe('Enter a valid email address.');
    expect(v('a@b.co', [{ type: 'email' }])).toBeNull();
    expect(v('nope', [{ type: 'url' }])).toBe('Enter a valid URL.');
  });

  it('minLength / maxLength count code points and arrays', () => {
    expect(v('abc', [{ type: 'minLength', value: 4 }], 'Password')).toBe('Password must be at least 4 characters.');
    expect(v('a', [{ type: 'maxLength', value: 0 }])).toBe('This field must be at most 0 characters.');
    expect(v('ab', [{ type: 'maxLength', value: 1 }], 'X')).toBe('X must be at most 1 character.');
    expect(v('😀😀', [{ type: 'maxLength', value: 2 }])).toBeNull();
    expect(v([1, 2], [{ type: 'minLength', value: 3 }])).not.toBeNull();
  });

  it('min / max on numbers and numeric strings', () => {
    expect(v(17, [{ type: 'min', value: 18 }], 'Age')).toBe('Age must be at least 18.');
    expect(v('18', [{ type: 'min', value: 18 }])).toBeNull();
    expect(v(121, [{ type: 'max', value: 120 }], 'Age')).toBe('Age must be at most 120.');
    expect(v('abc', [{ type: 'min', value: 1 }])).not.toBeNull();
  });

  it('pattern from string (with flags) or RegExp, stateless with /g', () => {
    expect(v('ABC', [{ type: 'pattern', value: '^[a-z]+$' }], 'Username')).toBe('Username is not in the correct format.');
    expect(v('ABC', [{ type: 'pattern', value: '^[a-z]+$', flags: 'i' }])).toBeNull();
    const g: Check = { type: 'pattern', value: /a/g };
    expect(v('a', [g])).toBeNull();
    expect(v('a', [g])).toBeNull();
  });

  it('matches compares with another field and names it', () => {
    const c: Check[] = [{ type: 'matches', value: 'password' }];
    const labelOf = (n: string) => (n === 'password' ? 'Password' : undefined);
    expect(validateValue('x', c, { label: 'Confirmation', values: { password: 'y' }, labelOf })).toBe('Confirmation must match Password.');
    expect(validateValue('y', c, { values: { password: 'y' } })).toBeNull();
    expect(validateValue('x', c, { values: {} })).toBe('This field must match password.');
  });

  it('custom: function results, named validators, args', () => {
    expect(v('x', [{ type: 'custom', validate: () => true }])).toBeNull();
    expect(v('x', [{ type: 'custom', validate: () => false }], 'Code')).toBe('Code is invalid.');
    expect(v('x', [{ type: 'custom', validate: () => 'Taken' }])).toBe('Taken');
    expect(v('x', [{ type: 'custom', validate: (_, vals) => (vals.a === 1 ? null : 'need a') }], undefined, { a: 1 })).toBeNull();
    const validators = { even: (val: unknown, _v: unknown, args?: unknown) => (Number(val) % (args as number) === 0 ? true : 'odd') };
    expect(validateValue(3, [{ type: 'custom', name: 'even', args: 2 }], { validators })).toBe('odd');
    expect(validateValue(4, [{ type: 'custom', name: 'even', args: 2 }], { validators })).toBeNull();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(validateValue(1, [{ type: 'custom', name: 'missing' }])).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('first failing check wins, in order', () => {
    const c: Check[] = [{ type: 'required' }, { type: 'email' }, { type: 'maxLength', value: 3 }];
    expect(v('', c)).toMatch(/required/);
    expect(v('abcd', c)).toMatch(/email/);
    expect(v('a@b.co', c)).toMatch(/at most 3/);
  });
});

describe('messages', () => {
  it('per-check message > form messages > defaults, with interpolation', () => {
    const c: Check = { type: 'minLength', value: 8 };
    expect(formatMessage(c, { label: 'Password' })).toBe('Password must be at least 8 characters.');
    expect(formatMessage(c, { label: 'Password', messages: { minLength: '{label}: min {value}' } })).toBe('Password: min 8');
    expect(formatMessage({ ...c, message: 'Too short ({value})' }, { messages: { minLength: 'x' } })).toBe('Too short (8)');
    expect(formatMessage(c, { messages: { minLength: (p) => `${p.value}!` } })).toBe('8!');
    expect(formatMessage({ type: 'pattern', value: /^a$/ }, { messages: { pattern: '{value}' } })).toBe('^a$');
  });
  it('has a default for every check type', () => {
    expect(Object.keys(defaultMessages).sort()).toEqual(['custom', 'email', 'matches', 'max', 'maxLength', 'min', 'minLength', 'pattern', 'required', 'url']);
  });
});

describe('async', () => {
  it('runChecks stays sync until an async check, then resolves in order', async () => {
    expect(runChecks('a', [{ type: 'required' }])).toBeNull();
    const later = vi.fn(() => 'later');
    const r = runChecks('a', [{ type: 'custom', validate: async () => true }, { type: 'custom', validate: later }]);
    expect(r).toBeInstanceOf(Promise);
    await expect(r).resolves.toBe('later');
    await expect(validateValueAsync('a', [{ type: 'custom', validate: async () => 'no' }, { type: 'custom', validate: later }])).resolves.toBe('no');
    expect(later).toHaveBeenCalledTimes(1);
    expect(() => validateValue('a', [{ type: 'custom', validate: async () => true }])).toThrow(/async/);
  });
  it('a rejected validator fails with its message', async () => {
    await expect(validateValueAsync('a', [{ type: 'custom', validate: () => Promise.reject(new Error('Server down')) }])).resolves.toBe('Server down');
  });
  it('validateValues returns only failures', async () => {
    const errors = await validateValues(
      { email: 'bad', name: 'Ann', confirm: 'x', pw: 'y' },
      { email: { checks: [{ type: 'email' }] }, name: { checks: [{ type: 'required' }] }, confirm: { label: 'Confirm', checks: [{ type: 'matches', value: 'pw' }] }, pw: { label: 'Password' } },
    );
    expect(errors).toEqual({ email: 'Enter a valid email address.', confirm: 'Confirm must match Password.' });
  });
  it('helpers', () => {
    expect(dependencies([{ type: 'required' }, { type: 'matches', value: 'pw' }])).toEqual(['pw']);
    expect(isRequired([{ type: 'email' }])).toBe(false);
    expect(isRequired([{ type: 'required' }])).toBe(true);
  });
});

describe('FormStore', () => {
  const signup = (opts: ConstructorParameters<typeof FormStore>[0] = {}) => {
    const s = new FormStore(opts);
    s.register('email', { label: 'Email', checks: [{ type: 'required' }, { type: 'email' }] });
    s.register('password', { label: 'Password', checks: [{ type: 'required' }, { type: 'minLength', value: 8 }] });
    s.register('confirm', { label: 'Confirmation', checks: [{ type: 'matches', value: 'password' }] });
    return s;
  };

  it('uncontrolled values and change notifications', () => {
    const onValuesChange = vi.fn();
    const s = new FormStore({ initialValues: { a: 1 }, onValuesChange });
    const l = vi.fn();
    s.subscribe(l);
    s.setValue('a', 2);
    expect(s.getValue('a')).toBe(2);
    expect(onValuesChange).toHaveBeenCalledWith({ a: 2 });
    expect(l).toHaveBeenCalled();
    s.setValue('a', 2); // no-op
    expect(onValuesChange).toHaveBeenCalledTimes(1);
  });

  it('ensureValue only fills missing values', () => {
    const s = new FormStore({ initialValues: { a: 1 } });
    s.ensureValue('a', 5);
    s.ensureValue('b', false);
    expect(s.getState().values).toEqual({ a: 1, b: false });
  });

  it('mode submit: no errors before the first submit, live afterwards', async () => {
    const onSubmit = vi.fn();
    const onInvalid = vi.fn();
    const s = signup({ onSubmit, onInvalid });
    s.setValue('email', 'bad');
    s.blur('email');
    expect(s.getState().errors).toEqual({});
    expect(await s.submit()).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onInvalid).toHaveBeenCalledWith({ email: 'Enter a valid email address.', password: 'Password is required.' });
    expect(s.getState().submitCount).toBe(1);
    s.setValue('email', 'a@b.co');
    await tick();
    expect(s.getState().errors.email).toBeUndefined();
    s.setValue('password', 'longenough');
    s.setValue('confirm', 'longenough');
    await tick();
    expect(await s.submit()).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith({ email: 'a@b.co', password: 'longenough', confirm: 'longenough' });
  });

  it('mode blur: validates after a field is blurred, then live', async () => {
    const s = signup({ mode: 'blur' });
    s.setValue('email', 'bad');
    expect(s.getState().errors.email).toBeUndefined();
    s.blur('email');
    expect(s.getState().errors.email).toBe('Enter a valid email address.');
    s.setValue('email', 'a@b.co');
    expect(s.getState().errors.email).toBeUndefined();
    expect(s.getState().errors.password).toBeUndefined(); // untouched
  });

  it('mode change: validates on every change', () => {
    const s = signup({ mode: 'change' });
    s.setValue('password', 'short');
    expect(s.getState().errors.password).toMatch(/at least 8/);
  });

  it('matches dependents re-validate when the target changes', async () => {
    const s = signup();
    s.setValue('password', 'longenough');
    s.setValue('confirm', 'different');
    await s.submit();
    expect(s.getState().errors.confirm).toBe('Confirmation must match Password.');
    s.setValue('password', 'different');
    expect(s.getState().errors.confirm).toBeUndefined();
  });

  it('controlled sync adopts values without onValuesChange and re-validates changed fields', async () => {
    const onValuesChange = vi.fn();
    const s = signup({ onValuesChange });
    await s.submit();
    s.syncValues({ email: 'a@b.co' });
    expect(onValuesChange).not.toHaveBeenCalled();
    expect(s.getState().values).toEqual({ email: 'a@b.co' });
    expect(s.getState().errors.email).toBeUndefined();
  });

  it('several registrations per name concatenate checks; unregister clears the error and keeps the value', async () => {
    const s = new FormStore();
    const off1 = s.register('x', { label: 'X', checks: [{ type: 'required' }] });
    const off2 = s.register('x', { checks: [{ type: 'minLength', value: 3 }] });
    expect(s.checksOf('x')).toHaveLength(2);
    expect(s.labelOf('x')).toBe('X');
    s.setValue('x', 'ab');
    await s.submit();
    expect(s.getState().errors.x).toMatch(/at least 3/);
    off2();
    expect(s.fieldNames()).toEqual(['x']);
    off1();
    expect(s.fieldNames()).toEqual([]);
    expect(s.getState().errors).toEqual({});
    expect(s.getValue('x')).toBe('ab');
  });

  it('focuses the first invalid field via its focus hook', async () => {
    const s = new FormStore();
    const fa = vi.fn();
    const fb = vi.fn();
    s.register('a', { checks: [], focus: fa });
    s.register('b', { checks: [{ type: 'required' }], focus: fb });
    s.register('c', { checks: [{ type: 'required' }], focus: vi.fn() });
    await s.submit();
    expect(fa).not.toHaveBeenCalled();
    expect(fb).toHaveBeenCalledTimes(1);
    expect(s.firstInvalid()).toBe('b');
  });

  it('async submit: submitting flag, and concurrent submits are ignored', async () => {
    let resolve!: () => void;
    const onSubmit = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    const s = new FormStore({ onSubmit });
    const p = s.submit();
    expect(await s.submit()).toBe(false);
    await tick();
    expect(s.getState().submitting).toBe(true);
    resolve();
    expect(await p).toBe(true);
    expect(s.getState().submitting).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('async checks set validating and drop stale results', async () => {
    const resolvers: ((v: string | null) => void)[] = [];
    const s = new FormStore({ mode: 'change' });
    s.register('user', { checks: [{ type: 'custom', validate: () => new Promise<string | null>((r) => resolvers.push(r)) }] });
    s.setValue('user', 'a');
    expect(s.getState().validating.user).toBe(true);
    s.setValue('user', 'ab');
    resolvers[1]!(null);
    await tick();
    resolvers[0]!('Taken'); // stale
    await tick();
    expect(s.getState().errors.user).toBeUndefined();
    expect(s.getState().validating.user).toBeUndefined();
  });

  it('async check blocks submit when it fails', async () => {
    const onSubmit = vi.fn();
    const s = new FormStore({ onSubmit, initialValues: { user: 'taken' } });
    s.register('user', { checks: [{ type: 'custom', validate: async (v) => (v === 'taken' ? 'Username is taken.' : true) }] });
    expect(await s.submit()).toBe(false);
    expect(s.getState().errors.user).toBe('Username is taken.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('reset and setFieldError', async () => {
    const onValuesChange = vi.fn();
    const s = signup({ initialValues: { email: '' }, onValuesChange });
    s.setValue('email', 'x');
    await s.submit();
    s.setFieldError('email', 'Already registered.');
    expect(s.getState().errors.email).toBe('Already registered.');
    s.reset();
    expect(s.getState()).toMatchObject({ values: { email: '' }, errors: {}, touched: {}, submitCount: 0 });
    expect(onValuesChange).toHaveBeenLastCalledWith({ email: '' });
  });

  it('uses form-level messages and named validators', async () => {
    const s = new FormStore({ messages: { required: 'Please fill in {label}.' }, validators: { no: () => 'Nope' } });
    s.register('a', { label: 'A', checks: [{ type: 'required' }] });
    s.register('b', { checks: [{ type: 'custom', name: 'no' }] });
    await s.submit();
    expect(s.getState().errors).toEqual({ a: 'Please fill in A.', b: 'Nope' });
  });
});
