/**
 * Field and ready-made form rows over the existing controls (controls/*), each bound to the Form with `useFormField`.
 *
 * Layout per SC = deep/swiftui-components/spec.md:
 * - TextField in Form: 52 pt row, placeholder tertiaryLabel, plain (borderless) field 22 pt tall (§5). With a label:
 *   label leading, field filling the rest (LabeledContent layout, §4 / §6 "Detail value trailing").
 * - SecureField: same as TextField (§5).
 * - Toggle: label leading, switch trailing at its 61×28 intrinsic size (§2).
 * - Stepper: label text leading ("Quantity: 3"), UIStepper 94×32 trailing (§2).
 * - Slider: full-width UISlider, SwiftUI hides the label on iOS (§2: "SwiftUI owns the label layout").
 */
import { useCallback, type CSSProperties, type ReactNode } from 'react';
import { TextField, type TextFieldProps } from '../controls/TextField';
import { Switch } from '../controls/Switch';
import { Stepper } from '../controls/Stepper';
import { Slider } from '../controls/Slider';
import { FormRow } from './FormRow';
import { useFormField, type FormFieldApi } from './Form';
import type { Check } from './validation';

export interface FieldBaseProps<V> {
  name: string;
  /** Visible label and the `{label}` in messages. */
  label?: string;
  checks?: readonly Check[];
  /** Secondary footnote under the control; the error replaces it while the field is invalid. */
  helpText?: ReactNode;
  defaultValue?: V;
  disabled?: boolean;
  style?: CSSProperties;
}

export interface FieldProps<V = unknown> extends FieldBaseProps<V> {
  /** The control. A function receives the field binding; a node is rendered as-is (bind it with `useFormField`). */
  children?: ReactNode | ((field: FormFieldApi<V>) => ReactNode);
  /** Hide the leading label (it still names the field in messages). */
  hideLabel?: boolean;
}

