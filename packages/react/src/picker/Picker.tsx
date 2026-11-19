/**
 * `Picker` (SwiftUI Picker on iOS 27; SC = deep/swiftui-components/spec.md §3, §6).
 *
 * - `menu` (default; automatic outside a Form): a plain button with the current value in tint 17 pt plus
 *   `chevron.up.chevron.down` (SC §3: hosted UIButton 118 × 34.67, "Chocolate" in #0088FF), opening the kit's `Menu`
 *   with a checkmark on the selected item (TO §10.1 checkmark column).
 * - `inline`: one 52 pt row per option in a List `Section`, the selected row with a tint checkmark (SC §3). Must be a
 *   child of `<List>`. Covers radio groups (role radiogroup / radio).
 * - `segmented`: the kit's `SegmentedControl` (SC §3: UISegmentedControl).
 * - `wheel`: `WheelPicker` with one column (UIPickerView, TO §6).
 *
 * `PickerRow`: the menu picker inside a Form/List (SC §3 "Picker inside Form"): 52 pt row, title on the left in
 * label colour, value on the right in secondaryLabel plus up/down chevrons.
 */
import { useLayoutEffect, useRef, type CSSProperties, type KeyboardEvent, type ReactNode, type SVGProps } from 'react';
import { Menu } from '../menus/Menu';
import type { MenuItem } from '../menus/types';
import { Row, Section } from '../list/List';
import { SegmentedControl } from '../controls/SegmentedControl';
import { useControllable } from '../controls/internal';
import { WheelPicker } from './WheelPicker';
import { optionIndex } from './logic';
import type { PickerOption, PickerStyle, PickerValue } from './types';

export interface PickerProps<T extends PickerValue = string> {
  options: readonly PickerOption<T>[];
  selection?: T;
  defaultSelection?: T;
  onChange?: (value: T) => void;
  /** Title: the Section header (inline), the row title (PickerRow) and the accessible name otherwise. */
  label?: string;
  /** Default `menu`. */
  pickerStyle?: PickerStyle;
  disabled?: boolean;
  /** Draws `option.icon` names. Icons are omitted without it. */
  renderIcon?: (name: string) => ReactNode;
  /** `inline`: Section footer. */
  footer?: string;
  /** `segmented`: total width in pt (default 65 per segment); `wheel`: width (default: the container's). */
  width?: number;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * chevron.up.chevron.down. TODO(unknown): glyph size and weight next to a 17 pt value (SC §3 only says "a chevron
 * UIImageView"); drawn about 9 × 14.
 */
export function ChevronUpDown(p: SVGProps<SVGSVGElement>) {
  return (
    <svg width={9} height={14} viewBox="0 0 9 14" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M1.5 5 4.5 2l3 3M1.5 9l3 3 3-3" />
    </svg>
  );
}

function menuItems<T extends PickerValue>(
  options: readonly PickerOption<T>[],
  sel: T | undefined,
  set: (v: T) => void,
  renderIcon?: (name: string) => ReactNode,
): MenuItem[] {
  return options.map((o, i) => ({
    id: String(i),
    title: o.label,
    icon: o.icon && renderIcon ? renderIcon(o.icon) : undefined,
    checked: Object.is(o.value, sel),
    disabled: o.disabled,
    onSelect: () => set(o.value),
  }));
}

export function Picker<T extends PickerValue = string>(props: PickerProps<T>) {
  const { options, selection, defaultSelection, onChange, label, pickerStyle = 'menu', disabled, renderIcon, footer, width, className, style } = props;
  const name = props['aria-label'] ?? label;
  const [sel, set] = useControllable<T | undefined>(selection, defaultSelection ?? options[0]?.value, onChange as (v: T | undefined) => void);

  if (pickerStyle === 'wheel') {
    return (
      <WheelPicker
        aria-label={name}
        disabled={disabled}
        width={width}
        renderIcon={renderIcon}
        className={className}
        style={style}
        columns={[{ options, selection: sel, onChange: (v: T) => set(v), 'aria-label': name }]}
      />
    );
  }

  if (pickerStyle === 'segmented') {
    return (
      <SegmentedControl<T>
        aria-label={name}
        disabled={disabled}
        width={width}
        className={className}
        style={style}
        selection={sel}
        onChange={(v) => set(v)}
        segments={options.map((o) => ({
          value: o.value,
          'aria-label': o.label,
          label:
            o.icon && renderIcon ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {renderIcon(o.icon)}
                {o.label}
              </span>
            ) : (
              o.label
            ),
        }))}
      />
    );
  }

  if (pickerStyle === 'inline') {
    return <InlinePicker options={options} sel={sel} set={set} label={label} name={name} footer={footer} disabled={disabled} renderIcon={renderIcon} />;
  }

  // menu
  const current = options[optionIndex(options, sel)];
  return (
    <Menu
      variant="plain"
      disabled={disabled}
      aria-label={name ? `${name}: ${current?.label ?? ''}` : undefined}
      className={className}
      style={style}
      items={menuItems(options, sel, set, renderIcon)}
      label={
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 /* TODO(unknown): value–chevron gap */ }}>
          {current?.label}
          <ChevronUpDown />
        </span>
      }
    />
  );
}

