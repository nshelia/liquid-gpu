/**
 * Badge: standalone count / label pill with the tab-bar badge metrics (BR = uikit-internals/components/bars.md §3.3):
 * height 18.33, r 9.17 capsule, min width 18.33, 4 pt horizontal padding, `.SFUI-Medium` 12 white on systemRed;
 * an empty value is an 18 × 18 circle (the `dot` variant).
 * Tag: capsule chip in the tinted button style (CT = components/controls.md §1: fill tint@0.18 light / @0.25 dark,
 * text in the tint) at SwiftUI control sizes (SC = deep/swiftui-components/spec.md "Control sizes").
 */
import type { CSSProperties, ReactNode } from 'react';
import { cssVar } from '../root/theme';
import { BADGE, BADGE_MAX, colorToken, formatBadge, type SemanticColor } from './logic';
import { useMediaCss } from './styles';

export type BadgeVariant = 'count' | 'dot' | 'label';

export interface BadgeProps {
  value?: string | number;
  /** Fill colour (default red = BR §3.3 systemRed). */
  color?: SemanticColor;
  variant?: BadgeVariant;
  /** Counts above this show "max+" (default 99). */
  max?: number;
  /** Show a 0 count instead of hiding. */
  showZero?: boolean;
  'aria-label'?: string;
  style?: CSSProperties;
}

export function Badge({ value, color = 'red', variant, max = BADGE_MAX, showZero = false, style, ...aria }: BadgeProps) {
  const v: BadgeVariant = variant ?? (value === '' || value === undefined ? 'dot' : typeof value === 'number' ? 'count' : 'label');
  const text = v === 'dot' ? '' : v === 'count' ? formatBadge(value, max, showZero) : value === undefined ? null : String(value);
  if (text === null) return null;
  const dot = text === '';
  return (
    <span
      role="status"
      aria-label={aria['aria-label'] ?? (dot ? 'New' : text)}
      style={{
        display: 'inline-block',
        boxSizing: 'border-box',
        flex: 'none',
        height: dot ? BADGE.dot : BADGE.height,
        width: dot ? BADGE.dot : undefined,
        minWidth: dot ? undefined : BADGE.minWidth,
        padding: dot ? 0 : `0 ${BADGE.paddingX}px`,
        borderRadius: dot ? '50%' : BADGE.radius,
        background: cssVar(colorToken(color, 'red')),
        color: '#FFFFFF', // BR §3.3 white
        fontSize: BADGE.fontSize,
        fontWeight: BADGE.fontWeight,
        lineHeight: `${BADGE.height}px`,
        letterSpacing: 0,
        textAlign: 'center',
        whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
        ...style,
      }}
    >
      {dot ? null : text}
    </span>
  );
}

export type TagVariant = 'tinted' | 'filled' | 'gray';
export type TagSize = 'small' | 'regular';

export interface TagProps {
  label: string;
  color?: SemanticColor;
  /** tinted (CT tinted), filled (borderedProminent: solid tint, white text), gray (bordered: secondarySystemFill, tint text). */
  variant?: TagVariant;
  size?: TagSize;
  icon?: ReactNode;
  style?: CSSProperties;
}

/** SC "Control sizes": small 28 tall, padding 10, 15 pt; regular 34.33, padding 12, 17 pt. */
const TAG_SIZES = {
  small: { height: 28, padX: 10, font: 15, gap: 4 }, // gap TODO(unknown)
  regular: { height: 34.33, padX: 12, font: 17, gap: 6 }, // gap TODO(unknown)
} as const;

export function Tag({ label, color = 'tint', variant = 'tinted', size = 'small', icon, style }: TagProps) {
  useMediaCss();
  const s = TAG_SIZES[size] ?? TAG_SIZES.small;
  const c = cssVar(colorToken(color));
  const background =
    variant === 'filled'
      ? c
      : variant === 'gray'
        ? cssVar('secondarySystemFill') // SC `.bordered` #787880@0.16 / @0.32
        : `color-mix(in srgb, ${c} calc(var(--lq-media-tint-a) * 100%), transparent)`; // CT tinted 0.18 / 0.25
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: s.gap,
        boxSizing: 'border-box',
        flex: 'none',
        height: s.height,
        padding: `0 ${s.padX}px`,
        borderRadius: s.height / 2, // SC `.capsule` h/2
        background,
        color: variant === 'filled' ? '#FFFFFF' : c,
        fontSize: s.font,
        fontWeight: 510, // TODO(unknown) tag weight; bordered titles are Medium-ish in iOS 27 (core fontWeights.medium)
        lineHeight: 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon && (
        <span aria-hidden style={{ display: 'inline-flex', width: s.font, height: s.font }}>
          {icon}
        </span>
      )}
      {label}
    </span>
  );
}
