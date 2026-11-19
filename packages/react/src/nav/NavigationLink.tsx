/**
 * NavigationLink: SwiftUI `NavigationLink`. Pushes `destination` (an element) or the stack's destination for `value`
 * (`NavigationStack destinations`, JSON-friendly) onto the nearest NavigationStack.
 *
 * Inside a `<List>` it renders as a Row with the disclosure chevron (title, subtitle, detail, icon); elsewhere as a
 * plain `Button` (variant configurable). `children` replaces the default label.
 */
import type { ReactElement, ReactNode } from 'react';
import { Row, useInList } from '../list/List';
import { Button, type ButtonProps } from '../controls/Button';
import { useNavigation } from './NavigationStack';

export interface NavigationLinkProps {
  /** Screen to push. */
  destination?: ReactElement;
  /** Destination key resolved through the stack's `destinations` (used when `destination` is not given). */
  value?: string;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Row detail text (List only). */
  detail?: ReactNode;
  icon?: ReactNode;
  /** Button variant outside a List. */
  variant?: ButtonProps['variant'];
  disabled?: boolean;
  /** Force the presentation (default: `row` inside a List, else `button`). */
  as?: 'row' | 'button';
  /** Called before navigating. */
  onPress?(): void;
  'aria-label'?: string;
  children?: ReactNode;
}

export function NavigationLink({
  destination,
  value,
  title,
  subtitle,
  detail,
  icon,
  variant,
  disabled,
  as,
  onPress,
  children,
  ...aria
}: NavigationLinkProps) {
  const nav = useNavigation();
  const inList = useInList();
  const go = () => {
    if (disabled) return;
    onPress?.();
    if (!nav) {
      console.warn('[liquid-gpu] NavigationLink outside a NavigationStack');
      return;
    }
    if (destination) nav.push(destination);
    else if (value !== undefined) nav.pushValue(value);
  };
  const kind = as ?? (inList ? 'row' : 'button');
  if (kind === 'row') {
    return (
      <Row
        title={title}
        subtitle={subtitle}
        detail={detail}
        icon={icon}
        accessory="disclosure"
        onPress={disabled ? undefined : go}
        aria-label={aria['aria-label']}
      >
        {children}
      </Row>
    );
  }
  return (
    <Button variant={variant} disabled={disabled} icon={icon} onClick={go} aria-label={aria['aria-label']}>
      {children ?? title}
    </Button>
  );
}
