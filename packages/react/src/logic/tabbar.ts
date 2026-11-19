// Portions adapted from robinWongM/liquid-glass (Apache-2.0): tabBarLayout.
/**
 * Tab bar geometry (pure). BR = components/bars.md §3.2/§3.4, LG = findings/liquid-glass.md §10,
 * MO = deep/motion/findings.md §3, TR = findings/transitions.md §5,
 * TX = deep/demo-audit/tabbar-extras (iOS 27.0 SwiftUI TabView: search / prominent roles, bottom accessory).
 */
import { metrics } from '@liquid-gpu/core';
import type { Rect } from '@liquid-gpu/gpu';

export interface TabBarLayout {
  platter: Rect;
  /** Button frames relative to the platter. */
  buttons: Rect[];
  /** Minimized platter (MO §3: 48 × 48 at x 28, bottom 28 above the screen edge). */
  minimized: Rect;
  /** Detached circle of a search / prominent tab (TX: 62 × 62 at (357, 873), trailing inset 21). */
  aux?: Rect;
  /** `bottomAccessory` (TX: 398 × 48 at (21, 817), 8 above the platter) and its minimized frame beside the button. */
  accessory?: { full: Rect; minimized: Rect };
  /** Search tab selected (TX): tab button, field and close button, all 48 tall at the minimized row. */
  search: { button: Rect; field: Rect; close: Rect };
  /** Anchor of the minimize squeeze (TX: group centre + 3.5, i.e. y 918 alone, 890 with an accessory). */
  squeezeAnchor: { x: number; y: number };
}

export interface TabBarLayoutOptions {
  /** A search or prominent tab sits in its own circle (`labels` lists only the platter tabs). */
  aux?: boolean;
  accessory?: boolean;
}

/**
 * Platter and buttons from the label widths (Medium 10, pt), after robinWongM/liquid-glass `tabBarLayout`:
 * content inset 24 (15 for n > 4), spacing 32 for n ≤ 3, buttons at least 54 wide and grown by inset − 4 on each
 * side, width min(available, ideal). n > 3 and an accessory fill the available width. With an aux circle the
 * platter keeps its ideal width (TX: 188 for two tabs, where the reference fills).
 * Three short labels give the measured 274 platter with 94-wide buttons at an 86 pitch (BR §3.2).
 */
export function tabBarLayout(labels: readonly number[], screenW: number, screenH: number, opts: TabBarLayoutOptions = {}): TabBarLayout {
  const n = labels.length;
  const outer = metrics.tabPlatterMaxInset; // 21
  const h = metrics.tabPlatterHeight; // 62
  const minimum = metrics.tabButtonHeight; // 54
  const variable = n > 3;
  const fill = !!opts.accessory && !opts.aux;
  let inset = n > 4 ? 15 : 24;
  let spacing = variable ? 0 : 32;
  const natural = labels.map((t) => Math.max(minimum, Math.max(t, 24) + (variable ? 12 : 0)));
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  const ideal = 2 * inset + (n - 1) * spacing + (variable ? sum(natural) : n * Math.max(minimum, ...natural));
  const available = screenW - 2 * outer - (opts.aux ? h + 8 : 0);
  const width = Math.max(8, variable || fill ? available : Math.min(available, ideal));
  let inner = width - 2 * inset;
  let widths = [...natural];
  let equal = !variable;
  let distribute = variable || fill;
  const maximum = Math.min(inner, Math.max(minimum, ...natural));
  let cell = Math.min(maximum, (inner - (n - 1) * (variable ? 2 : spacing)) / n);
  if (variable) {
    const room = n > 1 ? (inner - sum(natural)) / (n - 1) : Infinity;
    if (room < 14) {
      distribute = false;
      inset = Math.min(inset, 14);
      inner = width - 2 * inset;
    } else if (maximum > minimum) {
      distribute = maximum <= (inner - (n - 1) * 2) / n;
      inset = Math.min(inset, 18);
      inner = width - 2 * inset;
    }
    if (distribute && n > 1) cell = Math.max(cell, inner / n - (inset - 4));
    equal = distribute;
  } else if (fill && n > 1) cell = inner / n - (inset - 4);
  if (equal) widths = widths.map(() => cell);
  let total = sum(widths);
  const excess = total - inner + (distribute ? 0 : (n - 1) * spacing);
  if (excess > 0) {
    widths = widths.map((w) => w - excess / n);
    total = sum(widths);
  }
  if (distribute && n > 1) spacing = (inner - total) / (n - 1);
  const grow = inset - 4;
  let bx = inset;
  const buttons = widths.map((w) => {
    const r = { x: bx - grow, y: (h - minimum) / 2, width: w + 2 * grow, height: minimum };
    bx += w + spacing;
    return r;
  });
  const y = screenH - metrics.tabPlatterBottomGap - h; // BR §3.2: platter bottom 21 above the screen edge
  // TX: with an aux circle the platter is leading-aligned at x 21 (188 for 2 tabs), the circle trailing.
  const aux = opts.aux ? { x: screenW - outer - h, y, width: h, height: h } : undefined;
  const x = aux ? outer : Math.round(outer + (available - width) / 2);
  const ms = metrics.tabMinimizedSize;
  const minimized = { x: 28, y: screenH - 28 - ms, width: ms, height: ms };
  const right = screenW - 28;
  // TX `light_accessory_sel0` / minimized: (21, 817, 398, 48); minimized (90, 880, 322, 48), 14 after the button.
  const accessory = opts.accessory
    ? {
        full: { x: outer, y: y - 8 - ms, width: screenW - 2 * outer, height: ms },
        minimized: { x: minimized.x + ms + 14, y: minimized.y, width: right - (minimized.x + ms + 14), height: ms },
      }
    : undefined;
  // TX `light_tabsearch_tap_resigned`: button (28, 880), field (88, 880, 264, 48), close (364, 880); 12 pt gaps.
  const fieldX = minimized.x + ms + 12;
  const search = {
    button: minimized,
    field: { x: fieldX, y: minimized.y, width: right - ms - 12 - fieldX, height: ms },
    close: { x: right - ms, y: minimized.y, width: ms, height: ms },
  };
  const top = accessory ? accessory.full.y : y;
  const squeezeAnchor = { x: screenW / 2, y: (top + screenH) / 2 + 3.5 };
  return { platter: { x, y, width, height: h }, buttons, minimized, aux, accessory, search, squeezeAnchor };
}

