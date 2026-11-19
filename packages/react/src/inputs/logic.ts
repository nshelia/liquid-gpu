/**
 * Pure logic for the inputs folder (no React, no DOM): one-time-code distribution, rating rounding, hex parsing,
 * text-editor auto-grow, toggle colours and toggle-group selection.
 *
 * Sources (under ~/Documents/uikit-internals/):
 *   CT = components/controls.md
 *   TO = components/text_overlays.md
 *   SC = deep/swiftui-components/spec.md
 */
import { buttonColors, withAlpha, type ButtonVariant } from '../controls/logic';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

// ---------------------------------------------------------------------------------------------- One-time code

/** Keep only the characters a code cell accepts (`numeric`: digits; otherwise letters and digits). */
export function sanitizeCode(input: string, numeric = true): string {
  return numeric ? input.replace(/\D+/g, '') : input.replace(/[^0-9a-z]+/gi, '').toUpperCase();
}

/**
 * Typing, pasting or autofilling `input` into cell `index` of a contiguous `code` of `length` cells.
 * - A string that fills every cell (paste / `one-time-code` autofill) replaces the whole code from cell 0.
 * - Otherwise the characters overwrite cells from `index` on (index is clamped to the first empty cell, so the code
 *   never has holes) and the rest of the code is kept.
 * Returns the new code and the cell to focus next (the cell after the last written one, capped at the last cell).
 */
export function distributeCode(code: string, index: number, input: string, length: number, numeric = true): { code: string; focus: number } {
  const chars = sanitizeCode(input, numeric);
  const cur = code.slice(0, length);
  if (chars.length === 0) return { code: cur, focus: clamp(index, 0, Math.max(0, length - 1)) };
  if (chars.length >= length) {
    const next = chars.slice(0, length);
    return { code: next, focus: length - 1 };
  }
  const at = clamp(index, 0, Math.min(cur.length, length - 1));
  const next = (cur.slice(0, at) + chars + cur.slice(at + chars.length)).slice(0, length);
  return { code: next, focus: Math.min(at + chars.length, length - 1) };
}

/** Backspace in cell `index`: clears that cell when filled, otherwise the previous one. Returns code and focus. */
export function backspaceCode(code: string, index: number): { code: string; focus: number } {
  if (index < code.length) return { code: code.slice(0, index) + code.slice(index + 1), focus: index };
  const at = Math.max(0, Math.min(index, code.length) - 1);
  return { code: code.slice(0, at) + code.slice(at + 1), focus: at };
}

// ---------------------------------------------------------------------------------------------- Rating

/** Round a raw 0…max rating to whole (`step` 1) or half (`step` 0.5) stars, clamped to [0, max]. */
export function roundRating(raw: number, max: number, step: 0.5 | 1 = 1): number {
  if (!Number.isFinite(raw)) return 0;
  const v = Math.round(clamp(raw, 0, max) / step) * step;
  return clamp(v, 0, max);
}

/**
 * Value under a pointer at `x` along a row of `max` stars of `width` total: the star under the finger is filled
 * (ceil), or half-filled when `step` is 0.5 and the pointer is in its leading half. Below 0 gives 0.
 */
export function ratingAtPointer(x: number, width: number, max: number, step: 0.5 | 1 = 1, rtl = false): number {
  if (width <= 0) return 0;
  const p = clamp((rtl ? width - x : x) / width, 0, 1) * max;
  if (p <= 0) return 0;
  return clamp(Math.ceil(p / step) * step, step, max);
}

/** Fill of star `i` (0-based) at `value`: 0, 0.5 or 1. */
export function starFill(i: number, value: number): 0 | 0.5 | 1 {
  const d = value - i;
  return d >= 1 ? 1 : d >= 0.5 ? 0.5 : 0;
}

/** Keyboard step (arrow keys) on a rating. */
export function stepRating(value: number, dir: 1 | -1, max: number, step: 0.5 | 1 = 1): number {
  return roundRating(value + dir * step, max, step);
}

// ---------------------------------------------------------------------------------------------- Colour hex

