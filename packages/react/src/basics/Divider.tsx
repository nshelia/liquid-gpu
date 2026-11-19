/** Divider: 0.33 pt (1 device px) in `.separator` #3C3C43@0.29 / dark #545458@0.6, full width or full height (SC §4, BL static-standalone). */
import type { CSSProperties } from 'react';
import { useBasicsCss } from './shared';

export interface DividerProps {
  /** Vertical rule for horizontal stacks (SwiftUI picks the axis from the stack). */
  vertical?: boolean;
  style?: CSSProperties;
}

export function Divider({ vertical = false, style }: DividerProps) {
  useBasicsCss();
  const hair = 'calc(1px / var(--lq-dpr))';
  return (
    <div
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      style={{
        flex: 'none',
        alignSelf: 'stretch',
        background: 'var(--lq-divider)',
        ...(vertical ? { width: hair, minHeight: '100%' } : { height: hair, width: '100%' }),
        ...style,
      }}
    />
  );
}
