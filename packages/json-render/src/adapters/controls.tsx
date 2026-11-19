/** Controls, pickers and inputs: bound values (`$bindState`) → value / onChange, icon names → nodes, checks → errors. */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useOptionalValidation } from '@json-render/react';
import {
  ActivityIndicator,
  Button,
  CheckmarkToggle,
  ColorPicker,
  Gauge,
  HStack,
  OneTimeCodeField,
  Picker,
  PickerRow,
  ProgressView,
  Rating,
  SearchField,
  SegmentedControl,
  Slider,
  Stepper,
  Switch,
  Text,
  TextEditor,
  TextField,
  Toggle,
  ToggleGroup,
  Tooltip,
  VStack,
  WheelPicker,
  type PickerOption,
  type PickerValue,
  type WheelColumn,
} from '@liquid-gpu/react';
import { useStateStore } from '@json-render/react';
import { icon, toValidationCheck, useBound, useBoundProp } from '../runtime';
import type { CheckInput, OptionInput } from '../schemas';
import { defined, type P } from './types';

const renderIcon = (name: string) => icon(name, 17);

function toOptions(options: unknown): PickerOption<PickerValue>[] {
  if (!Array.isArray(options)) return [];
  return (options as OptionInput[])
    .filter((o) => o && (typeof o.value === 'string' || typeof o.value === 'number'))
    .map((o) => defined({ value: o.value, label: String(o.label ?? o.value), icon: o.icon, disabled: o.disabled }) as PickerOption<PickerValue>);
}

/** Labelled line used by Switch / Stepper / Slider when they carry a `label`. */
function LabelLine({ label, children }: { label: string | undefined; children: ReactNode }) {
  if (!label) return <>{children}</>;
  return (
    <HStack spacing={12} alignment="center" maxWidth="infinity">
      <Text style="body" cssStyle={{ flex: 1, minWidth: 0 }}>
        {label}
      </Text>
      {children}
    </HStack>
  );
}

/**
 * json-render field validation for a standalone input bound to `path`: registers the checks (so the built-in
 * `validateForm` action sees them), validates on change / blur per `validateOn`, returns the visible errors.
 */
