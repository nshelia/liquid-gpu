/**
 * Pure helpers for the media components (Image, Avatar, Badge, Tag, Skeleton). Sources (under ~/Documents/uikit-internals/):
 *   BR = components/bars.md (§3.3 tab bar badge), CT = components/controls.md (§1 tinted button colours),
 *   SC = deep/swiftui-components/spec.md (control sizes, colours), RP = reference-page.html (Corners, Semantic colors).
 */

// ---------------------------------------------------------------------------
// Badge (BR §3.3, `_UIBarBadgeView`)
// ---------------------------------------------------------------------------

export const BADGE = {
  height: 18.33, // BR §3.3 height 18.33
  radius: 9.17, // BR §3.3 r 9.17 (capsule)
  minWidth: 18.33, // BR §3.3 width of "3" = 18.33
  paddingX: 4, // BR §3.3 4 pt horizontal padding
  fontSize: 12, // BR §3.3 `.SFUI-Medium` 12
  fontWeight: 510, // core tokens fontWeights.medium
  dot: 18, // BR §3.3 empty string → an 18 × 18 circle
} as const;

/** Default overflow cap: "99+" is the extraction's widest sample (BR §3.3, 31.67 wide). */
export const BADGE_MAX = 99;

/**
 * Badge text for a value. Numbers above `max` become "`max`+", non-positive counts hide the badge (null) unless
 * `showZero`. Strings pass through (an empty string is the dot badge, BR §3.3). Non-finite numbers hide it.
 */
export function formatBadge(value: string | number | null | undefined, max = BADGE_MAX, showZero = false): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    // A numeric string behaves like a number (generated UI often stringifies counts).
    if (/^-?\d+$/.test(t)) return formatBadge(Number(t), max, showZero);
    return value;
  }
  if (!Number.isFinite(value)) return null;
  const n = Math.floor(value);
  if (n <= 0) return showZero && n === 0 ? '0' : null;
  const cap = Math.max(1, Math.floor(max));
  return n > cap ? `${cap}+` : String(n);
}

// ---------------------------------------------------------------------------
// Avatar monogram (iOS Contacts)
// ---------------------------------------------------------------------------

function graphemes(s: string): string[] {
  const Seg = (Intl as { Segmenter?: typeof Intl.Segmenter }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment);
  return Array.from(s);
}

const LETTER = /^[\p{L}\p{N}]/u;
// Mkhedruli has Mtavruli capitals since Unicode 11, but Georgian text is not case-mapped in names: keep it as typed.
const NO_UPPER = /^\p{Script=Georgian}/u;

/**
 * Contacts-style monogram: the first grapheme of the first and last name words (1–2 letters). Words that do not
 * start with a letter or digit (emoji, punctuation, "(work)") are skipped, so "🎉" alone gives "" (show the person
 * glyph). Combining marks stay with their base letter. Latin / Cyrillic / Greek are upper-cased; Georgian is not.
 */
export function monogram(name: string | null | undefined, maxLetters: 1 | 2 = 2): string {
  if (!name) return '';
  const words = name
    .normalize('NFC')
    .split(/[\s 　]+/u)
    .map((w) => w.replace(/^[^\p{L}\p{N}]+/u, ''))
    .filter((w) => w && LETTER.test(w));
  if (!words.length) return '';
  const first = graphemes(words[0]!)[0]!;
  const picks = [first];
  if (maxLetters === 2 && words.length > 1) picks.push(graphemes(words[words.length - 1]!)[0]!);
  return picks.map((g) => (NO_UPPER.test(g) ? g : g.toLocaleUpperCase())).join('');
}

export type AvatarSize = 'small' | 'medium' | 'large' | number;

/** TODO(unknown): Contacts avatar diameters were not extracted; small = list row icon slot, large = contact card. */
export const AVATAR_SIZES = { small: 32, medium: 40, large: 80 } as const;

export function avatarDiameter(size: AvatarSize | undefined): number {
  if (typeof size === 'number' && Number.isFinite(size) && size > 0) return size;
  return AVATAR_SIZES[(typeof size === 'string' && size in AVATAR_SIZES ? size : 'medium') as keyof typeof AVATAR_SIZES];
}

/** TODO(unknown): monogram font size / weight not extracted; ≈ 0.42 × diameter, semibold (wght 590, core fontWeights). */
export function monogramFontSize(diameter: number, letters: number): number {
  return +(diameter * (letters > 1 ? 0.4 : 0.46)).toFixed(2);
}

/** AvatarGroup: visible avatars and the "+N" overflow count. */
export function groupOverflow(count: number, max: number | undefined): { visible: number; overflow: number } {
  const m = max === undefined || !Number.isFinite(max) || max <= 0 ? count : Math.floor(max);
  if (count <= m) return { visible: count, overflow: 0 };
  // The "+N" chip takes one slot.
  const visible = Math.max(1, m - 1);
  return { visible, overflow: count - visible };
}

// ---------------------------------------------------------------------------
// Colours / corners
// ---------------------------------------------------------------------------

export type SemanticColor =
  | 'red' | 'orange' | 'yellow' | 'green' | 'mint' | 'teal' | 'cyan' | 'blue' | 'indigo' | 'purple' | 'pink' | 'brown' | 'gray' | 'tint';

/** SC "Named colours" Color.red … .brown → core tint tokens (RP `TINT`). */
export function colorToken(c: SemanticColor | undefined, fallback: SemanticColor = 'tint'): string {
  const k = c ?? fallback;
  if (k === 'tint') return 'tint';
  return 'system' + k[0]!.toUpperCase() + k.slice(1);
}

export type CornerRadius = number | 'none' | 'small' | 'medium' | 'large' | 'capsule';

/**
 * Corner presets (continuous; RP Corners). small 8 = GroupBox r 8 (basics/GroupBox.tsx), medium 14 = buttonSmall
 * (core radii, CT §1.4), large 26 = insetGrouped (core radii, LS §1.1). Capsule = h/2 (no squircle, as Button.tsx).
 */
export const CORNER_PRESETS = { none: 0, small: 8, medium: 14, large: 26 } as const;

/** CSS border-radius and whether to use the squircle corner shape. */
export function cornerStyle(r: CornerRadius | undefined): { radius: string; squircle: boolean } {
  if (r === undefined || r === 'none') return { radius: '0', squircle: false };
  if (r === 'capsule') return { radius: '9999px', squircle: false };
  const px = typeof r === 'number' ? Math.max(0, r) : CORNER_PRESETS[r];
  return { radius: `${px}px`, squircle: px > 0 };
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

/** Width of each skeleton line: full except the last of several, which is shorter (TODO(unknown): 60 %). */
export function skeletonLineWidths(lines: number, lastWidth = 0.6): number[] {
  const n = Math.max(1, Math.floor(lines));
  return Array.from({ length: n }, (_, i) => (n > 1 && i === n - 1 ? lastWidth : 1));
}
