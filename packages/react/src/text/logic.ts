/**
 * Pure logic for `<Text>`: Dynamic Type style table, weights, semantic colour resolution, line clamping.
 *
 * Sources (under ~/Documents/uikit-internals/):
 *   RP  = reference-page.html "Dynamic Type" / "Style detail" (sizes, weights; via core `textStyles`)
 *   TV  = findings/token-verification.md §c (tracking; via core `textStyles`)
 *   SC  = deep/swiftui-components/spec.md §13 (SwiftUI Text line box heights at Large)
 */
import type { CSSProperties } from 'react';
import { colors, fontWeights, textStyles, type TextStyleName } from '@liquid-gpu/core';
import { cssVar } from '../root/theme';

/** SwiftUI `Font.TextStyle` names. `title` = UIKit title1, `caption` = UIKit caption1. */
export const TEXT_STYLES = [
  'largeTitle',
  'title',
  'title2',
  'title3',
  'headline',
  'subheadline',
  'body',
  'callout',
  'footnote',
  'caption',
  'caption2',
] as const;
export type DynamicTypeStyle = (typeof TEXT_STYLES)[number];

const CORE_NAME: Record<DynamicTypeStyle, TextStyleName> = {
  largeTitle: 'largeTitle',
  title: 'title1',
  title2: 'title2',
  title3: 'title3',
  headline: 'headline',
  subheadline: 'subheadline',
  body: 'body',
  callout: 'callout',
  footnote: 'footnote',
  caption: 'caption1',
  caption2: 'caption2',
};

/**
 * SwiftUI Text line box heights at Large (SC §13, M `text.styles`). These are the 3× pixel-rounded frames SwiftUI lays
 * out, slightly taller than UIFont.lineHeight (core `textStyles.lineHeight`, e.g. 40.574 vs 40.67).
 */
export const SWIFTUI_LINE_HEIGHT: Record<DynamicTypeStyle, number> = {
  largeTitle: 40.667, // SC §13
  title: 33.667, // SC §13
  title2: 26.333, // SC §13
  title3: 24, // SC §13
  headline: 20.333, // SC §13
  subheadline: 18, // SC §13
  body: 20.333, // SC §13
  callout: 19.333, // SC §13
  footnote: 15.667, // SC §13
  caption: 14.333, // SC §13
  caption2: 13.333, // SC §13
};

export interface TextMetrics {
  size: number;
  weight: number;
  lineHeight: number;
  /** Tracking in pt (TV §c). Built into Apple's SF glyph advances, so CSS applies it only when `--lq-tracking-on` is 1. */
  tracking: number;
}

/** Size / weight / tracking from core `textStyles` (RP, TV §c); line height from SC §13. */
export function textMetrics(style: DynamicTypeStyle): TextMetrics {
  const t = textStyles[CORE_NAME[style]];
  return { size: t.size, weight: t.weight, lineHeight: SWIFTUI_LINE_HEIGHT[style], tracking: t.tracking };
}

export const FONT_WEIGHTS = ['ultraLight', 'thin', 'light', 'regular', 'medium', 'semibold', 'bold', 'heavy', 'black'] as const;
export type FontWeight = (typeof FONT_WEIGHTS)[number];

/** CSS weights. regular/medium/semibold/bold from core `fontWeights` (TV §c: Semibold = wght 590). */
export const FONT_WEIGHT_VALUES: Record<FontWeight, number> = {
  ultraLight: 100, // TODO(unknown): wght axis value not extracted
  thin: 200, // TODO(unknown)
  light: 300, // TODO(unknown)
  regular: fontWeights.regular,
  medium: fontWeights.medium,
  semibold: fontWeights.semibold,
  bold: fontWeights.bold,
  heavy: 800, // TODO(unknown)
  black: 900, // TODO(unknown)
};

/** SwiftUI hierarchical shape styles → semantic UIKit colour tokens (SC §13 table: `.primary` = label, etc.). */
const COLOR_ALIASES: Record<string, string> = {
  primary: 'label',
  secondary: 'secondaryLabel',
  tertiary: 'tertiaryLabel',
  quaternary: 'quaternaryLabel',
  accent: 'tint',
  accentColor: 'tint',
  red: 'systemRed',
  orange: 'systemOrange',
  yellow: 'systemYellow',
  green: 'systemGreen',
  mint: 'systemMint',
  teal: 'systemTeal',
  cyan: 'systemCyan',
  blue: 'systemBlue',
  indigo: 'systemIndigo',
  purple: 'systemPurple',
  pink: 'systemPink',
  brown: 'systemBrown',
  gray: 'systemGray',
};

/**
 * A semantic colour name (`label`, `secondaryLabel`, `tint`, `systemRed`, any core colour token, or a SwiftUI alias
 * like `secondary` / `red`) → its theme CSS variable. `white`/`black`/`clear` and anything unknown (e.g. `#FF0000`)
 * pass through as raw CSS.
 */
export function resolveColor(name: string | undefined): string | undefined {
  if (!name) return undefined;
  const token = COLOR_ALIASES[name] ?? name;
  if (token in colors.light) return cssVar(token);
  if (name === 'clear') return 'transparent';
  return name;
}

export type TextAlignment = 'leading' | 'center' | 'trailing';

const ALIGN: Record<TextAlignment, CSSProperties['textAlign']> = { leading: 'start', center: 'center', trailing: 'end' };

/** `lineLimit`: 1 → single line with an ellipsis; n > 1 → a line clamp; undefined/0 → unlimited. */
export function lineLimitStyle(lineLimit: number | undefined): CSSProperties {
  if (!lineLimit || lineLimit < 1) return {};
  const n = Math.floor(lineLimit);
  if (n === 1) return { whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' };
  return { display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: n, overflow: 'hidden' };
}

export interface TextStyleOptions {
  style?: DynamicTypeStyle;
  weight?: FontWeight;
  color?: string;
  alignment?: TextAlignment;
  lineLimit?: number;
  monospacedDigit?: boolean;
  italic?: boolean;
}

/** The complete inline style for a `<Text>`. */
export function textCss({ style = 'body', weight, color, alignment, lineLimit, monospacedDigit, italic }: TextStyleOptions): CSSProperties {
  const m = textMetrics(style);
  return {
    fontSize: m.size,
    fontWeight: weight ? FONT_WEIGHT_VALUES[weight] : m.weight,
    lineHeight: `${m.lineHeight}px`,
    letterSpacing: `calc(var(--lq-tracking-on, 0) * ${m.tracking}px)`,
    color: resolveColor(color) ?? 'inherit',
    textAlign: alignment ? ALIGN[alignment] : undefined,
    fontStyle: italic ? 'italic' : undefined,
    fontVariantNumeric: monospacedDigit ? 'tabular-nums' : undefined,
    ...lineLimitStyle(lineLimit),
  };
}

/** `<Heading level>` → text style and element (1 largeTitle/h1, 2 title/h2, 3 title2/h3). */
export function headingStyle(level: 1 | 2 | 3): { style: DynamicTypeStyle; tag: 'h1' | 'h2' | 'h3' } {
  const l = level === 1 || level === 2 || level === 3 ? level : 1;
  return { style: (['largeTitle', 'title', 'title2'] as const)[l - 1]!, tag: `h${l}` as 'h1' | 'h2' | 'h3' };
}
