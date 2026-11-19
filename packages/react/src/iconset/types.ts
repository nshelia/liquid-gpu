/** Icon set types. Pure data, no React runtime import (types only). */
import type { ReactNode, SVGProps } from 'react';

/** One SVG primitive: `[tag, attributes]`. */
export type IconNode = [tag: 'path' | 'circle' | 'rect' | 'ellipse' | 'line' | 'polyline' | 'polygon', attrs: Record<string, string | number>];

/** How a group of nodes is painted in `currentColor`. `both` = filled and stroked (a solid shape with round corners). */
export type IconPaint = 'stroke' | 'fill' | 'both';

export interface IconLayer {
  paint: IconPaint;
  nodes: IconNode[];
}

/**
 * Declarative glyph. Drawn into a square `size × size` frame; a non-square `viewBox` is centred (xMidYMid meet).
 * `cutouts` are knocked out of every layer through a mask (e.g. the cross in `xmark.circle.fill`).
 */
export interface IconDefinition {
  /** Default `0 0 24 24`. */
  viewBox?: string;
  /** Stroke width at `regular` weight, in viewBox units. Default 1.9 (24 unit box). */
  stroke?: number;
  layers: IconLayer[];
  cutouts?: IconLayer[];
}

/** Props passed to a function entry. `size` is the frame in pt (= CSS px), `strokeWidth` already reflects `weight`. */
export type IconRenderProps = Omit<SVGProps<SVGSVGElement>, 'ref'> & { size: number; strokeWidth: number; weight: IconWeight };

/** A custom renderer (host apps can register arbitrary components). Must return the whole `<svg>`. */
export type IconRenderer = (props: IconRenderProps) => ReactNode;

export type IconEntry = IconDefinition | IconRenderer;

/** SF Symbols weight names. */
export type IconWeight = 'ultralight' | 'thin' | 'light' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy' | 'black';
