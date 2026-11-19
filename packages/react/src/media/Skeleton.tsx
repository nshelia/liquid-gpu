/**
 * Skeleton / Redacted: SwiftUI `.redacted(reason: .placeholder)` style placeholders. Rounded bars in the redaction
 * fill (styles.ts `--lq-media-redact`, TODO(unknown) colour); no animation on iOS, so `shimmer` is opt-in.
 * TODO(unknown): bar height / radius / line pitch; a body line (20.33, basics/shared.tsx BODY_LINE) holds a 13 pt bar.
 */
import type { CSSProperties, ReactNode } from 'react';
import { BODY_LINE } from '../basics/shared';
import { skeletonLineWidths } from './logic';
import { useMediaCss } from './styles';

const BAR = 13; // TODO(unknown) bar height ≈ cap height + descender of Body 17
const BAR_RADIUS = 4; // TODO(unknown)

export interface SkeletonProps {
  /** Number of text lines (ignored when `circle` or `height` is set). */
  lines?: number;
  width?: number | string;
  height?: number | string;
  circle?: boolean;
  /** Corner radius of a block skeleton. */
  radius?: number;
  shimmer?: boolean;
  style?: CSSProperties;
}

export function Skeleton({ lines = 1, width, height, circle, radius, shimmer = false, style }: SkeletonProps) {
  useMediaCss();
  const cls = shimmer ? 'lq-skel-shimmer' : undefined;
  const fill = 'var(--lq-media-redact)';
  if (circle || height !== undefined) {
    const d = width ?? height ?? 40;
    return (
      <span
        aria-hidden
        className={cls}
        style={{
          display: 'block',
          flex: 'none',
          width: circle ? d : (width ?? '100%'),
          height: circle ? d : height,
          borderRadius: circle ? '50%' : (radius ?? BAR_RADIUS),
          ['cornerShape' as string]: circle ? undefined : 'squircle',
          backgroundColor: fill,
          ...style,
        }}
      />
    );
  }
  return (
    <span aria-hidden style={{ display: 'block', width: width ?? '100%', ...style }}>
      {skeletonLineWidths(lines).map((w, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', height: BODY_LINE }}>
          <span className={cls} style={{ display: 'block', width: `${w * 100}%`, height: BAR, borderRadius: radius ?? BAR_RADIUS, backgroundColor: fill }} />
        </span>
      ))}
    </span>
  );
}

export interface RedactedProps {
  active?: boolean;
  children?: ReactNode;
  style?: CSSProperties;
}

/**
 * `<Redacted active>`: keeps the children's layout but hides their text behind per-line bars and images/glyphs behind
 * the fill, and makes the subtree inert (no focus, no taps), like SwiftUI placeholders.
 */
export function Redacted({ active = true, children, style }: RedactedProps) {
  useMediaCss();
  return (
    <div className={active ? 'lq-redacted' : undefined} aria-busy={active || undefined} inert={active || undefined} style={style}>
      {children}
    </div>
  );
}
