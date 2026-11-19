/**
 * FormRow: the 52 pt inset-grouped row (LS = components/lists.md §1.1–1.2, as built in `list/List.tsx` and
 * `basics/shared.tsx` BasicRow) with an optional message line under the control.
 *
 * - Row min height `metrics.rowHeight` (52, LS §1.1; SC §5 "In Form: 52 pt rows"), side margins
 *   `metrics.cellLayoutMargins` (20), separator 1 pt `--lq-separator` inset 20 both sides, hidden under the last row
 *   by the theme's `.lq-row:last-child>.lq-row-sep` rule.
 * - Message line: Footnote 13 / 15.51 (LS §0 typography, footer role); error in systemRed, help text in
 *   secondaryLabel. TODO(unknown): iOS has no inline field-error metrics; 0 pt above, 11 pt below so the text sits
 *   inside the card like a subtitle (LS subtitle cell 62 pt → ~10 pt bottom).
 */
import { forwardRef, type CSSProperties, type FocusEvent, type ReactNode } from 'react';
import { metrics, textStyles } from '@liquid-gpu/core';

export interface FormRowProps {
  children?: ReactNode;
  /** Error (systemRed) or help text (secondaryLabel) under the control. */
  error?: ReactNode;
  help?: ReactNode;
  messageId?: string;
  /** Focus left the row (relatedTarget outside it). */
  onBlur?(): void;
  disabled?: boolean;
  style?: CSSProperties;
  /** Main line style (e.g. a column for a stacked slider). */
  lineStyle?: CSSProperties;
  'data-field'?: string;
}

const FOOTNOTE = textStyles.footnote; // 13 / 15.514 (core tokens, LS §0)
const MESSAGE_BOTTOM = 11; // TODO(unknown) see module doc

export const FormRow = forwardRef<HTMLDivElement, FormRowProps>(function FormRow(
  { children, error, help, messageId, onBlur, disabled, style, lineStyle, ...data },
  ref,
) {
  const pad = metrics.cellLayoutMargins[1];
  const message = error || help;
  const handleBlur = onBlur
    ? (e: FocusEvent<HTMLDivElement>) => {
        const next = e.relatedTarget as Node | null;
        if (next && e.currentTarget.contains(next)) return;
        onBlur();
      }
    : undefined;
  return (
    <div ref={ref} role="listitem" className="lq-row" data-field={data['data-field']} onBlur={handleBlur} style={{ position: 'relative', ...style }}>
      <div
        className="lq-row-fg"
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          width: '100%',
          minHeight: metrics.rowHeight,
          padding: `0 ${pad}px`,
          boxSizing: 'border-box',
          background: 'var(--lq-cell-grouped)',
          color: disabled ? 'var(--lq-tertiary-label)' : 'var(--lq-label)', // LS §0 disabled text #3C3C43@0.298
          fontSize: 17, // Body (LS §0)
          lineHeight: '20.333px', // SwiftUI body frame (basics/shared BODY_LINE)
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', minHeight: metrics.rowHeight, gap: 8, ...lineStyle }}>{children}</div>
        {message && (
          <div
            id={messageId}
            role={error ? 'alert' : undefined}
            style={{
              marginTop: -6, // pull up into the 52 pt line's bottom padding. TODO(unknown)
              paddingBottom: MESSAGE_BOTTOM,
              fontSize: FOOTNOTE.size,
              lineHeight: `${FOOTNOTE.lineHeight}px`,
              color: error ? 'var(--lq-system-red)' : 'var(--lq-secondary-label)',
            }}
          >
            {message}
          </div>
        )}
      </div>
      <div
        aria-hidden
        className="lq-row-sep"
        style={{
          position: 'absolute',
          left: pad,
          right: metrics.separatorInsetLeading,
          bottom: 0,
          height: 1, // 1 pt separator (list/List.tsx, ED)
          background: 'var(--lq-separator)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
});
