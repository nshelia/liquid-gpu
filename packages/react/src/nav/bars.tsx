/**
 * Bar items: glass capsules for the navigation bar (44 pt) and the toolbar (48 pt).
 *
 * BR = components/bars.md:
 * - §1.7 nav: capsule 44 tall, r 22, items 36 tall inset 4, 16 apart; symbol item = image + 14; single symbol =
 *   44 circle; text item = label + 24 (capsule + 8); 12 pt between capsules; plain text Medium 17 in the label colour (the vibrant matrix maps the tint to near-black / white);
 *   `.prominent` = its own tinted capsule with Semibold 17 white text.
 * - §2 toolbar: capsule 48, r 24, items 38 inset 5, 14 apart; symbol button = image + 16; text = label + 22.
 * - §0: nav-bar and toolbar glass groups use SDF smoothness 12 (`spacing` 12 here).
 * - §1.6 back button: chevron-only 44 × 44 glass circle, `chevron.backward` in the label colour.
 */
import { createContext, useContext, useId, type CSSProperties, type ReactNode } from 'react';
import { colors, componentType } from '@liquid-gpu/core';
import { Glass } from '../root/Glass';
import { useLiquid } from '../root/context';
import { ChevronBackward } from '../icons';
import { NAV_ITEMS, TOOLBAR } from '../logic/nav';
import { useNavigation } from './NavigationStack';

export interface BarMetrics {
  height: number;
  itemHeight: number;
  inset: number;
  gap: number;
  symbolPad: number;
  textPad: number;
  /** Glass group shared by the capsules of one bar side. */
  group: string;
}

export const navBarMetrics = (group: string): BarMetrics => ({
  height: NAV_ITEMS.height,
  itemHeight: NAV_ITEMS.itemHeight,
  inset: NAV_ITEMS.itemInset,
  gap: NAV_ITEMS.itemGap,
  symbolPad: NAV_ITEMS.symbolPad,
  textPad: NAV_ITEMS.textPad,
  group,
});

export const toolbarMetrics = (group: string): BarMetrics => ({
  height: TOOLBAR.height,
  itemHeight: TOOLBAR.itemHeight,
  inset: TOOLBAR.itemInset,
  gap: TOOLBAR.itemGap,
  symbolPad: 8, // BR §2 symbol button = image + 16
  textPad: 11, // BR §2 text = label + 22
  group,
});

export const BarMetricsContext = createContext<BarMetrics>(navBarMetrics('lq-bar'));
const InGroupContext = createContext(false);

/** SDF smoothness of bar glass groups (BR §0). */
export const BAR_GLASS_SPACING = 12;

export interface BarButtonProps {
  icon?: ReactNode;
  label?: ReactNode;
  onPress?(): void;
  /** `.prominent` / `.done`: tinted capsule, white Semibold text (BR §0, §1.7). */
  prominent?: boolean;
  /** Capsule colour for `prominent` (SwiftUI `.tint`). Default: the system tint for the appearance. */
  tint?: string;
  disabled?: boolean;
  'aria-label'?: string;
  style?: CSSProperties;
}

function itemStyle(m: BarMetrics, hasIcon: boolean, prominent: boolean, disabled: boolean): CSSProperties {
  return {
    height: m.itemHeight,
    minWidth: m.itemHeight,
    padding: `0 ${hasIcon ? m.symbolPad : m.textPad}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: m.itemHeight / 2,
    color: disabled ? 'var(--lq-bar-item-disabled)' : prominent ? 'var(--lq-bar-prominent-text)' : 'var(--lq-label)',
    fontSize: componentType.barItemText.size,
    fontWeight: prominent ? 590 : componentType.barItemText.weight,
    // Same switch as every other text style (theme.ts `--lq-tracking-on`, 0): the system font already applies SF's 17 pt
    // tracking, and a fixed −0.432 on top made bar labels ≈2.5 pt narrower than the native UILabel frames
    // (Cancel 54, Edit 30.33, Select 49.33, Search 54.67; bars/nav.items.*.json).
    letterSpacing: 'calc(var(--lq-tracking-on) * -0.432px)',
    whiteSpace: 'nowrap',
  };
}

/**
 * A bar item. Alone it is its own glass (a 44/48 circle for a symbol, a capsule for text); inside `<BarGroup>` it is
 * one item of the group's capsule.
 */
export function BarButton({ icon, label, onPress, prominent = false, tint, disabled = false, style, ...aria }: BarButtonProps) {
  const m = useContext(BarMetricsContext);
  const inGroup = useContext(InGroupContext);
  const { appearance } = useLiquid();
  const hasIcon = !!icon && !label;
  if (inGroup && !prominent) {
    return (
      <button
        type="button"
        className="lq-bar-item"
        disabled={disabled}
        aria-label={aria['aria-label']}
        onClick={onPress}
        style={{ ...itemStyle(m, hasIcon, false, disabled), ...style }}
      >
        {icon}
        {label}
      </button>
    );
  }
  const single = hasIcon;
  return (
    <Glass
      as="button"
      interactive={!disabled}
      group={prominent ? undefined : m.group}
      spacing={BAR_GLASS_SPACING}
      tint={prominent ? (tint ?? colors[appearance].tint) : null}
      disabled={disabled}
      aria-label={aria['aria-label']}
      onClick={onPress}
      radius={m.height / 2}
      contentStyle={{
        ...itemStyle(m, hasIcon, prominent, disabled),
        height: m.height,
        minWidth: m.height,
        width: single ? m.height : undefined,
        padding: single ? 0 : `0 ${m.textPad + m.inset}px`,
        borderRadius: m.height / 2,
        ...style,
      }}
    >
      {icon}
      {label}
    </Glass>
  );
}

/** One glass capsule holding several bar items (BR §1.7 "symbols3": 4 + Σ widths + 16·(n−1) + 4). */
export function BarGroup({ children, 'aria-label': label }: { children: ReactNode; 'aria-label'?: string }) {
  const m = useContext(BarMetricsContext);
  return (
    <Glass
      as="div"
      role="group"
      aria-label={label}
      interactive
      group={m.group}
      spacing={BAR_GLASS_SPACING}
      radius={m.height / 2}
      contentStyle={{ height: m.height, padding: `0 ${m.inset}px`, gap: m.gap - 2 * 0, display: 'flex', alignItems: 'center', borderRadius: m.height / 2 }}
    >
      <InGroupContext.Provider value={true}>{children}</InGroupContext.Provider>
    </Glass>
  );
}

/** BR §1.6: chevron-only 44 pt glass circle; pops the enclosing NavigationStack. */
export function BackButton({ onPress, label = 'Back' }: { onPress?(): void; label?: string }) {
  const nav = useNavigation();
  const m = useContext(BarMetricsContext);
  return (
    <Glass
      as="button"
      interactive
      group={m.group}
      spacing={BAR_GLASS_SPACING}
      aria-label={label}
      onClick={() => (onPress ? onPress() : nav?.pop())}
      contentStyle={{ width: m.height, height: m.height, color: 'var(--lq-label)', borderRadius: m.height / 2 }}
    >
      <ChevronBackward style={{ marginLeft: -1.5 }} />
    </Glass>
  );
}

/** Flexible space between toolbar items. */
export function ToolbarSpacer({ width }: { width?: number }) {
  return <div aria-hidden style={width ? { width, flex: 'none' } : { flex: '1 1 0' }} />;
}

/** Unique glass group id for one side of one bar. */
export function useBarGroup(prefix: string): string {
  return `${prefix}${useId()}`;
}
