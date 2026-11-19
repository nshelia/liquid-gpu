/**
 * Icon registry: string name → glyph. Names follow SF Symbols conventions (`heart`, `heart.fill`, `chevron.left`) so a
 * generative-UI catalog can address icons by string. Host apps add or override entries with `registerIcons`.
 */
import { colors } from '@liquid-gpu/core';
import { cssVar } from '../root/theme';
import { builtinAliases, builtinGlyphs } from './glyphs';
import type { IconEntry, IconWeight } from './types';

/** Name shown for unknown icons. */
export const PLACEHOLDER_ICON = 'questionmark.square';

/** Live registry (mutated by `registerIcons`). Aliases are registered as the same entry object. */
export const iconRegistry: Record<string, IconEntry> = {};

/** Every registered name, sorted. Live array: `registerIcons` updates it in place. */
export const iconNames: string[] = [];

function put(name: string, entry: IconEntry): void {
  if (!(name in iconRegistry)) {
    // sorted insert
    let lo = 0;
    let hi = iconNames.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (iconNames[mid]! < name) lo = mid + 1;
      else hi = mid;
    }
    iconNames.splice(lo, 0, name);
  }
  iconRegistry[name] = entry;
}

for (const [name, def] of Object.entries(builtinGlyphs)) put(name, def);
for (const [alias, target] of Object.entries(builtinAliases)) {
  const def = builtinGlyphs[target];
  if (def) put(alias, def);
}

/** Add or override icons. Keys are normalised like lookups (trimmed, lower-cased). */
export function registerIcons(map: Record<string, IconEntry>): void {
  for (const [name, entry] of Object.entries(map)) put(normalizeIconName(name), entry);
}

/** Trim and lower-case; SF names are all lower-case apart from none we ship. */
export function normalizeIconName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Find the registered name for `name`, or `undefined`. Tries, in order: the exact name; `-`, `_` and spaces as `.`
 * (`arrow-left` → `arrow.left`); then a missing `.fill` falls back to the outline glyph.
 */
export function findIconName(name: string): string | undefined {
  const n = normalizeIconName(name);
  if (!n) return undefined;
  const candidates = [n, n.replace(/[-_\s]+/g, '.')];
  for (const cand of candidates) {
    if (cand in iconRegistry) return cand;
    if (cand.endsWith('.fill')) {
      const outline = cand.slice(0, -5);
      if (outline in iconRegistry) return outline;
    }
  }
  return undefined;
}

/** True when `name` resolves to a registered glyph (including the `.fill` → outline fallback). */
export function hasIcon(name: string): boolean {
  return findIconName(name) !== undefined;
}

const warned = new Set<string>();

function isDev(): boolean {
  const g = globalThis as { process?: { env?: Record<string, string | undefined> } };
  return g.process?.env?.NODE_ENV !== 'production';
}

/**
 * Registry entry for `name`. Unknown names return the `questionmark.square` placeholder and warn once per name in
 * development.
 */
export function getIconEntry(name: string): { name: string; entry: IconEntry; missing: boolean } {
  const found = findIconName(name);
  if (found) return { name: found, entry: iconRegistry[found]!, missing: false };
  if (isDev() && !warned.has(name)) {
    warned.add(name);
    console.warn(`[liquid-gpu] Unknown icon "${name}"; rendering ${PLACEHOLDER_ICON}. See iconNames for the list.`);
  }
  return { name: PLACEHOLDER_ICON, entry: iconRegistry[PLACEHOLDER_ICON]!, missing: true };
}

/** Test hook: forget which unknown names already warned. */
export function resetIconWarnings(): void {
  warned.clear();
}

// ---- weight -------------------------------------------------------------------------------------------------------

/** Stroke multiplier relative to `regular`. TODO(unknown): SF weight stroke ratios are not in the extraction; eyeballed. */
export const ICON_WEIGHT_SCALE: Record<IconWeight, number> = {
  ultralight: 0.45,
  thin: 0.6,
  light: 0.8,
  regular: 1,
  medium: 1.12,
  semibold: 1.25,
  bold: 1.4,
  heavy: 1.55,
  black: 1.7,
};

/** Stroke width at regular weight in a 24-unit box. */
export const DEFAULT_ICON_STROKE = 1.9;

export function iconStrokeWidth(weight: IconWeight = 'regular', base = DEFAULT_ICON_STROKE): number {
  return +(base * (ICON_WEIGHT_SCALE[weight] ?? 1)).toFixed(3);
}

// ---- colour -------------------------------------------------------------------------------------------------------

/**
 * `color` prop → CSS colour. A theme token (`systemBlue`, `secondaryLabel`, `tint`) becomes `var(--lq-…)`; a short
 * tint name (`blue`, `red`, `gray2`) maps to `system<Name>`; `accent` → `tint`; anything else is passed through as CSS.
 */
export function resolveIconColor(color: string | undefined): string | undefined {
  if (!color) return undefined;
  const tokens = colors.light;
  if (color in tokens) return cssVar(color);
  if (color === 'accent' || color === 'accentColor') return cssVar('tint');
  const sys = 'system' + color.charAt(0).toUpperCase() + color.slice(1);
  if (/^[a-z][a-z0-9]*$/i.test(color) && sys in tokens) return cssVar(sys);
  return color;
}
