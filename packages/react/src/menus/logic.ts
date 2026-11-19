/**
 * Pure menu / context-menu logic: list layout, placement, highlight hit-testing, the long-press pre-lift,
 * the preview size rule, the menu morph blob and the `.pop` commit keyframes.
 *
 * Sources (under ~/Documents/uikit-internals/):
 *   TO = components/text_overlays.md        (§10.1 button menu metrics, §10.2 context menu)
 *   MO = deep/motion/findings.md             (§2 morph, blob, list scale on dismiss, platform metrics)
 *   PT = deep/photos-transition/findings.md  (§1 pre-lift, preview size rule, §2 .pop commit)
 *   TR = findings/transitions.md             (§8 context-menu timings)
 */
import { contextMenuLiftScale, gestureThresholds, metrics, radii } from '@liquid-gpu/core';

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ---------------------------------------------------------------------------------------------- list layout

export const menuMetrics = {
  width: metrics.menuWidth, // 250 (TO §10.1, MO §2 defaultMenuWidth)
  maxHeight: metrics.menuMaxHeight, // 520 (MO §2)
  row: metrics.menuRowHeight, // 42 (TO §10.1)
  rowSubtitle: metrics.menuRowHeightSubtitle, // 60
  padding: metrics.menuPadding, // 10 above the first and below the last row
  separator: 1, // TO §10.1 section separator 1 pt
  separatorGap: 10, // TO §10.1 10 pt above and below a separator (section gap 21)
  separatorInset: metrics.menuSeparatorInset, // 24
  radius: radii.menu, // 32 (MO §2 menuCornerRadius)
  containerInset: metrics.menuContainerInset, // 8 (MO §2 minimumContainerInsets)
  previewGap: metrics.contextMenuGap, // 20 (MO §2 / PT §1)
  // TO §10.1 row content, in menu coordinates: leading checkmark column centred at 21, icon box centred at 55,
  // title at 79 when the section has icons and at 43 when it has none; submenu chevron at 214.33.
  checkCentreX: 21,
  iconCentreX: 55,
  titleXWithIcons: 79,
  titleXNoIcons: 43,
  chevronX: 214.333,
  // Photos-style `accessoriesForMenu` row above the first section (measured from deep/photos-transition
  // raw/photos-p2.mp4 @ 60 s, 3x: menu 552.0…902.0, separators at 629 / 734 / 839): 57 tall, three 78-wide columns
  // from x 8 (centres 47 / 125 / 203), glyph centred 18.33 below the row top, label Regular 12 with its baseline 46
  // below the row top. A separator follows.
  accessoryRow: 57,
  accessoryColumn: 78,
  accessoryInset: 8,
  accessoryIconCentreY: 18.333,
  accessoryBaseline: 46,
  blob: 22, // MO §2 present start shape 22×22
  buttonDot: 11, // MO §2 button shape collapses to 11×11
  listDismissScale: 0.2, // MO §2 dismiss: list scales 1 → 0.2
  blurMax: 4, // MO §2 gaussianBlur = 4·(1 − opacity)
} as const;

export interface MenuRowSpec {
  subtitle?: boolean;
}

/** Height of the list for `sections` (each an array of rows). TO §10.1: padding 10, rows 42/60, section gap 21. */
export function menuListHeight(sections: readonly (readonly MenuRowSpec[])[], accessories = false): number {
  const nonEmpty = sections.filter((s) => s.length > 0);
  if (nonEmpty.length === 0) return 0;
  let h = 2 * menuMetrics.padding;
  if (accessories) h += menuMetrics.accessoryRow + menuMetrics.separatorGap * 2 + menuMetrics.separator;
  nonEmpty.forEach((rows, i) => {
    if (i > 0) h += menuMetrics.separatorGap * 2 + menuMetrics.separator;
    for (const r of rows) h += r.subtitle ? menuMetrics.rowSubtitle : menuMetrics.row;
  });
  return h;
}

/** Row rectangles (y, height) in list coordinates, in reading order, for hit-testing a sliding finger. */
export function menuRowFrames(sections: readonly (readonly MenuRowSpec[])[]): { y: number; height: number }[] {
  const out: { y: number; height: number }[] = [];
  let y = menuMetrics.padding;
  sections
    .filter((s) => s.length > 0)
    .forEach((rows, i) => {
      if (i > 0) y += menuMetrics.separatorGap * 2 + menuMetrics.separator;
      for (const r of rows) {
        const h = r.subtitle ? menuMetrics.rowSubtitle : menuMetrics.row;
        out.push({ y, height: h });
        y += h;
      }
    });
  return out;
}

