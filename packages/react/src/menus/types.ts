import type { ReactNode } from 'react';

/** One menu action (UIAction / SwiftUI Button inside a Menu). */
export interface MenuItem {
  id?: string;
  title: string;
  subtitle?: string;
  /** Leading icon (SF-Symbol-sized SVG). */
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  /** Checkmark state (`.on`). */
  checked?: boolean;
  /** Opens a submenu: draws the trailing `chevron.forward` (TO §10.1, x 214.33). */
  submenu?: boolean;
  onSelect?: () => void;
}

/** A flat list of items, or sections separated by the 1 pt section separator. */
export type MenuContent = readonly MenuItem[] | readonly (readonly MenuItem[])[];

export function toSections(c: MenuContent): (readonly MenuItem[])[] {
  if (c.length === 0) return [];
  return Array.isArray(c[0]) ? (c as readonly (readonly MenuItem[])[]).slice() : [c as readonly MenuItem[]];
}