/**
 * Parse "#RGB", "#RRGGBB", "#RRGGBBAA", the same without "#", or "rgb()/rgba()" into "#RRGGBB" (upper case).
 * Alpha is dropped (the well has no opacity support). Returns null for anything else.
 */
export function parseHex(input: string): string | null {
  const s = input.trim();
  const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (rgb) {
    const parts = rgb[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some((p) => !Number.isFinite(p))) return null;
    return '#' + parts.slice(0, 3).map((p) => Math.round(clamp(p, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  const hex = s.startsWith('#') ? s.slice(1) : s;
  if (!/^[0-9a-f]+$/i.test(hex)) return null;
  if (hex.length === 3 || hex.length === 4) return ('#' + [...hex.slice(0, 3)].map((c) => c + c).join('')).toUpperCase();
  if (hex.length === 6 || hex.length === 8) return ('#' + hex.slice(0, 6)).toUpperCase();
  return null;
}

/** Case- and format-insensitive colour equality (both parsed with `parseHex`). */
export function hexEquals(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const pa = parseHex(a);
  return pa !== null && pa === parseHex(b);
}

/** Lower-case "#rrggbb" for `<input type="color">` (which only accepts that form). */
export function toInputColor(hex: string): string {
  return (parseHex(hex) ?? '#000000').toLowerCase();
}

// ---------------------------------------------------------------------------------------------- Text editor

/**
 * Auto-grow height (CSS px) of a text editor: the content height clamped between `minLines` and `maxLines` lines
 * plus the vertical insets. `maxLines` undefined: grows without bound.
 */
export function editorHeight(contentHeight: number, lineHeight: number, paddingV: number, minLines = 1, maxLines?: number): number {
  const min = Math.max(1, minLines) * lineHeight + paddingV;
  const max = maxLines === undefined ? Infinity : Math.max(minLines, maxLines) * lineHeight + paddingV;
  return clamp(Math.ceil(contentHeight), min, max);
}

/** Character count shown under an editor: "n" or "n/max". */
export function formatCount(length: number, maxLength?: number): string {
  return maxLength === undefined ? String(length) : `${length}/${maxLength}`;
}

// ---------------------------------------------------------------------------------------------- Toggle

export type ToggleVariant = 'plain' | 'gray' | 'tinted' | 'glass';

/**
 * CT §1.5 "selected" state colours (button `isSelected`), the basis of the pressed-state Toggle:
 * - plain / gray → fill tint@0.18 with tint foreground;
 * - tinted → solid tint with white foreground;
 * - glass → solid tint with white foreground (rendered here as tint-tinted glass);
 * - selected + highlighted: the selected colours × 0.75 (tinted-selected fill 0.18 → 0.117, i.e. the §1.5
 *   highlighted ×0.65 rule on alpha fills).
 * Off: the normal `buttonColors`. Disabled: the normal disabled colours.
 * TODO(unknown): dark-appearance selected fill alpha was only extracted for light; the tinted 0.25 dark alpha is used.
 */
export function toggleColors(
  variant: ToggleVariant,
  appearance: 'light' | 'dark',
  tint: string,
  state: { isOn: boolean; highlighted?: boolean; disabled?: boolean },
): { fill: string | null; foreground: string } {
  if (!state.isOn || state.disabled) return buttonColors(variant as ButtonVariant, appearance, tint, state);
  const h = state.highlighted ?? false;
  if (variant === 'plain' || variant === 'gray') {
    const a = appearance === 'dark' ? 0.25 : 0.18;
    return { fill: withAlpha(tint, a * (h ? 0.65 : 1)), foreground: h ? withAlpha(tint, 0.75) : tint };
  }
  return { fill: h ? withAlpha(tint, 0.75) : tint, foreground: '#FFFFFF' };
}

/** Next selection of a toggle group after pressing `value`. */
export function toggleGroupNext(type: 'single' | 'multiple', current: readonly string[], value: string, allowEmpty = true): string[] {
  const on = current.includes(value);
  if (type === 'single') return on ? (allowEmpty ? [] : [value]) : [value];
  return on ? current.filter((v) => v !== value) : [...current, value];
}