const labelStyle: CSSProperties = { flex: '0 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };

/** A form row: optional leading label, the control trailing, error / help line under it. */
export function Field<V = unknown>({ name, label, checks, helpText, defaultValue, disabled, style, hideLabel, children }: FieldProps<V>) {
  const f = useFormField<V>(name, { checks, label, defaultValue });
  return (
    <FieldRow field={f} label={hideLabel ? undefined : label} helpText={helpText} disabled={disabled} style={style}>
      {typeof children === 'function' ? children(f) : children}
    </FieldRow>
  );
}

function FieldRow<V>({
  field,
  label,
  helpText,
  disabled,
  style,
  lineStyle,
  children,
}: {
  field: FormFieldApi<V>;
  label?: ReactNode;
  helpText?: ReactNode;
  disabled?: boolean;
  style?: CSSProperties;
  lineStyle?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <FormRow
      ref={field.ref}
      data-field={field.name}
      error={field.error}
      help={helpText}
      messageId={field.messageId}
      onBlur={field.onBlur}
      disabled={disabled}
      style={style}
      lineStyle={lineStyle}
    >
      {label !== undefined && (
        <label htmlFor={field.id} style={labelStyle}>
          {label}
        </label>
      )}
      {children}
    </FormRow>
  );
}

function a11y(f: FormFieldApi<unknown>, hasHelp: boolean) {
  return {
    id: f.id,
    'aria-invalid': f.invalid || undefined,
    'aria-required': f.required || undefined,
    'aria-describedby': f.error || hasHelp ? f.messageId : undefined,
  };
}

export interface TextFieldRowProps extends FieldBaseProps<string>, Omit<TextFieldProps, 'name' | 'value' | 'defaultValue' | 'onChange' | 'variant' | 'style' | 'disabled'> {
  /**
   * `inline` (default when `label` is set): label leading, field after it. `placeholder`: no visible label, the label
   * becomes the placeholder (SwiftUI `TextField("Name", text:)` in a Form).
   */
  labelStyle?: 'inline' | 'placeholder';
  /** Text alignment of the field when inline. Default `trailing`. TODO(unknown): no Form capture with a labelled field; LabeledContent puts values trailing (SC §4). */
  align?: 'leading' | 'trailing';
}

export function TextFieldRow({
  name,
  label,
  checks,
  helpText,
  defaultValue = '',
  disabled,
  style,
  labelStyle: ls,
  align = 'trailing',
  placeholder,
  inputStyle,
  ...input
}: TextFieldRowProps) {
  const f = useFormField<string>(name, { checks, label, defaultValue });
  const inline = (ls ?? (label ? 'inline' : 'placeholder')) === 'inline' && !!label;
  return (
    <FieldRow field={f} label={inline ? label : undefined} helpText={helpText} disabled={disabled} style={style}>
      <TextField
        {...input}
        {...a11y(f, !!helpText)}
        name={name}
        variant="plain" // SC §5: Form text fields are borderless (UITextField borderStyle none), 22 pt
        value={f.value ?? ''}
        onChange={f.setValue}
        disabled={disabled}
        placeholder={placeholder ?? (inline ? undefined : label)}
        aria-label={inline ? undefined : label}
        style={{ flex: '1 1 0', width: 'auto' }}
        inputStyle={{ textAlign: inline && align === 'trailing' ? 'right' : 'left', ...inputStyle }}
      />
    </FieldRow>
  );
}

/** SecureField row: a password TextField (SC §5 "SecureField: same as TextField"). */
export function SecureFieldRow({ autoComplete = 'current-password', ...p }: Omit<TextFieldRowProps, 'type'>) {
  return <TextFieldRow {...p} type="password" autoComplete={autoComplete} autoCapitalize="none" spellCheck={false} />;
}

export interface ToggleRowProps extends FieldBaseProps<boolean> {
  /** onTintColor. */
  tint?: string;
}

export function ToggleRow({ name, label, checks, helpText, defaultValue = false, disabled, style, tint }: ToggleRowProps) {
  const f = useFormField<boolean>(name, { checks, label, defaultValue });
  const onChange = useCallback((on: boolean) => f.setValue(on), [f.setValue]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <FieldRow field={f} label={label} helpText={helpText} disabled={disabled} style={style} lineStyle={{ justifyContent: 'space-between' }}>
      <Switch id={f.id} isOn={!!f.value} onChange={onChange} disabled={disabled} tint={tint} aria-label={label} style={{ flex: 'none' }} />
    </FieldRow>
  );
}

export interface StepperRowProps extends FieldBaseProps<number> {
  min?: number;
  max?: number;
  step?: number;
  /** Leading text; default `${label}: ${value}` (SC §2 "Quantity: 3"). */
  format?: (value: number) => ReactNode;
}

export function StepperRow({ name, label, checks, helpText, defaultValue, disabled, style, min = 0, max = 100, step = 1, format }: StepperRowProps) {
  const f = useFormField<number>(name, { checks, label, defaultValue: defaultValue ?? min });
  const v = f.value ?? min;
  return (
    <FieldRow field={f} helpText={helpText} disabled={disabled} style={style} lineStyle={{ justifyContent: 'space-between' }}>
      <span id={f.id} style={labelStyle} aria-live="polite">
        {format ? format(v) : label ? `${label}: ${v}` : v}
      </span>
      <Stepper value={v} onChange={f.setValue} min={min} max={max} step={step} disabled={disabled} aria-label={label} style={{ flex: 'none' }} />
    </FieldRow>
  );
}

export interface SliderRowProps extends FieldBaseProps<number> {
  min?: number;
  max?: number;
  step?: number;
  tint?: string;
  /** Leading / trailing adornments (SwiftUI `minimumValueLabel` / `maximumValueLabel`). */
  minimumValueLabel?: ReactNode;
  maximumValueLabel?: ReactNode;
  /** Show the label (and `format(value)`) on a line above the slider. Default false: SwiftUI hides it (SC §2). */
  showLabel?: boolean;
  format?: (value: number) => ReactNode;
}

export function SliderRow({
  name,
  label,
  checks,
  helpText,
  defaultValue,
  disabled,
  style,
  min = 0,
  max = 1,
  step = 0,
  tint,
  minimumValueLabel,
  maximumValueLabel,
  showLabel,
  format,
}: SliderRowProps) {
  const f = useFormField<number>(name, { checks, label, defaultValue: defaultValue ?? min });
  const v = f.value ?? min;
  return (
    <FormRow
      ref={f.ref}
      data-field={name}
      error={f.error}
      help={helpText}
      messageId={f.messageId}
      onBlur={f.onBlur}
      disabled={disabled}
      style={style}
      lineStyle={{ flexDirection: 'column', alignItems: 'stretch', justifyContent: 'center', gap: 4 }}
    >
      {showLabel && label && (
        // TODO(unknown): no capture of a labelled slider row; label/value line like LabeledContent (SC §4).
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 11 }}>
          <span>{label}</span>
          <span style={{ color: 'var(--lq-secondary-label)' }}>{format ? format(v) : v}</span>
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {minimumValueLabel}
        <div style={{ flex: '1 1 0', minWidth: 0 }}>
          <Slider value={v} onChange={f.setValue} min={min} max={max} step={step} tint={tint} disabled={disabled} aria-label={label} />
        </div>
        {maximumValueLabel}
      </div>
    </FormRow>
  );
}
