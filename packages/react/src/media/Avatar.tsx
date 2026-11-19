/**
 * Avatar: iOS Contacts-style circle. An image (`src`) when it loads, else a monogram from `name` (logic.ts `monogram`)
 * in white on the gray monogram gradient, else the person glyph. AvatarGroup overlaps avatars with a ring cut-out.
 * TODO(unknown): Contacts sizes, gradient, monogram font and group overlap were not extracted (see logic.ts / styles.ts).
 */
import { Children, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { cssVar } from '../root/theme';
import { PersonFill } from '../icons';
import { avatarDiameter, groupOverflow, monogram, monogramFontSize, type AvatarSize } from './logic';
import { useMediaCss } from './styles';

export interface AvatarProps {
  src?: string;
  /** Full name; the monogram uses the first and last words. Also the accessible label. */
  name?: string;
  size?: AvatarSize;
  /** Explicit initials (overrides the computed monogram). */
  initials?: string;
  style?: CSSProperties;
}

export function Avatar({ src, name, size = 'medium', initials, style }: AvatarProps) {
  useMediaCss();
  const d = avatarDiameter(size);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  const text = initials ?? monogram(name);
  const showImg = !!src && !failed;
  return (
    <span
      role="img"
      aria-label={name || 'Contact'}
      style={{
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: d,
        height: d,
        borderRadius: '50%',
        overflow: 'hidden',
        flex: 'none',
        background: 'var(--lq-media-monogram)',
        color: '#FFFFFF',
        fontSize: monogramFontSize(d, [...text].length),
        fontWeight: 590, // TODO(unknown) monogram weight; core fontWeights.semibold
        // TODO(unknown) Contacts monogram uses a rounded face; ui-rounded where the platform has it.
        fontFamily: 'ui-rounded, var(--lq-font)',
        lineHeight: 1,
        letterSpacing: 0,
        userSelect: 'none',
        ...style,
      }}
    >
      {showImg ? (
        <img src={src} alt="" draggable={false} onError={() => setFailed(true)} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : text ? (
        <span aria-hidden style={{ whiteSpace: 'nowrap' }}>{text}</span>
      ) : (
        <span aria-hidden style={{ display: 'flex', width: '62%', height: '62%', marginTop: '18%' }}>
          <PersonFill size={d * 0.62} />
        </span>
      )}
    </span>
  );
}

export interface AvatarGroupItem {
  src?: string;
  name?: string;
}

export interface AvatarGroupProps {
  /** Serializable form; `children` (Avatar elements) also work. */
  items?: AvatarGroupItem[];
  children?: ReactNode;
  size?: AvatarSize;
  /** Max circles shown including the "+N" chip. */
  max?: number;
  /** Overlap as a fraction of the diameter (TODO(unknown): 0.3). */
  overlap?: number;
  style?: CSSProperties;
}

export function AvatarGroup({ items, children, size = 'small', max, overlap = 0.3, style }: AvatarGroupProps) {
  const d = avatarDiameter(size);
  const nodes: ReactNode[] = items ? items.map((it, i) => <Avatar key={i} src={it.src} name={it.name} size={d} />) : Children.toArray(children);
  const { visible, overflow } = groupOverflow(nodes.length, max);
  const ring = Math.max(1.5, d / 20); // TODO(unknown): cut-out ring width
  const cell = (child: ReactNode, i: number) => (
    <span
      key={i}
      style={{
        display: 'inline-flex',
        borderRadius: '50%',
        marginLeft: i === 0 ? 0 : -d * overlap,
        boxShadow: `0 0 0 ${ring}px ${cssVar('systemBackground')}`,
        position: 'relative',
        zIndex: nodes.length - i,
      }}
    >
      {child}
    </span>
  );
  return (
    <span role="group" style={{ display: 'inline-flex', alignItems: 'center', padding: ring, ...style }}>
      {nodes.slice(0, visible).map(cell)}
      {overflow > 0 &&
        cell(
          <span
            aria-label={`${overflow} more`}
            role="img"
            style={{
              width: d,
              height: d,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: cssVar('systemGray5'),
              color: cssVar('secondaryLabel'),
              fontSize: monogramFontSize(d, 2) * 0.85,
              fontWeight: 590,
              lineHeight: 1,
            }}
          >
            +{overflow}
          </span>,
          visible,
        )}
    </span>
  );
}
