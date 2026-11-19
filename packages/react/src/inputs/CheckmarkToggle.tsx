/**
 * `CheckmarkToggle`: the iOS checkbox idiom (iOS has no checkbox). A selection circle like the List edit-mode
 * selection control / Reminders, with a trailing label.
 *
 * Metrics reused from list/edit.tsx `SelectionGlyph` (ED = deep/demo-audit/list-edit): 22 pt control, ring r 10 at
 * 1.67 pt stroke in the accessory tint (`--lq-chevron`), selected = r 10.75 tint disc + white check stroke 1.6.
 * TODO(unknown): label gap and row height; 12 pt gap and a 44 pt minimum hit height are used. Label body 17.
 */
import type { CSSProperties, ReactNode } from 'react';
import { cssVar } from '../root';
import { useControllable } from '../controls/internal';

export interface CheckmarkToggleProps {
  isOn?: boolean;
  defaultOn?: boolean;
  onChange?: (isOn: boolean) => void;
  /** Label text (or node) after the circle. */
  label?: ReactNode;
  disabled?: boolean;
  /** Disc colour (CSS). Default system tint. */
  tint?: string;
  'aria-label'?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

export function CheckmarkGlyph({ selected, tint }: { selected: boolean; tint?: string }) {
  return (
    <svg width="22" height="22" viewBox="-11 -11 22 22" aria-hidden style={{ display: 'block', flex: 'none' }}>
      {selected ? (
        <>
          <circle r="10.75" fill={tint ?? 'var(--lq-tint)'} />
          <path d="M-4.2 1 L-0.9 4.6 L4 -3.6" fill="none" stroke="#FFFFFF" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <circle r="10" fill="none" stroke="var(--lq-chevron)" strokeWidth="1.67" />
      )}
    </svg>
  );
}

export function CheckmarkToggle({ isOn, defaultOn = false, onChange, label, disabled, tint, className, style, ...aria }: CheckmarkToggleProps) {
  const [on, setOn] = useControllable(isOn, defaultOn, onChange);
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      disabled={disabled}
      onClick={() => setOn(!on)}
      className={className ? `lq-body ${className}` : 'lq-body'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 12, // TODO(unknown)
        minHeight: 44, // TODO(unknown): hit height
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: cssVar('label'),
        font: 'inherit',
        textAlign: 'start',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1, // TODO(unknown): disabled appearance; the UISwitch disabled alpha 0.5 (CT §2.2)
        ...style,
      }}
      {...aria}
    >
      <CheckmarkGlyph selected={on} tint={tint} />
      {label != null && <span>{label}</span>}
    </button>
  );
}