function InlinePicker<T extends PickerValue>({
  options,
  sel,
  set,
  label,
  name,
  footer,
  disabled,
  renderIcon,
}: {
  options: readonly PickerOption<T>[];
  sel: T | undefined;
  set: (v: T) => void;
  label?: string;
  name?: string;
  footer?: string;
  disabled?: boolean;
  renderIcon?: (name: string) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const selIndex = optionIndex(options, sel);
  // Row has no role / aria-checked props: mark its foreground buttons as radios after render.
  // (Needed upstream: `RowProps.role` + `aria-checked`.)
  useLayoutEffect(() => {
    const fgs = ref.current?.querySelectorAll<HTMLElement>('.lq-row-fg');
    fgs?.forEach((el, i) => {
      el.setAttribute('role', 'radio');
      el.setAttribute('aria-checked', String(i === selIndex));
      el.tabIndex = i === Math.max(0, selIndex) ? 0 : -1;
      if (disabled || options[i]?.disabled) el.setAttribute('disabled', '');
      else el.removeAttribute('disabled');
    });
  });
  const onKeyDown = (e: KeyboardEvent) => {
    const dir = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0;
    if (!dir || disabled) return;
    e.preventDefault();
    const n = options.length;
    for (let k = 1; k <= n; k++) {
      const i = (((Math.max(0, selIndex) + dir * k) % n) + n) % n;
      if (!options[i]?.disabled) {
        set(options[i]!.value);
        ref.current?.querySelectorAll<HTMLElement>('.lq-row-fg')[i]?.focus();
        return;
      }
    }
  };
  return (
    <div ref={ref} role="radiogroup" aria-label={name} aria-disabled={disabled || undefined} onKeyDown={onKeyDown} style={{ opacity: disabled ? 0.5 /* TODO(unknown) */ : 1 }}>
      <Section header={label} footer={footer}>
        {options.map((o) => (
          <Row
            key={String(o.value)}
            title={o.label}
            icon={o.icon && renderIcon ? renderIcon(o.icon) : undefined}
            accessory={Object.is(o.value, sel) ? 'checkmark' : 'none'}
            onPress={disabled || o.disabled ? undefined : () => set(o.value)}
          />
        ))}
      </Section>
    </div>
  );
}

export interface PickerRowProps<T extends PickerValue = string> extends Omit<PickerProps<T>, 'pickerStyle' | 'footer' | 'width'> {
  /** Row title (left). */
  label: string;
  /** Leading row icon. */
  icon?: ReactNode;
}

/** Menu picker as a List row (SC §3 "Picker inside Form"): title left, value + chevrons right in secondaryLabel. */
export function PickerRow<T extends PickerValue = string>({ label, icon, options, selection, defaultSelection, onChange, disabled, renderIcon, ...aria }: PickerRowProps<T>) {
  const [sel, set] = useControllable<T | undefined>(selection, defaultSelection ?? options[0]?.value, onChange as (v: T | undefined) => void);
  const current = options[optionIndex(options, sel)];
  return (
    <Row
      title={label}
      icon={icon}
      trailing={
        <Menu
          variant="plain"
          disabled={disabled}
          aria-label={`${aria['aria-label'] ?? label}: ${current?.label ?? ''}`}
          items={menuItems(options, sel, set, renderIcon)}
          // SC §3 / §6: value in secondaryLabel; the trailing edge sits on the row's 20 pt margin.
          contentStyle={{ color: 'var(--lq-secondary-label)', padding: 0, marginLeft: 8 }}
          label={
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 /* TODO(unknown) */ }}>
              {current?.label}
              <ChevronUpDown />
            </span>
          }
        />
      }
    />
  );
}
