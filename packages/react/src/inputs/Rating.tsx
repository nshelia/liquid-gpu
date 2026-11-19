/**
 * `Rating`: a row of stars (`StarFill`, basics/icons.tsx). iOS has no rating control (App Store / Music ratings are
 * app-drawn): TODO(unknown) every metric here. Star 22 pt, 4 pt gap, filled in systemOrange (the App Store idiom;
 * pass `tint` for systemYellow), empty stars in tertiarySystemFill-like `--lq-quaternary-label`.
 *
 * Interaction: tap / drag sets the value (whole or half stars), arrow keys step, Home/End jump. `role="slider"`.
 */
import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { StarFill } from '../basics/icons';
import { useControllable } from '../controls/internal';
import { ratingAtPointer, roundRating, starFill, stepRating } from './logic';

export interface RatingProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  /** Number of stars. Default 5. */
  max?: number;
  /** Allow half stars. Default false. */
  allowHalf?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
  /** Star size (pt). Default 22 (TODO(unknown)). */
  size?: number;
  /** Fill colour (CSS). Default systemOrange (TODO(unknown)). */
  tint?: string;
  /** Empty-star colour. Default quaternaryLabel (TODO(unknown)). */
  emptyColor?: string;
  'aria-label'?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

const GAP = 4; // TODO(unknown)

export function Rating({
  value,
  defaultValue = 0,
  onChange,
  max = 5,
  allowHalf = false,
  readOnly,
  disabled,
  size = 22,
  tint = 'var(--lq-system-orange)',
  emptyColor = 'var(--lq-quaternary-label)',
  className,
  style,
  ...aria
}: RatingProps) {
  const step = allowHalf ? 0.5 : 1;
  const [raw, setV] = useControllable(value, defaultValue, onChange);
  const v = roundRating(raw, max, step);
  const rowRef = useRef<HTMLDivElement | null>(null);
  const interactive = !readOnly && !disabled;
  const dragging = useRef(false);

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = rowRef.current?.getBoundingClientRect();
    if (!r) return;
    const rtl = rowRef.current ? getComputedStyle(rowRef.current).direction === 'rtl' : false;
    const next = ratingAtPointer(e.clientX - r.left, r.width, max, step, rtl);
    if (next !== v) setV(next);
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive) return;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = stepRating(v, 1, max, step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = stepRating(v, -1, max, step);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    if (next !== v) setV(next);
  };

  return (
    <div
      ref={rowRef}
      role={readOnly ? 'img' : 'slider'}
      aria-valuemin={readOnly ? undefined : 0}
      aria-valuemax={readOnly ? undefined : max}
      aria-valuenow={readOnly ? undefined : v}
      aria-valuetext={`${v} of ${max} stars`}
      aria-readonly={readOnly || undefined}
      aria-disabled={disabled || undefined}
      aria-label={aria['aria-label'] ?? (readOnly ? `${v} of ${max} stars` : 'Rating')}
      id={aria.id}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={onKey}
      onPointerDown={(e) => {
        if (!interactive) return;
        dragging.current = true;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => dragging.current && fromPointer(e)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      className={className}
      style={{
        display: 'inline-flex',
        gap: GAP,
        touchAction: interactive ? 'none' : undefined,
        cursor: interactive ? 'pointer' : 'default',
        opacity: disabled ? 0.5 : 1, // TODO(unknown) disabled appearance
        ...style,
      }}
    >
      {Array.from({ length: max }, (_, i) => {
        const f = starFill(i, v);
        return (
          <span key={i} style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
            <StarFill style={{ position: 'absolute', inset: 0, color: emptyColor }} />
            {f > 0 && (
              <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: f === 1 ? '100%' : '50%' }}>
                <StarFill width={size} height={size} style={{ color: tint, display: 'block' }} />
              </span>
            )}
          </span>
        );
      })}
    </div>
  );
}
