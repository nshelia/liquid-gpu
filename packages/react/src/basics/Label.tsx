/**
 * Label: icon + title (SC §4, BL static-standalone). Body: 98.67 × 21, icon 18.67 × 18 at (+1.67, +1.33) in a
 * 22.33 slot, title at +30 (+0.67 down); `.iconOnly` 22.33 × 20.67; `.titleOnly` is the bare title.
 * List row: icon 24 × 22.67 in tint at the content edge, title and separator at +40 (SC §6; BL static-list).
 */
import type { CSSProperties, ReactNode } from 'react';
import { BasicRow, BODY_LINE, bodyText } from './shared';

export type LabelStyle = 'titleAndIcon' | 'iconOnly' | 'titleOnly';

export interface LabelProps {
  title: ReactNode;
  /** An SF-Symbol-like glyph that fills its box (e.g. `<StarFill />`). */
  icon?: ReactNode;
  labelStyle?: LabelStyle;
  style?: CSSProperties;
}

export function Label({ title, icon, labelStyle = 'titleAndIcon', style }: LabelProps) {
  const showIcon = icon !== undefined && labelStyle !== 'titleOnly';
  const showTitle = labelStyle !== 'iconOnly' || icon === undefined;
  return (
    <span
      role={showTitle ? undefined : 'img'}
      aria-label={showTitle ? undefined : typeof title === 'string' ? title : undefined}
      style={{ ...bodyText, display: 'inline-flex', alignItems: 'flex-start', flex: 'none', color: 'var(--lq-label)', height: showIcon ? (showTitle ? 21 : 20.667) : BODY_LINE, ...style }}
    >
      {showIcon && (
        <span aria-hidden style={{ display: 'block', width: 22.333, height: 20.667, padding: '1.333px 0 0 1.667px', boxSizing: 'border-box', flex: 'none' }}>
          <span style={{ display: 'block', width: 18.667, height: 18 }}>{icon}</span>
        </span>
      )}
      {showTitle && <span style={{ whiteSpace: 'nowrap', marginLeft: showIcon ? 7.667 : 0, paddingTop: showIcon ? 0.667 : 0 }}>{title}</span>}
    </span>
  );
}

export interface LabelRowProps extends Omit<LabelProps, 'style'> {
  onPress?(): void;
}

/** Label as an inset-grouped list row. */
export function LabelRow({ title, icon, labelStyle = 'titleAndIcon', onPress }: LabelRowProps) {
  const showIcon = icon !== undefined && labelStyle !== 'titleOnly';
  return (
    <BasicRow onPress={onPress} separatorLead={showIcon ? 40 : 0}>
      {showIcon && (
        <span aria-hidden style={{ width: 24, height: 22.667, flex: 'none', color: 'var(--lq-tint)' }}>
          {icon}
        </span>
      )}
      {labelStyle !== 'iconOnly' && <span style={{ marginLeft: showIcon ? 16 : 0, whiteSpace: 'nowrap' }}>{title}</span>}
    </BasicRow>
  );
}
