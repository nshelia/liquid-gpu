/**
 * `ColorWell` (UIColorWell) and `ColorPicker` (SwiftUI ColorPicker: a label row with a trailing well).
 *
 * CT = components/controls.md §9, SC = deep/swiftui-components/spec.md §3.
 * - Well 28×28: the rainbow ring (conic, yellow #E3E23A at the top, green #3BE785 on the left, ≈3 pt thick), a 22 pt
 *   white circle (r 11), and an 18×18 swatch (r 9) in the selected colour (CT §9; SC §3 "ring 22 r 11 plus swatch
 *   18 r 9"). TODO(unknown): the remaining conic stops between yellow and green; a hue wheel through orange, red,
 *   magenta, blue and cyan is used.
 * - A press presents the system colour picker (CT §9), which is remote UI. Here: a compact Popover (menus/Toast.tsx,
 *   text_overlays §10.4) with a grid of the system colours for the current appearance plus a native
 *   `<input type="color">` for a custom colour. TODO(unknown): grid swatch size/spacing; 30 pt circles, 10 pt gap.
 * - ColorPicker label row height 28 (SC §3).
 */
import { useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { colors } from '@liquid-gpu/core';
import { cssVar, useLiquid } from '../root';
import { useControllable } from '../controls/internal';
import { Popover } from '../menus/Toast';
import { hexEquals, parseHex, toInputColor } from './logic';

/** System colour tokens offered in the grid (core tokens, resolved per appearance). */
export const SYSTEM_COLOR_TOKENS = [
  'systemRed',
  'systemOrange',
  'systemYellow',
  'systemGreen',
  'systemMint',
  'systemTeal',
  'systemCyan',
  'systemBlue',
  'systemIndigo',
  'systemPurple',
  'systemPink',
  'systemBrown',
  'systemGray',
] as const;

export interface ColorWellProps {
  /** "#RRGGBB". */
  value?: string;
  defaultValue?: string;
  onChange?: (hex: string) => void;
  disabled?: boolean;
  /** Extra hex colours appended to the grid. */
  swatches?: string[];
  /** Hide the custom (native picker) cell. */
  hideCustom?: boolean;
  'aria-label'?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

const WELL = 28; // CT §9
const RING_INNER = 22; // CT §9 white circle r 11
const SWATCH = 18; // CT §9 swatch r 9
// TODO(unknown) intermediate stops; yellow top and green left are CT §9.
const RING = 'conic-gradient(from 0deg, #E3E23A, #FF9F2E 50deg, #FF3B3B 100deg, #E040E0 150deg, #4A5BFF 200deg, #2FD3F0 235deg, #3BE785 270deg, #E3E23A 360deg)';
const GRID_SWATCH = 30; // TODO(unknown)
const GRID_GAP = 10; // TODO(unknown)

export function ColorWell({ value, defaultValue = '#0088FF', onChange, disabled, swatches, hideCustom, className, style, ...aria }: ColorWellProps) {
  const ctx = useLiquid();
  const [v, setV] = useControllable(value, defaultValue, onChange);
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement | null>(null);
  const customId = useId();
  const hex = parseHex(v) ?? '#000000';
  const palette = colors[ctx.appearance];
  const grid = [...SYSTEM_COLOR_TOKENS.map((t) => parseHex(palette[t]!)!), '#000000', '#FFFFFF', ...(swatches ?? []).map((s) => parseHex(s)).filter((s): s is string => !!s)];
  const pick = (c: string) => {
    setV(c);
    setOpen(false);
  };
  return (
    <>
      <button
        ref={anchor}
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={aria['aria-label'] ?? `Colour ${hex}`}
        id={aria.id}
        onClick={() => setOpen(true)}
        className={className}
        style={{
          position: 'relative',
          width: WELL,
          height: WELL,
          flex: 'none',
          padding: 0,
          border: 'none',
          borderRadius: '50%',
          background: RING,
          cursor: disabled ? 'default' : 'pointer',
          opacity: disabled ? 0.5 : 1, // TODO(unknown) disabled appearance
          ...style,
        }}
      >
        <span style={{ position: 'absolute', inset: (WELL - RING_INNER) / 2, borderRadius: '50%', background: '#FFFFFF' }} />
        <span style={{ position: 'absolute', inset: (WELL - SWATCH) / 2, borderRadius: '50%', background: hex }} />
      </button>
      <Popover isPresented={open} anchor={anchor} onDismiss={() => setOpen(false)} width={6 * GRID_SWATCH + 5 * GRID_GAP + 32} aria-label="Colours">
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(6, ${GRID_SWATCH}px)`, gap: GRID_GAP, padding: 16 }}>
          {grid.map((c, i) => {
            const sel = hexEquals(c, hex);
            return (
              <button
                key={`${c}-${i}`}
                type="button"
                aria-label={i < SYSTEM_COLOR_TOKENS.length ? SYSTEM_COLOR_TOKENS[i] : c}
                aria-pressed={sel}
                onClick={() => pick(c)}
                style={{
                  width: GRID_SWATCH,
                  height: GRID_SWATCH,
                  padding: 0,
                  borderRadius: '50%',
                  border: 'none',
                  background: c,
                  cursor: 'pointer',
                  // selected: a label-colour ring outside a background-colour gap (TODO(unknown))
                  boxShadow: sel
                    ? `0 0 0 2px ${cssVar('systemBackground')}, 0 0 0 4px ${cssVar('label')}`
                    : `inset 0 0 0 calc(1px / var(--lq-dpr, 1)) ${cssVar('separator')}`,
                }}
              />
            );
          })}
          {!hideCustom && (
            <label
              htmlFor={customId}
              aria-label="Custom colour"
              style={{ position: 'relative', width: GRID_SWATCH, height: GRID_SWATCH, borderRadius: '50%', background: RING, cursor: 'pointer', overflow: 'hidden' }}
            >
              <input
                id={customId}
                type="color"
                value={toInputColor(hex)}
                onChange={(e) => setV(parseHex(e.target.value) ?? hex)}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }}
              />
            </label>
          )}
        </div>
      </Popover>
    </>
  );
}

export interface ColorPickerProps extends ColorWellProps {
  /** Row title. */
  label?: ReactNode;
}

/** SwiftUI `ColorPicker(title, selection:)`: title leading, well trailing, 28 pt row (SC §3). */
export function ColorPicker({ label, style, className, ...well }: ColorPickerProps) {
  return (
    <div className={className ? `lq-body ${className}` : 'lq-body'} style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: WELL, color: cssVar('label'), ...style }}>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      <ColorWell aria-label={typeof label === 'string' ? label : undefined} {...well} />
    </div>
  );
}
