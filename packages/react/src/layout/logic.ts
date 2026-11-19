/**
 * Pure logic for the SwiftUI-style layout primitives (stacks, Spacer, Grid).
 *
 * Sources (under ~/Documents/uikit-internals/):
 *   SC = deep/swiftui-components/spec.md (§11 glass table: `Text.padding().glassEffect()` = 16 pt around the text)
 *   RP = reference-page.html "Layout metrics" (system minimum side margin 20 pt; via core `metrics.sideMargin`)
 */
import type { CSSProperties } from 'react';
import { metrics } from '@liquid-gpu/core';

/**
 * SwiftUI's default stack spacing (`spacing: nil`) is font/edge dependent and was not extracted.
 * TODO(unknown): 8 pt is a reasonable stand-in (RP Layout: "8 pt grid").
 */
export const DEFAULT_STACK_SPACING = 8;

/** Spacer default `minLength` (nil → the default spacing). TODO(unknown): same stand-in as the stack spacing. */
export const DEFAULT_SPACER_MIN_LENGTH = DEFAULT_STACK_SPACING;

/** `.padding()` with no length: 16 pt (SC: `Text.padding().glassEffect()` is 16 pt padding around 15 pt text). */
export const STANDARD_PADDING = 16;

/** Grid default spacing between cells. TODO(unknown): LazyVGrid default spacing not extracted; 8 pt. */
export const DEFAULT_GRID_SPACING = 8;

/** `GridItem.flexible()` default minimum. TODO(unknown): not in the extraction; 10 pt (documented SwiftUI default). */
export const DEFAULT_FLEXIBLE_MIN = 10;

export type Padding = number | 'standard' | 'margins';

/**
 * `padding` → CSS padding. A number pads every edge; `standard` = `.padding()` (16, SC); `margins` = the system
 * layout margins: 20 pt left and right (RP Layout systemMinimumLayoutMargins), 0 top and bottom.
 */
export function paddingCss(p: Padding | undefined): CSSProperties['padding'] {
  if (p === undefined) return undefined;
  if (p === 'standard') return STANDARD_PADDING;
  if (p === 'margins') return `0 ${metrics.sideMargin}px`;
  return Math.max(0, p);
}

export type HorizontalAlignment = 'leading' | 'center' | 'trailing';
export type VerticalAlignment = 'top' | 'center' | 'bottom' | 'firstTextBaseline' | 'lastTextBaseline';
export type ZStackAlignment =
  | 'topLeading'
  | 'top'
  | 'topTrailing'
  | 'leading'
  | 'center'
  | 'trailing'
  | 'bottomLeading'
  | 'bottom'
  | 'bottomTrailing';

const H_ALIGN: Record<HorizontalAlignment, string> = { leading: 'flex-start', center: 'center', trailing: 'flex-end' };
const V_ALIGN: Record<VerticalAlignment, string> = {
  top: 'flex-start',
  center: 'center',
  bottom: 'flex-end',
  firstTextBaseline: 'first baseline',
  lastTextBaseline: 'last baseline',
};

/** VStack alignment → `align-items` (SwiftUI default `.center`). */
export function hAlignCss(a: HorizontalAlignment = 'center'): string {
  return H_ALIGN[a] ?? 'center';
}

/** HStack alignment → `align-items` (SwiftUI default `.center`). */
export function vAlignCss(a: VerticalAlignment = 'center'): string {
  return V_ALIGN[a] ?? 'center';
}

/** ZStack alignment → grid `justify-items` / `align-items` (SwiftUI default `.center`). */
export function zAlignCss(a: ZStackAlignment = 'center'): { justifyItems: string; alignItems: string } {
  const s = String(a);
  const v = s.startsWith('top') ? 'start' : s.startsWith('bottom') ? 'end' : 'center';
  const h = /leading/i.test(s) ? 'start' : /trailing/i.test(s) ? 'end' : 'center';
  return { justifyItems: h, alignItems: v };
}

export type Axis = 'horizontal' | 'vertical';
export type MaxLength = number | 'infinity';

/**
 * `.frame(maxWidth:, maxHeight:)` for an element whose parent stack lays out along `parentAxis` (undefined = not in a
 * stack). `infinity` grows along the parent's axis and stretches across it.
 */
export function frameCss(maxWidth: MaxLength | undefined, maxHeight: MaxLength | undefined, parentAxis: Axis | undefined): CSSProperties {
  const css: CSSProperties = {};
  const grow = (axis: Axis) => {
    if (parentAxis === axis) {
      css.flex = '1 1 0';
      if (axis === 'horizontal') css.minWidth = 0;
      else css.minHeight = 0;
    } else if (parentAxis) {
      css.alignSelf = 'stretch';
      // Stretch only applies to an auto cross size: undo the stacks' `width: fit-content`.
      if (axis === 'horizontal') css.width = 'auto';
    }
    else if (axis === 'horizontal') css.width = '100%';
    else css.height = '100%';
  };
  if (maxWidth === 'infinity') grow('horizontal');
  else if (typeof maxWidth === 'number') css.maxWidth = maxWidth;
  if (maxHeight === 'infinity') grow('vertical');
  else if (typeof maxHeight === 'number') css.maxHeight = maxHeight;
  return css;
}

/** Spacer: flexible along the parent stack's axis, at least `minLength`. Outside a stack it grows both ways. */
export function spacerCss(minLength: number | undefined, parentAxis: Axis | undefined): CSSProperties {
  const min = Math.max(0, minLength ?? DEFAULT_SPACER_MIN_LENGTH);
  if (parentAxis === 'horizontal') return { flex: '1 1 0', minWidth: min, alignSelf: 'stretch' };
  if (parentAxis === 'vertical') return { flex: '1 1 0', minHeight: min, alignSelf: 'stretch' };
  return { flex: '1 1 0', minWidth: min, minHeight: min };
}

/** A serializable LazyVGrid column (`GridItem(.fixed / .flexible / .adaptive)`). */
export type GridColumn =
  | { type: 'fixed'; size: number }
  | { type: 'flexible'; minimum?: number; maximum?: number }
  | { type: 'adaptive'; minimum: number; maximum?: number };

const px = (n: number) => `${Math.max(0, n)}px`;

/**
 * `columns` → `grid-template-columns`. A number n = n equal flexible columns. `adaptive` packs as many columns of at
 * least `minimum` as fit (CSS `auto-fill`), like LazyVGrid.
 */
export function gridTemplateColumns(columns: number | readonly GridColumn[]): string {
  if (typeof columns === 'number') {
    const n = Math.max(1, Math.floor(columns) || 1);
    return `repeat(${n}, minmax(0, 1fr))`;
  }
  if (columns.length === 0) return 'minmax(0, 1fr)';
  return columns
    .map((c) => {
      switch (c.type) {
        case 'fixed':
          return px(c.size);
        case 'flexible':
          return `minmax(${px(c.minimum ?? DEFAULT_FLEXIBLE_MIN)}, ${c.maximum !== undefined ? px(c.maximum) : '1fr'})`;
        case 'adaptive':
          return `repeat(auto-fill, minmax(${px(c.minimum)}, ${c.maximum !== undefined ? px(c.maximum) : '1fr'}))`;
        default:
          return 'minmax(0, 1fr)';
      }
    })
    .join(' ');
}