function useChecks(path: string | undefined, checks: CheckInput[] | undefined, validateOn: 'change' | 'blur' | 'submit' | undefined, value: unknown) {
  const validation = useOptionalValidation();
  const key = JSON.stringify(checks ?? []);
  const config = useMemo(
    () => ({
      checks: (checks ?? []).map(toValidationCheck).filter((c): c is NonNullable<typeof c> => c !== null) as { type: string; args?: Record<string, never>; message: string }[],
      validateOn: validateOn ?? 'blur',
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, validateOn],
  );
  const active = !!validation && !!path && config.checks.length > 0;
  useEffect(() => {
    if (active) validation!.registerField(path!, config);
  }, [active, validation, path, config]);
  const state = active ? validation!.fieldStates[path!] : undefined;
  const touched = useRef(false);
  useEffect(() => {
    if (!active || !touched.current) return;
    if (config.validateOn === 'change' || state?.validated) validation!.validate(path!, config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return {
    errors: state?.validated ? (state.result?.errors ?? []) : [],
    onChange: () => {
      touched.current = true;
    },
    onBlur: () => {
      touched.current = true;
      if (active && config.validateOn !== 'submit') validation!.validate(path!, config);
    },
  };
}

function Errors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;
  return (
    <Text style="footnote" color="systemRed" cssStyle={{ marginTop: 4 }}>
      {errors[0]}
    </Text>
  );
}

export function ButtonAdapter({ element, emit }: P<'Button'>) {
  const { label, icon: name, ...rest } = element.props;
  return (
    <Button {...defined(rest)} {...(name ? { icon: icon(name, 17) } : {})} {...(!label && name ? { 'aria-label': name } : {})} onClick={() => emit('press')}>
      {label}
    </Button>
  );
}

export function SwitchAdapter(p: P<'Switch'>) {
  const { label, tint, disabled } = p.element.props;
  const [isOn, setOn] = useBoundProp<boolean>(p, 'isOn', 'change', false);
  return (
    <LabelLine label={label}>
      <Switch isOn={!!isOn} onChange={setOn} {...defined({ tint, disabled })} aria-label={label ?? 'Switch'} />
    </LabelLine>
  );
}

export function SliderAdapter(p: P<'Slider'>) {
  const { label, minimumIcon, maximumIcon, value: _v, ...rest } = p.element.props;
  const [value, setValue] = useBoundProp<number>(p, 'value', 'change', rest.min ?? 0);
  const slider = <Slider {...defined(rest)} value={value ?? 0} onChange={setValue} onChangeEnd={() => p.emit('changeEnd')} aria-label={label ?? 'Slider'} />;
  const body =
    minimumIcon || maximumIcon ? (
      <HStack spacing={10} alignment="center" maxWidth="infinity">
        {icon(minimumIcon, 17)}
        <div style={{ flex: 1, minWidth: 0 }}>{slider}</div>
        {icon(maximumIcon, 17)}
      </HStack>
    ) : (
      slider
    );
  return label ? (
    <VStack spacing={6} alignment="leading" maxWidth="infinity">
      <Text style="subheadline" color="secondaryLabel">
        {label}
      </Text>
      {body}
    </VStack>
  ) : (
    body
  );
}

export function StepperAdapter(p: P<'Stepper'>) {
  const { label, value: _v, ...rest } = p.element.props;
  const [value, setValue] = useBoundProp<number>(p, 'value', 'change', rest.min ?? 0);
  return (
    <LabelLine label={label === undefined ? undefined : `${label}: ${value ?? 0}`}>
      <Stepper {...defined(rest)} value={value ?? 0} onChange={setValue} aria-label={label ?? 'Stepper'} />
    </LabelLine>
  );
}

export function SegmentedControlAdapter(p: P<'SegmentedControl'>) {
  const { segments, width, disabled } = p.element.props;
  const segs = useMemo(
    () =>
      (Array.isArray(segments) ? segments : []).map((s) =>
        typeof s === 'string' ? { value: s, label: s as ReactNode } : { value: s.value, label: (s.icon ? icon(s.icon, 16) : s.label) as ReactNode, 'aria-label': s.label },
      ),
    [segments],
  );
  const [sel, setSel] = useBoundProp<string | number>(p, 'selection', 'change', segs[0]?.value);
  return <SegmentedControl<string | number> segments={segs} selection={sel as string | number} onChange={setSel} {...defined({ width, disabled })} />;
}

export function ProgressViewAdapter({ element }: P<'ProgressView'>) {
  const { label, ...rest } = element.props;
  const bar = <ProgressView {...defined(rest)} aria-label={label ?? 'Progress'} />;
  return label ? (
    <VStack spacing={6} alignment="leading" maxWidth="infinity">
      <Text style="subheadline" color="secondaryLabel">
        {label}
      </Text>
      {bar}
    </VStack>
  ) : (
    bar
  );
}

export function ActivityIndicatorAdapter({ element }: P<'ActivityIndicator'>) {
  return <ActivityIndicator {...defined(element.props)} />;
}

export function GaugeAdapter({ element }: P<'Gauge'>) {
  const { value, ...rest } = element.props;
  return <Gauge value={typeof value === 'number' ? value : 0} {...defined(rest)} />;
}

const KEYBOARD_TYPE: Record<string, string> = { text: 'text', email: 'email', password: 'password', number: 'text', tel: 'tel', url: 'url', search: 'search' };
const KEYBOARD_MODE: Record<string, 'decimal' | 'email' | 'tel' | 'url' | 'search' | 'text'> = {
  number: 'decimal',
  email: 'email',
  tel: 'tel',
  url: 'url',
  search: 'search',
  text: 'text',
};

export function TextFieldAdapter(p: P<'TextField'>) {
  const { placeholder, label, variant, keyboard, clearButton, disabled, checks, validateOn } = p.element.props;
  const [value, setValue] = useBoundProp<string>(p, 'value', 'change', '');
  const v = useChecks(p.bindings?.value, checks, validateOn, value);
  const field = (
    <TextField
      value={value ?? ''}
      onChange={(s) => {
        v.onChange();
        setValue(s);
      }}
      onBlur={v.onBlur}
      onKeyDown={(e) => {
        if (e.key === 'Enter') p.emit('submit');
      }}
      {...defined({ placeholder: placeholder ?? label, variant, clearButton, disabled })}
      {...(keyboard ? { type: KEYBOARD_TYPE[keyboard] ?? 'text', inputMode: KEYBOARD_MODE[keyboard] ?? 'text' } : {})}
      aria-label={label ?? placeholder ?? 'Text field'}
      aria-invalid={v.errors.length > 0 || undefined}
      width="100%"
    />
  );
  if (!label && v.errors.length === 0) return field;
  return (
    <VStack spacing={6} alignment="leading" maxWidth="infinity">
      {label ? (
        <Text style="subheadline" color="secondaryLabel">
          {label}
        </Text>
      ) : null}
      {field}
      <Errors errors={v.errors} />
    </VStack>
  );
}

export function SearchFieldAdapter(p: P<'SearchField'>) {
  const { placeholder, disabled } = p.element.props;
  const [value, setValue] = useBoundProp<string>(p, 'value', 'change', '');
  return <SearchField value={value ?? ''} onChange={setValue} onSubmit={() => p.emit('submit')} {...defined({ placeholder, disabled })} width="100%" />;
}

// pickers ------------------------------------------------------------------------------------------------------------

export function PickerAdapter(p: P<'Picker'>) {
  const { options, selection: _s, ...rest } = p.element.props;
  const opts = useMemo(() => toOptions(options), [options]);
  const [sel, setSel] = useBoundProp<PickerValue>(p, 'selection', 'change', opts[0]?.value);
  return <Picker<PickerValue> options={opts} selection={sel as PickerValue} onChange={setSel} renderIcon={renderIcon} {...defined(rest)} />;
}

export function PickerRowAdapter(p: P<'PickerRow'>) {
  const { options, selection: _s, icon: name, label, disabled } = p.element.props;
  const opts = useMemo(() => toOptions(options), [options]);
  const [sel, setSel] = useBoundProp<PickerValue>(p, 'selection', 'change', opts[0]?.value);
  return (
    <PickerRow<PickerValue>
      label={label ?? ''}
      options={opts}
      selection={sel as PickerValue}
      onChange={setSel}
      renderIcon={renderIcon}
      {...defined({ disabled })}
      {...(name ? { icon: icon(name, 22) } : {})}
    />
  );
}

export function WheelPickerAdapter({ element, emit }: P<'WheelPicker'>) {
  const { set } = useStateStore();
  const { columns, ...rest } = element.props;
  const cols = (Array.isArray(columns) ? columns : []).map((c) => {
    const col: WheelColumn<PickerValue> = {
      options: toOptions(c.options),
      onChange: (v) => {
        if (c.statePath) set(c.statePath, v);
        emit('change');
      },
    };
    if (c.selection !== undefined) col.selection = c.selection;
    if (c.width !== undefined) col.width = c.width;
    if (c.align !== undefined) col.align = c.align;
    return col;
  });
  return <WheelPicker columns={cols} renderIcon={renderIcon} {...defined(rest)} />;
}

// inputs -------------------------------------------------------------------------------------------------------------

export function TextEditorAdapter(p: P<'TextEditor'>) {
  const { value: _v, checks, validateOn, ...rest } = p.element.props;
  const [value, setValue] = useBoundProp<string>(p, 'value', 'change', '');
  const v = useChecks(p.bindings?.value, checks, validateOn, value);
  return (
    <VStack spacing={4} alignment="leading" maxWidth="infinity">
      <TextEditor
        {...defined(rest)}
        value={value ?? ''}
        onChange={(s) => {
          v.onChange();
          setValue(s);
        }}
        onBlur={v.onBlur}
        width="100%"
      />
      <Errors errors={v.errors} />
    </VStack>
  );
}

export function ColorPickerAdapter(p: P<'ColorPicker'>) {
  const { value: _v, ...rest } = p.element.props;
  const [value, setValue] = useBoundProp<string>(p, 'value', 'change');
  return <ColorPicker {...defined(rest)} {...(value ? { value } : {})} onChange={setValue} />;
}

export function ToggleAdapter(p: P<'Toggle'>) {
  const { label, icon: name, isOn: _i, ...rest } = p.element.props;
  const [isOn, setOn] = useBoundProp<boolean>(p, 'isOn', 'change', false);
  return (
    <Toggle {...defined(rest)} isOn={!!isOn} onChange={setOn} {...(name ? { icon: icon(name, 17) } : {})} {...(!label && name ? { 'aria-label': name } : {})}>
      {label}
    </Toggle>
  );
}

export function ToggleGroupAdapter(p: P<'ToggleGroup'>) {
  const { type, items, value: _v, allowEmpty, ...rest } = p.element.props;
  const list = (Array.isArray(items) ? items : []).map((it) => defined({ value: it.value, label: it.label, icon: icon(it.icon, 17), disabled: it.disabled, 'aria-label': it.label ?? it.icon }));
  const [value, setValue] = useBoundProp<string | string[] | null>(p, 'value', 'change', type === 'multiple' ? [] : null);
  if (type === 'multiple') {
    return <ToggleGroup type="multiple" items={list} value={Array.isArray(value) ? value : []} onChange={setValue} {...defined(rest)} />;
  }
  return <ToggleGroup type="single" items={list} value={typeof value === 'string' ? value : null} onChange={setValue} {...defined({ ...rest, allowEmpty })} />;
}

export function CheckmarkToggleAdapter(p: P<'CheckmarkToggle'>) {
  const { isOn: _i, ...rest } = p.element.props;
  const [isOn, setOn] = useBoundProp<boolean>(p, 'isOn', 'change', false);
  return <CheckmarkToggle {...defined(rest)} isOn={!!isOn} onChange={setOn} />;
}

export function RatingAdapter(p: P<'Rating'>) {
  const { value: _v, ...rest } = p.element.props;
  const [value, setValue] = useBoundProp<number>(p, 'value', 'change', 0);
  return <Rating {...defined(rest)} value={value ?? 0} onChange={setValue} />;
}

export function TooltipAdapter({ element, children }: P<'Tooltip'>) {
  const { text, placement } = element.props;
  return (
    <Tooltip text={text ?? ''} {...defined({ placement })}>
      <span style={{ display: 'inline-flex' }}>{children}</span>
    </Tooltip>
  );
}

export function OneTimeCodeFieldAdapter(p: P<'OneTimeCodeField'>) {
  const { value: _v, ...rest } = p.element.props;
  const [value, setValue] = useBound<string>(p.element.props.value, p.bindings?.value, '');
  return (
    <OneTimeCodeField
      {...defined(rest)}
      value={value ?? ''}
      onChange={(c) => {
        setValue(c);
        p.emit('change');
      }}
      onComplete={() => p.emit('complete')}
    />
  );
}