/** Scale a rect about a point. */
export function scaleRectAbout(r: Rect, s: number, p: { x: number; y: number }): Rect {
  return { x: p.x + (r.x - p.x) * s, y: p.y + (r.y - p.y) * s, width: r.width * s, height: r.height * s };
}

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    width: a.width + (b.width - a.width) * t,
    height: a.height + (b.height - a.height) * t,
  };
}

/** Scale a rect about its centre. */
export function scaleRect(r: Rect, s: number): Rect {
  const w = r.width * s;
  const h = r.height * s;
  return { x: r.x + (r.width - w) / 2, y: r.y + (r.height - h) / 2, width: w, height: h };
}

/**
 * Minimize-on-scroll squeeze (TR §5 / MO §3): linear from 0 to 0.959 at 60 pt of downward drag, which reproduces
 * the measured 0.992 @ 10 pt and 0.962 @ 48 pt to within 0.006; collapse at ~58 pt.
 */
export const MINIMIZE = { squeezeStart: 0, squeezeEnd: 60, squeezeMin: 0.959, collapseAt: 58, expansionHysteresis: 4 } as const;

export function minimizeSqueeze(downDistance: number): number {
  const t = Math.min(1, Math.max(0, (downDistance - MINIMIZE.squeezeStart) / (MINIMIZE.squeezeEnd - MINIMIZE.squeezeStart)));
  return 1 - (1 - MINIMIZE.squeezeMin) * t;
}

/** TX per-frame fits (tools/fitspring.py over rec/*.jsonl and video/*.mp4). */
export const TABX = {
  /** Search tab selected: platter → button and circle → field (video edge track, rms 0.014). */
  searchMorph: { dampingRatio: 0.98, response: 0.15 },
  /** Close button appears after the morph (video: ~0.15 s after the field starts). */
  closeDelay: 0.15,
  /** Aux circle press: 62 → 78 (+8 per side), overshoot to 79.3 (rec/prominent_press, rms 0.004). */
  auxPress: { dampingRatio: 0.62, response: 0.26 },
  /** Aux circle release: 78 → 62, undershoot to 57.5 (rms 0.007). */
  auxRelease: { dampingRatio: 0.38, response: 0.4 },
  auxPressGrowth: 8,
  /**
   * Pressed aux circle: white over the glass, then the glyph at reduced opacity (shots/*_prominent_pressed):
   * light fill #F6F6FB → #FFFFFF, glyph #0E0D0F → #E6E5E9; dark fill #202020 → #7C7C7C, glyph #F9F9F9 → #B4B4B4.
   */
  auxPressedFill: { light: 1, dark: 0.41 },
  auxPressedGlyph: { light: 0.1, dark: 0.45 },
  /** Accessory collapse: x/width with (0.72, 0.36) (rms 0.002), y with (0.74, 0.43) 35 ms later (rms 0.003). */
  accessoryCollapseX: { dampingRatio: 0.72, response: 0.36 },
  accessoryCollapseY: { dampingRatio: 0.76, response: 0.42 },
  accessoryCollapseYDelay: 0.035,
} as const;
