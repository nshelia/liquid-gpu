/**
 * GroupBox: full width, secondarySystemBackground (#F2F2F7 / #1C1C1E), r 8 continuous, padding 16; title Headline
 * (Semibold 17) leading, content 2 below and centred (SC §4: 400 × 74.67; BL static-standalone title +16/+16, text +38.33).
 */
import type { CSSProperties, ReactNode } from 'react';
import { BODY_LINE, bodyText } from './shared';

export interface GroupBoxProps {
  label?: ReactNode;
  children?: ReactNode;
  style?: CSSProperties;
}

export function GroupBox({ label, children, style }: GroupBoxProps) {
  return (
    <div
      role="group"
      style={{
        boxSizing: 'border-box',
        width: '100%',
        padding: 16,
        borderRadius: 8,
        ['cornerShape' as string]: 'squircle',
        background: 'var(--lq-secondary-system-background)',
        color: 'var(--lq-label)',
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        ...style,
      }}
    >
      {label !== undefined && <div style={{ ...bodyText, fontWeight: 590, height: BODY_LINE }}>{label}</div>}
      <div style={{ ...bodyText, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>{children}</div>
    </div>
  );
}