/** Index of the row under local y, or -1. */
export function menuRowAt(frames: readonly { y: number; height: number }[], y: number): number {
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    if (y >= f.y && y < f.y + f.height) return i;
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------- placement

/**
 * Button menu placement, from the two captures:
 * - controls.md §1.8: button [178, 300, 84 wide] → menu x 95, i.e. centred on the button, top at the button's top;
 * - text_overlays §10.1: button [40, 200, 100 wide] → menu x 40 (centring would overflow the 8 pt container inset),
 *   i.e. aligned with the button's leading edge.
 * Rule: centred when that fits inside the 8 pt insets (MO §2 minimumContainerInsets), otherwise aligned with the
 * button's leading edge (left half) or trailing edge (right half; mirrored, TODO(unknown): no trailing capture).
 * Shifted up when it does not fit below.
 */
export function placeButtonMenu(anchor: Rect, menuHeight: number, container: { width: number; height: number; safeTop?: number; safeBottom?: number }): Rect {
  const inset = menuMetrics.containerInset;
  const w = menuMetrics.width;
  const h = Math.min(menuHeight, menuMetrics.maxHeight, container.height - 2 * inset);
  const top = (container.safeTop ?? 0) + inset;
  const bottom = container.height - (container.safeBottom ?? 0) - inset;
  const lo = inset;
  const hi = container.width - inset - w;
  const centred = anchor.x + anchor.width / 2 - w / 2;
  let x: number;
  if (centred >= lo && centred <= hi) x = centred;
  else if (anchor.x + anchor.width / 2 < container.width / 2) x = clamp(anchor.x, lo, hi);
  else x = clamp(anchor.x + anchor.width - w, lo, hi);
  let y = anchor.y;
  if (y + h > bottom) y = Math.max(top, bottom - h);
  return { x, y, width: w, height: h };
}

/**
 * `_UIContextMenuDefaultContentSpacing` = `_horizontalContentMarginForView:ofWidth:` (UIKitCore 27.0, disassembled in
 * uikit-internals/deep/ctxmenu-fit): the system horizontal margin, 20 on the 440 pt iPhone and 16 on the 402 pt one
 * (measured: preview x / top inset / preview→menu gap 20 vs 16, deep/ctxmenu-fit pro_*.png vs *.png). It is the
 * side inset, the inset below the top and above the bottom safe area, and the preview → menu gap.
 * TODO(unknown): the exact width threshold; UIKit's classic margin switches at 414.
 */
export function contextMenuSpacing(width: number): number {
  return width >= 414 ? 20 : 16;
}

/**
 * Preview size (`_computedPreviewBoundsForContentBounds:`: aspect fit of the preferred size): width ≤ W − 2·spacing,
 * height ≤ 628.33/956 of the screen (UIKit lab 9:16 → 353.67 × 628.33) and ≤ `maxHeight` (an app cap; Photos uses the
 * screen width: 3:4 → 330 × 440 on 440 × 956, 301.67 × 402 on 402 × 874). The menu does NOT shrink the preview: on
 * 402 × 874 Photos keeps 402 tall and the pair overflows the bottom limit (deep/ctxmenu-fit pro_orange.png).
 * Without a preferred size the preview fills (W − 2·spacing) × 571.33 (lab "nosize", scaled by H/956).
 */
export function previewSize(screen: { width: number; height: number }, aspect?: number, maxHeight?: number): { width: number; height: number } {
  const maxW = screen.width - 2 * contextMenuSpacing(screen.width);
  let capH = (628.33 / 956) * screen.height;
  if (maxHeight !== undefined) capH = Math.min(capH, maxHeight);
  if (!aspect || !(aspect > 0)) return { width: maxW, height: Math.min(capH, (571.33 / 956) * screen.height) };
  let w = maxW;
  let h = w / aspect;
  if (h > capH) {
    h = capH;
    w = h * aspect;
  }
  return { width: w, height: h };
}

/** MO §2 / TR §8: the lifted platter is the source scaled by min(1.15, (w + 26)/w) (core `contextMenuLiftScale`). */
export function liftedRect(source: Rect): Rect {
  const s = contextMenuLiftScale(source.width);
  const w = source.width * s;
  const h = source.height * s;
  return { x: source.x + source.width / 2 - w / 2, y: source.y + source.height / 2 - h / 2, width: w, height: h };
}

/**
 * Place a lifted preview and its menu (`_positionPlatterFrame:andActionViewFrame:inBounds:aboutSourcePoint:`).
 * Measured on iOS 27 (UIKit lab raw/r1…r5; Photos on 440 × 956 and 402 × 874, deep/ctxmenu-fit):
 * - The menu is always `spacing` (20 / 16) below the preview; it never overlaps it.
 * - The pair stays near the source: the preview is centred on it, then the pair is kept inside
 *   [safe top + spacing, H − safe bottom − spacing] (82…902 on 440 × 956). When the pair is taller than that, its
 *   top sits at the top limit and it runs past the bottom one (lab 9:16: 82…918.33; Photos 402 × 874: 78…846),
 *   but not past H − spacing, where the preview shrinks instead (guard; not observed natively).
 * - Horizontally the preview is clamped inside the side spacing; the menu follows the SOURCE's third of the
 *   screen: leading edge of the preview (left third), centred under it (middle), trailing edge (right third)
 *   (lab: 400-wide preview at x 20 → menu x 20 / 95 / 170 for the three columns; Photos 3:4 / 9:16 / portrait).
 *   Without a source x: centred under a centred preview, else leading-aligned.
 */
export function placeContextMenu(
  preview: Rect,
  menuHeight: number,
  container: { width: number; height: number; safeTop?: number; safeBottom?: number },
  sourceCenterX?: number,
): { preview: Rect; menu: Rect; menuAbove: boolean } {
  const sp = contextMenuSpacing(container.width);
  const gap = sp;
  const top = (container.safeTop ?? 0) + sp;
  const bottom = container.height - (container.safeBottom ?? 0) - sp;
  const mh = Math.min(menuHeight, menuMetrics.maxHeight);
  const mw = menuMetrics.width;
  const p = { ...preview };
  p.x = clamp(p.x, sp, Math.max(sp, container.width - sp - p.width));
  if (p.y + p.height + gap + mh > bottom) p.y = bottom - mh - gap - p.height;
  if (p.y < top) p.y = top;
  // Guard: never push the menu off the screen. Native overflows stay inside H − spacing (lab 918.33 ≤ 936, Photos
  // 402 × 874: 846 ≤ 858); past that the preview shrinks uniformly about its centre. TODO(unknown): unobserved case.
  const hardBottom = container.height - sp;
  const over = p.y + p.height + gap + mh - hardBottom;
  if (over > 0 && p.height > over) {
    const k = (p.height - over) / p.height;
    const cx = sourceCenterX ?? p.x + p.width / 2; // re-centre on the source, then clamp (like the full-size preview)
    p.height -= over;
    p.width *= k;
    p.x = clamp(cx - p.width / 2, sp, Math.max(sp, container.width - sp - p.width));
  }
  const lo = sp;
  const hi = container.width - sp - mw;
  let mx: number;
  if (sourceCenterX !== undefined) {
    const third = container.width / 3;
    if (sourceCenterX < third) mx = p.x;
    else if (sourceCenterX > 2 * third) mx = p.x + p.width - mw;
    else mx = p.x + p.width / 2 - mw / 2;
  } else {
    const centred = Math.abs(p.x + p.width / 2 - container.width / 2) < 1;
    mx = centred ? container.width / 2 - mw / 2 : p.x;
  }
  mx = clamp(mx, lo, Math.max(lo, hi));
  return { preview: p, menu: { x: mx, y: p.y + p.height + gap, width: mw, height: mh }, menuAbove: false };
}

// ---------------------------------------------------------------------------------------------- long-press pre-lift

export const preLift = {
  start: 0.18, // PT §1 / TR §8: the platter appears ≈0.18 s after touch-down
  growthPerSecond: 19, // PT §1: grows about +19 pt/s per side, almost linearly
  shadowOpacity: 0.3, // PT §1 shadow 0 → 0.30 (radius 20, offset 0)
  shadowRadius: 20,
  commit: gestureThresholds.contextMenuCommit, // TR §8 clickTimeoutDuration 0.725 s
  minimumDuration: gestureThresholds.contextMenuMinimumDuration, // TR §8 0.15 s
  allowableMovement: gestureThresholds.longPressAllowableMovement, // TR §8 10 pt
  feedbackAt: 0.42, // PT §1 click feedback at ≈0.42 s (we fire the haptic at lift instead, HF §4)
} as const;

/**
 * Pre-lift scale of a source of width w at `elapsed` seconds after touch-down (PT §1):
 * the side grows linearly by 19 pt/s from 0.18 s until the lift (0.725 s).
 */
export function preLiftScale(width: number, elapsed: number): number {
  const t = clamp(elapsed, preLift.start, preLift.commit) - preLift.start;
  return (width + preLift.growthPerSecond * t) / width;
}

/** Pre-lift shadow opacity: 0 → 0.30 over the pre-lift window (PT §1; the small 0.316 overshoot is omitted). */
export function preLiftShadow(elapsed: number): number {
  const x = clamp((elapsed - preLift.start) / (preLift.commit - preLift.start), 0, 1);
  return preLift.shadowOpacity * x;
}

// ---------------------------------------------------------------------------------------------- morph

/**
 * The menu morph shape at progress p (0 = blob, 1 = menu), MO §2: the menu shape grows out of a 22×22 blob at the
 * source's trailing area. `origin` is the blob centre. Radius goes from 11 (circle) to the menu radius 32.
 */
export function morphShape(origin: { x: number; y: number }, menu: Rect, p: number): Rect & { radius: number } {
  const b = menuMetrics.blob;
  const from = { x: origin.x - b / 2, y: origin.y - b / 2, width: b, height: b };
  const x = lerp(from.x, menu.x, p);
  const y = lerp(from.y, menu.y, p);
  const width = Math.max(1, lerp(from.width, menu.width, p));
  const height = Math.max(1, lerp(from.height, menu.height, p));
  const radius = Math.min(Math.min(width, height) / 2, lerp(b / 2, menuMetrics.radius, clamp(p, 0, 1)));
  return { x, y, width, height, radius };
}

/** MO §2: crossfaded layers blur by 4·(1 − opacity) (clamped at 0 for the spring overshoot). */
export function morphBlur(opacity: number): number {
  return Math.max(0, menuMetrics.blurMax * (1 - opacity));
}

/** The point the morph blob starts from: the source's trailing-top area (MO §2 "button's trailing area"). */
export function morphOrigin(anchor: Rect, menu: Rect): { x: number; y: number } {
  const b = menuMetrics.blob / 2;
  const menuRight = menu.x + menu.width / 2 >= anchor.x + anchor.width / 2;
  return {
    x: menuRight ? anchor.x + anchor.width - b : anchor.x + b,
    y: clamp(anchor.y + anchor.height / 2, menu.y + b, menu.y + menu.height - b),
  };
}

// ---------------------------------------------------------------------------------------------- .pop commit (PT §2)

export const popCommit = {
  sourceRadius: radii.menu, // PT §2 sourceRadius = menuCornerRadius 32
  destinationRadius: radii.display, // PT §2 destinationRadius = displayCornerRadius 62
  centreDuration: 0.35, // PT §2 the centre + fade spring is animateWithDuration 0.35
  previewFade: [0, 0.4] as const, // PT §2 preview snapshot alpha 1 → 0 over 0–40 %
  backgroundFade: [0.3, 0.7] as const, // PT §2 original-content snapshot alpha 1 → 0 over 30–70 %
} as const;

/** Keyframe opacity inside the 0.35 s centre animation (PT §2 block_6). `t` = seconds since the commit. */
export function popKeyframes(t: number): { preview: number; background: number } {
  const x = clamp(t / popCommit.centreDuration, 0, 1);
  const seg = (a: number, b: number) => 1 - clamp((x - a) / (b - a), 0, 1);
  return { preview: seg(...popCommit.previewFade), background: seg(...popCommit.backgroundFade) };
}

/**
 * PT §2 geometry at geometry-progress g (0…1+, the 0.5 s/0.7/v0 15 spring) and centre-progress c (the ζ1 0.238 s
 * spring): morph container size and radius follow g; its centre follows c; the preview snapshot is scaled uniformly
 * by destination.width / source.width (width ratio on both axes).
 */
export function popGeometry(
  source: Rect,
  dest: Rect,
  g: number,
  c: number,
): { container: Rect & { radius: number }; previewScale: number; destScale: number } {
  const width = lerp(source.width, dest.width, g);
  const height = lerp(source.height, dest.height, g);
  const cx = lerp(source.x + source.width / 2, dest.x + dest.width / 2, c);
  const cy = lerp(source.y + source.height / 2, dest.y + dest.height / 2, c);
  const radius = Math.max(0, lerp(popCommit.sourceRadius, popCommit.destinationRadius, g));
  const sFull = dest.width / source.width;
  return {
    container: { x: cx - width / 2, y: cy - height / 2, width, height, radius },
    previewScale: lerp(1, sFull, g),
    destScale: lerp(1 / sFull, 1, g),
  };
}

// ---------------------------------------------------------------------------------------------- alert

/** text_overlays §9.2: Cancel goes on the left when two actions sit side by side, last when stacked. */
export function orderActions<T extends { role?: 'cancel' | 'destructive' }>(actions: readonly T[], sideBySide: boolean): T[] {
  const cancel = actions.filter((a) => a.role === 'cancel');
  const rest = actions.filter((a) => a.role !== 'cancel');
  return sideBySide ? [...cancel, ...rest] : [...rest, ...cancel];
}
