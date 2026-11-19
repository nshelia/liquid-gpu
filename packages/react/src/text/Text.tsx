/**
 * Text: SwiftUI `Text` with a Dynamic Type `style` (default `.body`). Size, weight and tracking come from core
 * `textStyles` (reference-page.html "Style detail", findings/token-verification.md §c); line box heights from
 * deep/swiftui-components/spec.md §13. Colour defaults to the inherited colour (`.lq-root` sets `label`).
 */
import type { CSSProperties, ReactNode } from 'react';
import { headingStyle, textCss, type FontWeight, type TextAlignment, type DynamicTypeStyle } from './logic';

export interface TextProps {
  children?: ReactNode;
  /** Dynamic Type text style. Default `body`. */
  style?: DynamicTypeStyle;
  /** Overrides the style's weight. */
  weight?: FontWeight;
  /** Semantic colour name (`label`, `secondaryLabel`, `tint`, `systemRed`, `secondary`, `red`…) or raw CSS. */
  color?: string;
  /** Multiline text alignment. */
  alignment?: TextAlignment;
  /** Maximum lines; 1 truncates with an ellipsis. */
  lineLimit?: number;
  monospacedDigit?: boolean;
  italic?: boolean;
  /** Render inline (`display: inline`) for text runs inside other text. Default false (a block). */
  inline?: boolean;
  /** Element to render. Default `span`. */
  as?: 'span' | 'p' | 'div' | 'label' | 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  className?: string;
  id?: string;
  cssStyle?: CSSProperties;
}

export function Text({ children, style, weight, color, alignment, lineLimit, monospacedDigit, italic, inline, as = 'span', className, id, cssStyle }: TextProps) {
  const Tag = as;
  const css = textCss({ style, weight, color, alignment, lineLimit, monospacedDigit, italic });
  return (
    <Tag
      id={id}
      className={className}
      style={{ display: 'block', margin: 0, fontFamily: 'inherit', ...css, ...(inline ? { display: 'inline' } : null), ...cssStyle }}
    >
      {children}
    </Tag>
  );
}

export interface HeadingProps extends Omit<TextProps, 'style' | 'as' | 'inline'> {
  /** 1 = largeTitle (h1), 2 = title (h2), 3 = title2 (h3). Default 1. */
  level?: 1 | 2 | 3;
}

/** A Text rendered as h1–h3 with the matching large text style. */
export function Heading({ level = 1, ...rest }: HeadingProps) {
  const { style, tag } = headingStyle(level);
  return <Text {...rest} style={style} as={tag} />;
}
