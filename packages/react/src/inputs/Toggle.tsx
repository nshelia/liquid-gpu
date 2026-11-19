/**
 * `Toggle` (shadcn Toggle: a pressed/selected button) and `ToggleGroup` (single or multiple selection).
 *
 * CT = components/controls.md. The on state is UIButton `isSelected` (CT §1.5 "selected" row, see `toggleColors`);
 * sizes, radii and the highlight timing are the Button's (CT §1.3, §1.4, §1.7: instant highlight, 0.25 s
 * (0.42, 0, 0.58, 1) un-highlight). `glass` uses the interactive `<Glass>`; on, the glass is tinted with the accent
 * (CT §1.5 says a solid tint fill: tinted glass keeps the element and its flex press while matching the colour).
 * ToggleGroup spacing: TODO(unknown) — no iOS counterpart; 8 pt.
 */
import { useState, type CSSProperties, type ReactNode } from 'react';
import { colors } from '@liquid-gpu/core';
import { Glass, useLiquid } from '../root';
import { buttonMetrics, type ButtonSize } from '../controls/logic';
import { useControllable } from '../controls/internal';
import { toggleColors, toggleGroupNext, type ToggleVariant } from './logic';

export interface ToggleProps {
  isOn?: boolean;
  defaultOn?: boolean;
  onChange?: (isOn: boolean) => void;
  /** Default `gray`. */
  variant?: ToggleVariant;
  size?: ButtonSize;
  /** Accent (CSS colour). Default system tint. */
  tint?: string;
  disabled?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
  cornerStyle?: 'dynamic' | 'capsule';
  fullWidth?: boolean;
  className?: string;
  style?: CSSProperties;
  'aria-label'?: string;
  id?: string;
}

export function Toggle({
  isOn,
  defaultOn = false,
  onChange,
  variant = 'gray',
  size = 'medium',
  tint,
  disabled,
  icon,
  children,
  cornerStyle,
  fullWidth,
  className,
  style,
  ...aria
}: ToggleProps) {
  const ctx = useLiquid();
  const [on, setOn] = useControllable(isOn, defaultOn, onChange);
  const [highlighted, setHighlighted] = useState(false);
  const m = buttonMetrics[size];
  const accent = tint ?? colors[ctx.appearance].tint!;
  const c = toggleColors(variant, ctx.appearance, accent, { isOn: on, highlighted, disabled });
  const glass = variant === 'glass';
  const capsule = (cornerStyle ?? (glass ? 'capsule' : 'dynamic')) === 'capsule';
  const radius = capsule ? m.height / 2 : m.radius; // CT §1.4
  const iconOnly = !!icon && (children === undefined || children === null || children === false);
  const press = {
    onPointerDown: () => setHighlighted(true),
    onPointerUp: () => setHighlighted(false),
    onPointerLeave: () => setHighlighted(false),
    onPointerCancel: () => setHighlighted(false),
  };
  const ease = 'cubic-bezier(0.42,0,0.58,1)'; // CT §1.7
  const inner: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4, // TODO(unknown): as Button
    boxSizing: 'border-box',
    height: m.height,
    minWidth: iconOnly ? m.height : undefined,
    padding: iconOnly ? 0 : `0 ${m.insetH}px`,
    fontSize: m.titleSize,
    lineHeight: `${m.titleLineHeight}px`,
    fontWeight: 400, // CT §1.3
    letterSpacing: 0,
    whiteSpace: 'nowrap',
    color: c.foreground,
    fontFamily: 'inherit',
    border: 'none',
    borderRadius: radius,
    cursor: disabled ? 'default' : 'pointer',
    transition: highlighted ? 'none' : `background-color 0.25s ${ease}, color 0.25s ${ease}`,
  };
  const toggle = () => !disabled && setOn(!on);

  if (glass) {
    return (
      <Glass
        as="button"
        type="button"
        interactive={!disabled}
        style="regular"
        tint={on && !disabled ? accent : null}
        radius={radius}
        disabled={disabled}
        aria-pressed={on}
        onClick={toggle}
        className={className}
        boxStyle={{ display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : undefined, height: m.height, verticalAlign: 'middle', ...style }}
        fit={fullWidth ? 'container' : 'content'}
        contentStyle={{ ...inner, background: 'transparent' }}
        {...press}
        {...aria}
      >
        {icon}
        {children}
      </Glass>
    );
  }
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={toggle}
      className={className}
      {...press}
      style={{ ...inner, width: fullWidth ? '100%' : undefined, background: c.fill ?? 'transparent', ...style }}
      {...aria}
    >
      {icon}
      {children}
    </button>
  );
}

export interface ToggleGroupItem {
  value: string;
  label?: string;
  icon?: ReactNode;
  disabled?: boolean;
  'aria-label'?: string;
}

interface ToggleGroupBase {
  items: ToggleGroupItem[];
  variant?: ToggleVariant;
  size?: ButtonSize;
  tint?: string;
  disabled?: boolean;
  /** Gap between items (pt). Default 8 (TODO(unknown)). */
  spacing?: number;
  /** `horizontal` (default) or `vertical`. */
  orientation?: 'horizontal' | 'vertical';
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

export interface ToggleGroupSingleProps extends ToggleGroupBase {
  type: 'single';
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null) => void;
  /** Pressing the selected item clears the selection. Default true. */
  allowEmpty?: boolean;
}

export interface ToggleGroupMultipleProps extends ToggleGroupBase {
  type: 'multiple';
  value?: string[];
  defaultValue?: string[];
  onChange?: (value: string[]) => void;
}

export type ToggleGroupProps = ToggleGroupSingleProps | ToggleGroupMultipleProps;

export function ToggleGroup(props: ToggleGroupProps) {
  const { items, variant, size, tint, disabled, spacing = 8, orientation = 'horizontal', className, style } = props;
  const single = props.type === 'single';
  const toArr = (v: string | string[] | null | undefined): string[] | undefined =>
    v === undefined ? undefined : v === null ? [] : Array.isArray(v) ? v : [v];
  const [sel, setSel] = useControllable<string[]>(toArr(props.value), toArr(props.defaultValue) ?? [], (next) => {
    if (props.type === 'single') props.onChange?.(next[0] ?? null);
    else props.onChange?.(next);
  });
  const allowEmpty = props.type === 'single' ? props.allowEmpty ?? true : true;
  return (
    <div
      role="group"
      aria-label={props['aria-label']}
      className={className}
      style={{ display: 'inline-flex', flexDirection: orientation === 'vertical' ? 'column' : 'row', flexWrap: 'wrap', gap: spacing, ...style }}
    >
      {items.map((it) => (
        <Toggle
          key={it.value}
          isOn={sel.includes(it.value)}
          onChange={() => setSel(toggleGroupNext(single ? 'single' : 'multiple', sel, it.value, allowEmpty))}
          variant={variant}
          size={size}
          tint={tint}
          disabled={disabled || it.disabled}
          icon={it.icon}
          aria-label={it['aria-label']}
        >
          {it.label}
        </Toggle>
      ))}
    </div>
  );
}
