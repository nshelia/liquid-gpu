/** Form adapters: Form values ↔ a state object (`$bindState`), catalog checks → the form's `Check` type. */
import { useCallback, type ReactNode } from 'react';
import { useStateStore } from '@json-render/react';
import {
  Field,
  Form,
  FormSection,
  SecureFieldRow,
  SliderRow,
  StepperRow,
  SubmitButton,
  TextFieldRow,
  ToggleRow,
  type FormValues,
} from '@liquid-gpu/react';
import { FieldBindingContext, formatTemplate, icon, toFormChecks } from '../runtime';
import { defined, type P } from './types';

export function FormAdapter({ element, bindings, children, emit }: P<'Form'>) {
  const { set } = useStateStore();
  const { values, mode, submitOnEnter } = element.props;
  const path = bindings?.values;
  const onValuesChange = useCallback((v: FormValues) => (path ? set(path, v) : undefined), [path, set]);
  const valueProps = path ? { values: (values ?? {}) as FormValues, onValuesChange } : values ? { initialValues: values as FormValues } : {};
  return (
    <Form {...valueProps} {...defined({ mode, submitOnEnter })} onSubmit={() => emit('submit')} onInvalid={() => emit('invalid')}>
      {children}
    </Form>
  );
}

export function FormSectionAdapter({ element, children }: P<'FormSection'>) {
  return <FormSection {...defined(element.props)}>{children}</FormSection>;
}

export function FieldAdapter({ element, children }: P<'Field'>) {
  const { name, checks, ...rest } = element.props;
  const formChecks = toFormChecks(checks);
  return (
    <Field name={name ?? 'field'} {...defined(rest)} {...(formChecks ? { checks: formChecks } : {})}>
      {(f) => (
        <FieldBindingContext.Provider value={f}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8 }}>{children as ReactNode}</div>
        </FieldBindingContext.Provider>
      )}
    </Field>
  );
}

const KEYBOARD: Record<string, { type?: string; inputMode?: 'decimal' | 'email' | 'tel' | 'url' | 'search' | 'text'; autoCapitalize?: string }> = {
  email: { type: 'email', inputMode: 'email', autoCapitalize: 'none' },
  number: { inputMode: 'decimal' },
  tel: { type: 'tel', inputMode: 'tel' },
  url: { type: 'url', inputMode: 'url', autoCapitalize: 'none' },
  search: { type: 'search', inputMode: 'search' },
  password: { type: 'password', autoCapitalize: 'none' },
  text: {},
};

export function TextFieldRowAdapter({ element }: P<'TextFieldRow'>) {
  const { name, checks, keyboard, ...rest } = element.props;
  const formChecks = toFormChecks(checks);
  return <TextFieldRow name={name ?? 'field'} {...defined(rest)} {...(formChecks ? { checks: formChecks } : {})} {...(keyboard ? KEYBOARD[keyboard] : {})} />;
}

export function SecureFieldRowAdapter({ element }: P<'SecureFieldRow'>) {
  const { name, checks, ...rest } = element.props;
  const formChecks = toFormChecks(checks);
  return <SecureFieldRow name={name ?? 'password'} {...defined(rest)} {...(formChecks ? { checks: formChecks } : {})} />;
}

export function ToggleRowAdapter({ element }: P<'ToggleRow'>) {
  const { name, checks, ...rest } = element.props;
  const formChecks = toFormChecks(checks);
  return <ToggleRow name={name ?? 'toggle'} {...defined(rest)} {...(formChecks ? { checks: formChecks } : {})} />;
}

export function StepperRowAdapter({ element }: P<'StepperRow'>) {
  const { name, checks, format, ...rest } = element.props;
  const formChecks = toFormChecks(checks);
  return (
    <StepperRow
      name={name ?? 'stepper'}
      {...defined(rest)}
      {...(formChecks ? { checks: formChecks } : {})}
      {...(format ? { format: (v: number) => formatTemplate(format, v) } : {})}
    />
  );
}

export function SliderRowAdapter({ element }: P<'SliderRow'>) {
  const { name, checks, format, minimumIcon, maximumIcon, ...rest } = element.props;
  const formChecks = toFormChecks(checks);
  return (
    <SliderRow
      name={name ?? 'slider'}
      {...defined(rest)}
      {...(formChecks ? { checks: formChecks } : {})}
      {...(format ? { format: (v: number) => formatTemplate(format, v) } : {})}
      {...(minimumIcon ? { minimumValueLabel: icon(minimumIcon, 17) } : {})}
      {...(maximumIcon ? { maximumValueLabel: icon(maximumIcon, 17) } : {})}
    />
  );
}

export function SubmitButtonAdapter({ element }: P<'SubmitButton'>) {
  const { label, ...rest } = element.props;
  return <SubmitButton {...defined(rest)}>{label ?? 'Submit'}</SubmitButton>;
}
