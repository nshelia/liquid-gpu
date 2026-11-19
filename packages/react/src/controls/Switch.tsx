/**
 * `Switch` (UISwitch, components/controls.md §2, deep/motion/findings.md §1).
 *
 * - 63×28 track, radius 14; knob 37×24 at centre x 20.5 (off) / 42.5 (on), y 14: 22 pt travel.
 * - Knob travel: spring ζ 1.0, response 0.3 (MO §1), starting ≈32 ms after touch-up.
 * - Press: the knob becomes a liquid lens lifted to 58×38.33 (lift spring ζ 0.625 / 0.27 with ≈390 pt/s width
 *   velocity, un-lift ζ 0.7 / 0.5 after the 0.22 s hang time).
 * - Drag: the knob follows the finger, rubber-banded past the ends (range 12, c 0.55); the value commits at touch-up.
 * - Track colour crossfade 0.18 s; colours from core tokens (switchTrackOff / switchTrackOn / switchThumb).
 * - Haptic: impact light on every committed change (haptics-framerate §4).
 */
import { useMotion } from './motion';
import { useEffect, useRef, type CSSProperties } from 'react';
import { playHaptic, springs } from '@liquid-gpu/core';
import { cssVar, useLiquid } from '../root';
import { switchGeometry as G, switchKnobCentre, switchValueOnRelease } from './logic';
import { LENS_TRACKING, useControllable, useLatest, useLens, useLift, squashFromVelocity } from './internal';

export interface SwitchProps {
  isOn?: boolean;
  defaultOn?: boolean;
  onChange?: (isOn: boolean) => void;
  disabled?: boolean;
  /** `onTintColor` (CSS colour). Default systemGreen token. */
  tint?: string;
  'aria-label'?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

/** MO §1: lift needs ≈390 pt/s of width velocity over the 21 pt width change → normalised ≈18.6 /s. */
const LIFT_VELOCITY = 390 / (G.knobPressedW - G.knobW);

export function Switch({ isOn, defaultOn = false, onChange, disabled, tint, className, style, ...aria }: SwitchProps) {
  const ctx = useLiquid();
  const [on, setOn] = useControllable(isOn, defaultOn, onChange);
  const onRef = useLatest(on);
  const rootRef = useRef<HTMLButtonElement | null>(null);
  const knobRef = useRef<HTMLSpanElement | null>(null);
  const fillRef = useRef<HTMLSpanElement | null>(null);
  const drag = useRef<{ active: boolean; offset: number }>({ active: false, offset: 0 });
  const liftV = useRef(0);

  const render = () => {
    const k = knobRef.current;
    if (!k) return;
    const l = Math.max(0, liftV.current);
    const w = G.knobW + (G.knobPressedW - G.knobW) * l;
    const h = G.knobH + (G.knobPressedH - G.knobH) * l;
    const cx = x.value;
    k.style.transform = `translate(${cx - w / 2}px, ${G.centreY - h / 2}px)`;
    k.style.width = `${w}px`;
    k.style.height = `${h}px`;
    k.style.opacity = String(Math.max(0, 1 - 1.6 * l)); // the opaque thumb hands over to the lens while lifted
    const f = fillRef.current;
    if (f) {
      // Well: the on-colour fill follows the knob (CT §2.1 track-on with the sliding well).
      const p = (cx - G.centreOff) / G.travel;
      f.style.opacity = String(Math.min(1, Math.max(0, p)));
    }
  };

  const x = useMotion(on ? G.centreOn : G.centreOff, springs.switchKnob, render);
  const lift = useLift((v) => {
    liftV.current = v;
    render();
  });

  useLens(rootRef, () => {
    const l = Math.max(0, liftV.current);
    return {
      cx: x.value,
      cy: G.centreY,
      w: G.knobW + (G.knobPressedW - G.knobW) * l,
      h: G.knobH + (G.knobPressedH - G.knobH) * l,
      amount: l,
      squash: squashFromVelocity(x.velocity, 0.0006, 0.028), // MO §1 squash 1.028 / 0.971 at peak velocity
    };
  });

  // External value changes (or our own commit) move the knob, ≈32 ms after touch-up (MO §1).
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      render();
      return;
    }
    if (drag.current.active) return;
    const t = setTimeout(() => x.set(on ? G.centreOn : G.centreOff), 32);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on]);

  const commit = (next: boolean) => {
    if (next !== onRef.current) {
      playHaptic('switchToggle'); // HF §4 UISwitch: impact light, ≈2 ms before valueChanged
      setOn(next);
    } else x.set(next ? G.centreOn : G.centreOff);
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el || disabled) return;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      lift.lift(LIFT_VELOCITY);
      drag.current = { active: false, offset: 0 };
      ctx.gestures.track(e, {
        decide: ({ dx, dy }) => {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return 'fail';
          return Math.abs(dx) > 4 ? 'claim' : 'wait';
        },
        onBegin: () => {
          drag.current.active = true;
        },
        onMove: ({ dx }) => {
          const rtl = getComputedStyle(el).direction === 'rtl';
          x.set(switchKnobCentre(onRef.current, dx, rtl), { params: LENS_TRACKING });
        },
        onEnd: (_s, cancelled) => {
          drag.current.active = false;
          lift.unlift();
          if (cancelled) x.set(onRef.current ? G.centreOn : G.centreOff);
          else commit(switchValueOnRelease(onRef.current, true, x.target));
        },
        onCancel: () => {
          drag.current.active = false;
          lift.unlift();
          x.set(onRef.current ? G.centreOn : G.centreOff);
        },
        onTap: () => lift.unlift(),
      });
    };
    el.addEventListener('pointerdown', onDown);
    return () => el.removeEventListener('pointerdown', onDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, ctx.gestures]);

  const onColor = tint ?? cssVar('switchTrackOn');
  return (
    <button
      ref={rootRef}
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={className}
      onClick={() => commit(!onRef.current)}
      style={{
        position: 'relative',
        display: 'inline-block',
        verticalAlign: 'middle',
        flex: 'none',
        width: G.width,
        height: G.height,
        padding: 0,
        border: 'none',
        borderRadius: G.height / 2,
        background: cssVar('switchTrackOff'),
        opacity: disabled ? G.disabledAlpha : 1,
        cursor: disabled ? 'default' : 'pointer',
        touchAction: 'pan-y',
        // Round (not squircle) so the on-fill span covers the off-track exactly at the corners.
        ...style,
      }}
      {...aria}
    >
      <span
        ref={fillRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: G.height / 2,
          background: onColor,
          opacity: on ? 1 : 0,
          transition: `background-color ${G.trackColorDuration}s ease`, // MO §1 colour crossfade 0.18 s
          pointerEvents: 'none',
        }}
      />
      <span
        ref={knobRef}
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: G.knobW,
          height: G.knobH,
          borderRadius: 999,
          // Dark: the extracted model colour is #EBEBF5@0.30, but the iOS 27 reference render is opaque white (size audit).
          background: ctx.appearance === 'dark' ? '#FFFFFF' : cssVar('switchThumb'),
          boxShadow: '0 3px 8px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)', // TODO(unknown): thumb shadow not extracted
          transform: `translate(${(on ? G.centreOn : G.centreOff) - G.knobW / 2}px, ${G.centreY - G.knobH / 2}px)`,
          pointerEvents: 'none',
        }}
      />
    </button>
  );
}
