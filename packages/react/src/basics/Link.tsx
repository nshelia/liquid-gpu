/**
 * Link: Body 17 in the tint (#0088FF / #0091FF; SC §4 PIX, re-sampled in BL). Pressed: opacity 0.2 at touch-down,
 * sprung back on release (BL anim-link-hold). Inside Text (`inline`) the run is tinted too — BL re-sample shows
 * #0088FF for a markdown link on iOS 27.0, not the label colour SC §4 reports. In a list the row highlights
 * (systemGray4) and the text keeps full opacity (BL shots/native-list-hold-link.png).
 * `ShapeStyle.link` (#007AFF / #0984FF) is exposed as `--lq-link`; the control does not use it.
 */
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { BasicRow, bodyText, usePressOpacity } from './shared';

export interface LinkProps {
  href: string;
  children?: ReactNode;
  /** A link run inside running text: no own line box or press dimming. */
  inline?: boolean;
  target?: string;
  style?: CSSProperties;
}

const reset: CSSProperties = { color: 'var(--lq-tint)', textDecoration: 'none', WebkitTapHighlightColor: 'transparent' };

export function Link({ href, children, inline = false, target = '_blank', style }: LinkProps) {
  const ref = useRef<HTMLAnchorElement | null>(null);
  usePressOpacity(ref, [ref], !inline);
  return (
    <a
      ref={ref}
      href={href}
      target={target}
      rel={target === '_blank' ? 'noreferrer' : undefined}
      style={inline ? { ...reset, ...style } : { ...bodyText, ...reset, display: 'inline-block', whiteSpace: 'nowrap', ...style }}
    >
      {children}
    </a>
  );
}

export interface LinkRowProps {
  href: string;
  children?: ReactNode;
  target?: string;
}

/** Link as an inset-grouped list row. */
export function LinkRow({ href, children, target = '_blank' }: LinkRowProps) {
  return (
    <BasicRow role="link" onPress={() => window.open(href, target)}>
      <span style={{ color: 'var(--lq-tint)', whiteSpace: 'nowrap' }}>{children}</span>
    </BasicRow>
  );
}
