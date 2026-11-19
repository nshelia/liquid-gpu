/**
 * LabeledContent: title in label colour leading, value trailing in secondaryLabel (#8A8A8E / #8D8D93 on white/black;
 * #98989F on dark grouped cells). Standalone 20.33 tall full width; as a list row 52 pt (SC §4, §6; BL static-*).
 */
import type { CSSProperties, ReactNode } from 'react';
import { BasicRow, BODY_LINE, bodyText } from './shared';

export interface LabeledContentProps {
  label: ReactNode;
  value?: ReactNode;
  /** Custom content in place of `value`. */
  children?: ReactNode;
  style?: CSSProperties;
}

function Parts({ label, value, children }: LabeledContentProps) {
  return (
    <>
      <span style={{ flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
      <span style={{ flex: 'none', marginLeft: 8, color: 'var(--lq-secondary-label)', whiteSpace: 'nowrap' }}>{children ?? value}</span>
    </>
  );
}

export function LabeledContent({ style, ...p }: LabeledContentProps) {
  return (
    <div style={{ ...bodyText, display: 'flex', alignItems: 'center', width: '100%', minHeight: BODY_LINE, color: 'var(--lq-label)', ...style }}>
      <Parts {...p} />
    </div>
  );
}

/** LabeledContent as an inset-grouped list row. */
export function LabeledContentRow(p: LabeledContentProps) {
  return (
    <BasicRow>
      <Parts {...p} />
    </BasicRow>
  );
}
