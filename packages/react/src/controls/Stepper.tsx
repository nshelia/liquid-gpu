/**
 * `Stepper` (UIStepper, components/controls.md §4).
 *
 * - 94×32: two half-capsule segments (46.33 / 46.67) filled stepperFill, a 1×24 divider at y 4, minus 13.33×2 and
 *   plus 13.33×13.33 glyphs in labelColor; dimmed glyphs at the limits.
 * - Pressed half switches instantly to stepperPressed (#000@0.08) and back at touch-up, no animation.
 * - A tap commits at touch-up. A hold repeats: first at 0.5 s, then 0.5 s while count ≤ 3, 0.1 s while ≤ 18, then
 *   0.05 s (CT §4.2). No haptic (haptics-framerate §4).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cssVar } from '../root';
import { STEPPER_FIRST_REPEAT, stepperGeometry as G, stepperRepeatInterval, stepperStep } from './logic';
import { useControllable, useLatest } from './internal';

export interface StepperProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** UIStepper.wraps (default false). */
  wraps?: boolean;
  /** UIStepper.autorepeat (default true). */
  autorepeat?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

export function Stepper({
  value,
  defaultValue = 0,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  wraps = false,
  autorepeat = true,
  disabled,
  className,
  style,
  ...aria
}: StepperProps) {
  const [val, setVal] = useControllable(value, defaultValue, onChange);
  const valRef = useLatest(val);
  const [pressed, setPressed] = useState<-1 | 0 | 1>(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const repeated = useRef(0);

  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => stop, []);

  const doStep = (dir: 1 | -1) => {
    const next = stepperStep(valRef.current, dir, { min, max, step, wraps });
    if (next !== valRef.current) {
      valRef.current = next;
      setVal(next);
    }
  };

  const down = (dir: 1 | -1) => (e: React.PointerEvent) => {
    if (disabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    setPressed(dir);
    repeated.current = 0;
    if (!autorepeat) return;
    const schedule = (delay: number) => {
      timer.current = setTimeout(() => {
        repeated.current++;
        doStep(dir);
        schedule(stepperRepeatInterval(repeated.current) * 1000);
      }, delay);
    };
    schedule(STEPPER_FIRST_REPEAT * 1000);
  };
  const up = (dir: 1 | -1, commit: boolean) => () => {
    if (pressed !== dir) return;
    stop();
    setPressed(0);
    // CT §4.2: a single tap commits at touch-up; a hold that already repeated does not step again.
    if (commit && repeated.current === 0) doStep(dir);
  };

  const atMin = !wraps && val <= min;
  const atMax = !wraps && val >= max;
  const half = (dir: 1 | -1): CSSProperties => ({
    position: 'absolute',
    left: dir < 0 ? G.minusX : G.plusX,
    top: 0,
    width: dir < 0 ? G.minusW : G.plusW,
    height: G.height,
    border: 'none',
    padding: 0,
    margin: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: pressed === dir ? cssVar('stepperPressed') : 'transparent',
    color: cssVar('label'),
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: 'inherit',
  });
  const glyph = (dir: 1 | -1, dim: boolean) => (
    <svg width={G.glyph} height={G.glyph} viewBox="0 0 40 40" aria-hidden="true" style={{ opacity: dim ? 0.36 : 1 }}>
      <rect x="0" y="17" width="40" height="6" rx="3" fill="currentColor" />
      {dir > 0 && <rect x="17" y="0" width="6" height="40" rx="3" fill="currentColor" />}
    </svg>
  );
  return (
    <div
      role="group"
      className={className}
      style={{
        display: 'inline-flex',
        position: 'relative',
        width: G.width,
        height: G.height,
        borderRadius: G.height / 2,
        overflow: 'hidden',
        background: cssVar('stepperFill'),
        opacity: disabled ? 0.5 : 1,
        verticalAlign: 'middle',
        flex: 'none',
        ...style,
      }}
      {...aria}
    >
      {([-1, 1] as const).map((dir) => {
        const dim = dir < 0 ? atMin : atMax;
        return (
          <button
            key={dir}
            type="button"
            aria-label={dir < 0 ? 'Decrement' : 'Increment'}
            disabled={disabled || dim}
            style={half(dir)}
            onPointerDown={down(dir)}
            onPointerUp={up(dir, true)}
            onPointerLeave={up(dir, false)}
            onPointerCancel={up(dir, false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                doStep(dir);
              }
            }}
          >
            {glyph(dir, dim)}
          </button>
        );
      })}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: G.dividerX,
          top: G.dividerY,
          width: 1,
          height: G.dividerH,
          borderRadius: 0.5,
          background: cssVar('stepperDivider'),
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}
