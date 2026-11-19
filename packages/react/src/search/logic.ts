/**
 * `.searchable` geometry and motion (pure). Measured on iOS 27 (UIKit27-B, SwiftUI SearchLab probe):
 * SL = uikit-internals/deep/demo-audit/search (raw/*.txt per-frame presentation dumps, tools/fit.py fits),
 * BR = components/bars.md §1.10–1.11, §4.
 */
import type { SpringParams } from '@liquid-gpu/core';
import type { Rect } from '@liquid-gpu/gpu';

/** Bottom search field (BR §1.10, SL default rest): capsule 384 × 48 at (28, H − 76), r 24. */
export const SEARCH = {
  inset: 28,
  bottom: 28,
  height: 48,
  /** Gap between the active field and the close circle (SL: field 324 wide, circle at x 364). */
  gap: 12,
  /** Inner text field 28 tall, 10 below the capsule top (SL `UISearchBarTextField` y 890). */
  textHeight: 28,
  /** magnifyingglass 20.67 × 19.33 at x + 12; text / placeholder at x + 40.67 (SL `UIImageView` x 40, label x 68.67). */
  glyphX: 12,
  glyph: { width: 20.67, height: 19.33 },
  textX: 40.67,
  /** Clear button `xmark.circle.fill` 20 × 20, right edge 13.33 inside the field (SL x 318.67 in a 324 field). */
  clear: 20,
  clearRight: 13.33,
  /** Close (`xmark`) glyph 22.67 × 21.33 centred in the 48 circle (SL `UIImageView` 376.67, 893.67). */
  xmark: { width: 22.67, height: 21.33 },
  /** Close circle appears from / leaves to 1.2 × (57.6 pt) at alpha 0 (SL, BR §1.11). */
  closeFromScale: 1.2,
  /** `.minimize`: 48 circle at the bottom centre; its magnifyingglass is 25.67 × 25.33 (SL minimize rest). */
  miniGlyph: { width: 25.67, height: 25.33 },
  /** The minimized glyph shrinks to 0.2 × and drifts to x ≈ 162 while the field grows (SL minimize activate). */
  miniGlyphEndScale: 0.2,
  /** Glass height bulge during the circle ↔ field morph: +9.3 pt at mid-travel (SL: h 48 → 57.3 → 48). */
  morphBulge: 9.3,
} as const;

/** Scope bar (SL scopes): segmented glass (20, safeTop, W − 40, 36); lens inset 4 (125 × 28, r 14); labels 15 pt. */
export const SCOPE = { margin: 20, height: 36, inset: 4, fontSize: 15 } as const;

export const SEARCH_SPRINGS = {
  /** Field width 384 ↔ 324 and the close circle (scale 1.2 ↔ 1, alpha 0 ↔ 1): SL fit ζ 0.936 / 0.240 s, both ways. */
  field: { dampingRatio: 0.936, response: 0.24 },
  /** `.minimize` circle ↔ field morph: SL fit x ζ 1.0 / 0.21, width 0.94 / 0.23, contents 0.98 / 0.226. */
  morph: { dampingRatio: 0.97, response: 0.227 },
  /** Its x leads the width on presentation (SL fits: x ζ 1.0 / 0.212, width ζ 0.94 / 0.228). */
  morphX: { dampingRatio: 1, response: 0.212 },
  morphWidth: { dampingRatio: 0.94, response: 0.228 },
  /** `.minimize` field → circle on dismiss: SL fit x / width ζ 0.89 / 0.265, close + contents 0.90 / 0.253. */
  morphOut: { dampingRatio: 0.895, response: 0.26 },
  /** Navigation bar hide / show, content shift, scope bar: SL fit ζ 0.80 / 0.335 (`_UITopSearchTransitionSettings` 0.8 / 0.34). */
  bar: { dampingRatio: 0.8, response: 0.335 },
  /** Fast fades (bar items, title, scope bar on dismiss): SL fit ζ 0.92 / 0.15. */
  fade: { dampingRatio: 0.92, response: 0.15 },
} as const satisfies Record<string, SpringParams>;

/** SL: the field starts ≈ 80 ms after the navigation bar on activation; the scope bar pops in ≈ 0.5 s after. */
export const FIELD_DELAY_MS = 80;
export const SCOPE_APPEAR_MS = 500;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface SearchBarLayout {
  /** Field at rest (not presented). */
  rest: Rect;
  /** Field while presented (narrowed for the close circle). */
  active: Rect;
  /** Close circle while presented. */
  close: Rect;
  /** `.minimize` circle. */
  mini: Rect;
}

export function searchBarLayout(width: number, height: number): SearchBarLayout {
  const y = height - SEARCH.bottom - SEARCH.height;
  const full = width - 2 * SEARCH.inset;
  const h = SEARCH.height;
  return {
    rest: { x: SEARCH.inset, y, width: full, height: h },
    active: { x: SEARCH.inset, y, width: full - h - SEARCH.gap, height: h },
    close: { x: width - SEARCH.inset - h, y, width: h, height: h },
    mini: { x: (width - h) / 2, y, width: h, height: h },
  };
}

/**
 * Field glass rect for presentation progress `p` (0 rest, 1 presented). With `minimize` the rest shape is the
 * circle and the morph bulges the height (centred) by `morphBulge·4p(1−p)`. `pw` drives the width (default `p`).
 */
export function fieldRect(L: SearchBarLayout, p: number, minimize: boolean, pw = p): Rect {
  const from = minimize ? L.mini : L.rest;
  const x = lerp(from.x, L.active.x, p);
  const w = lerp(from.width, L.active.width, pw);
  const q = Math.min(1, Math.max(0, p));
  const bulge = minimize ? SEARCH.morphBulge * 4 * q * (1 - q) : 0;
  return { x, y: from.y - bulge / 2, width: Math.max(from.height, w), height: from.height + bulge };
}

/** Close circle rect and alpha for its progress `c` (0 hidden at 1.2 ×, 1 shown at 1 ×). */
export function closeRect(L: SearchBarLayout, c: number): { rect: Rect; alpha: number } {
  const s = lerp(SEARCH.closeFromScale, 1, c);
  const d = L.close.width * s;
  const cx = L.close.x + L.close.width / 2;
  const cy = L.close.y + L.close.height / 2;
  return { rect: { x: cx - d / 2, y: cy - d / 2, width: d, height: d }, alpha: Math.min(1, Math.max(0, c)) };
}

/** Scope segment index under local x. */
export function scopeIndexAt(x: number, width: number, count: number): number {
  return Math.min(count - 1, Math.max(0, Math.floor((x / width) * count)));
}

/** Case- and diacritic-insensitive `localizedCaseInsensitiveContains`. */
export function matchesSearch(value: string, query: string): boolean {
  const q = query.trim();
  if (!q) return true;
  const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase();
  return norm(value).includes(norm(q));
}
