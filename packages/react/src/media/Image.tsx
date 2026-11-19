/**
 * Image: SwiftUI `AsyncImage`-like. While loading, the frame shows a secondarySystemFill placeholder (SC `.fill.secondary`
 * #787880@0.16 / @0.32, core tokens RP `SEM`); on failure it shows a `photo` glyph in tertiaryLabel. No fade-in:
 * AsyncImage swaps the phase without a transition by default (TODO(unknown): not measured).
 * Corners are continuous (RP Corners) via `corner-shape: squircle` where supported, as basics/GroupBox.tsx.
 */
import { useEffect, useState, type CSSProperties } from 'react';
import { cssVar } from '../root/theme';
import { cornerStyle, type CornerRadius } from './logic';

export type ImageContentMode = 'fill' | 'fit';
export type ImagePhase = 'loading' | 'success' | 'failure';

export interface ImageProps {
  src?: string;
  alt?: string;
  /** Width / height, e.g. 1.5 or "16/9". */
  aspectRatio?: number | string;
  /** `fill` = scaledToFill (crops), `fit` = scaledToFit (letterboxes). */
  contentMode?: ImageContentMode;
  cornerRadius?: CornerRadius;
  width?: number | string;
  height?: number | string;
  /** Hide the placeholder fill (e.g. transparent PNGs that should not show a box). */
  placeholder?: 'fill' | 'none';
  onPhaseChange?(phase: ImagePhase): void;
  style?: CSSProperties;
  className?: string;
}

/** SF Symbol `photo` approximation (24 pt frame). */
export function PhotoGlyph({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinejoin="round" aria-hidden>
      <rect x="2.5" y="4.5" width="19" height="15" rx="3" />
      <circle cx="8.5" cy="9.5" r="1.8" fill="currentColor" stroke="none" />
      <path d="M3 17l5.2-4.6 3.6 3.1 3.4-3 5.8 5" strokeLinecap="round" />
    </svg>
  );
}

export function Image({
  src,
  alt = '',
  aspectRatio,
  contentMode = 'fill',
  cornerRadius,
  width,
  height,
  placeholder = 'fill',
  onPhaseChange,
  style,
  className,
}: ImageProps) {
  const [phase, setPhase] = useState<ImagePhase>(src ? 'loading' : 'failure');
  useEffect(() => {
    const p: ImagePhase = src ? 'loading' : 'failure';
    setPhase(p);
    onPhaseChange?.(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  const set = (p: ImagePhase) => {
    setPhase(p);
    onPhaseChange?.(p);
  };

  const c = cornerStyle(cornerRadius);
  const ratio = typeof aspectRatio === 'string' ? aspectRatio.replace(':', '/') : aspectRatio;
  // No ratio and no height: the bitmap sizes the frame once loaded; until then a 4:3 box (TODO(unknown)).
  const intrinsic = ratio === undefined && height === undefined;
  const box = typeof width === 'number' && typeof height === 'number' ? Math.min(width, height) : undefined;
  const glyph = box ? Math.max(12, Math.min(40, box * 0.3)) : 28; // TODO(unknown): failure glyph size

  return (
    <div
      className={className}
      role={phase === 'success' ? undefined : 'img'}
      aria-label={phase === 'success' ? undefined : alt || undefined}
      aria-busy={phase === 'loading' || undefined}
      style={{
        position: 'relative',
        display: 'block',
        overflow: 'hidden',
        width: width ?? (height === undefined ? '100%' : undefined),
        height,
        aspectRatio: intrinsic ? (phase === 'success' ? undefined : '4 / 3') : ratio,
        borderRadius: c.radius,
        ['cornerShape' as string]: c.squircle ? 'squircle' : undefined,
        background: phase === 'success' || placeholder === 'none' ? undefined : cssVar('secondarySystemFill'),
        flex: 'none',
        ...style,
      }}
    >
      {src && phase !== 'failure' && (
        <img
          key={src}
          src={src}
          alt={alt}
          decoding="async"
          draggable={false}
          onLoad={() => set('success')}
          onError={() => set('failure')}
          style={{
            display: 'block',
            width: '100%',
            height: intrinsic ? 'auto' : '100%',
            position: intrinsic && phase !== 'success' ? 'absolute' : undefined,
            objectFit: contentMode === 'fit' ? 'contain' : 'cover',
            opacity: phase === 'success' ? 1 : 0,
          }}
        />
      )}
      {phase === 'failure' && (
        <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: cssVar('tertiaryLabel') }}>
          <PhotoGlyph size={glyph} />
        </span>
      )}
    </div>
  );
}
