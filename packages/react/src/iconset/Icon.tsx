/**
 * `<Icon name="heart.fill" />`: an SF-Symbol-named glyph from the icon registry as inline SVG in `currentColor`.
 * `size` is the square frame in pt (= CSS px), like the repo's other glyphs (icons.tsx). Decorative (`aria-hidden`)
 * unless `label` is given, which makes it `role="img"` with that accessible name.
 */
import { createElement, isValidElement, useId, type ReactNode, type SVGProps } from 'react';
import { DEFAULT_ICON_STROKE, getIconEntry, iconStrokeWidth, resolveIconColor } from './registry';
import type { IconDefinition, IconLayer, IconWeight } from './types';

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name' | 'color' | 'children' | 'ref' | 'strokeWidth'> {
  /** SF-Symbol-style name, e.g. `square.and.arrow.up`. Unknown names render `questionmark.square`. */
  name: string;
  /** Frame in pt (CSS px). Default 22. */
  size?: number;
  /** SF weight; scales the stroke. Default `regular`. */
  weight?: IconWeight;
  /** Theme token (`systemBlue`, `secondaryLabel`), short tint (`blue`) or any CSS colour. Default `currentColor`. */
  color?: string;
  /** Accessible name. Without it the icon is `aria-hidden`. */
  label?: string;
  /** Explicit stroke width in viewBox units (overrides `weight`). */
  strokeWidth?: number;
}

const PAINT = {
  stroke: { fill: 'none', stroke: 'currentColor' },
  fill: { fill: 'currentColor', stroke: 'none' },
  both: { fill: 'currentColor', stroke: 'currentColor' },
} as const;
const CUT_PAINT = {
  stroke: { fill: 'none', stroke: '#000' },
  fill: { fill: '#000', stroke: 'none' },
  both: { fill: '#000', stroke: '#000' },
} as const;

function renderLayers(layers: IconLayer[], paints: typeof PAINT | typeof CUT_PAINT, keyPrefix: string): ReactNode[] {
  return layers.map((layer, i) => (
    <g key={`${keyPrefix}${i}`} {...paints[layer.paint]}>
      {layer.nodes.map(([tag, attrs], j) => createElement(tag, { key: j, ...attrs }))}
    </g>
  ));
}

function DefinitionSvg({ def, size, sw, svgProps, maskId }: { def: IconDefinition; size: number; sw: number; svgProps: SVGProps<SVGSVGElement>; maskId: string }) {
  const viewBox = def.viewBox ?? '0 0 24 24';
  const [x = 0, y = 0, w = 24, h = 24] = viewBox.split(/[\s,]+/).map(Number);
  const cut = def.cutouts?.length ? def.cutouts : null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...svgProps}
    >
      {svgProps['aria-label'] ? <title>{svgProps['aria-label']}</title> : null}
      {cut ? (
        <mask id={maskId} maskUnits="userSpaceOnUse" x={x - 2} y={y - 2} width={w + 4} height={h + 4}>
          <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} fill="#fff" />
          {renderLayers(cut, CUT_PAINT, 'c')}
        </mask>
      ) : null}
      <g mask={cut ? `url(#${maskId})` : undefined}>{renderLayers(def.layers, PAINT, 'l')}</g>
    </svg>
  );
}

export function Icon({ name, size = 22, weight = 'regular', color, label, strokeWidth, style, ...rest }: IconProps) {
  const maskId = useId();
  const { entry, name: resolved } = getIconEntry(name);
  const css = resolveIconColor(color);
  const svgProps: SVGProps<SVGSVGElement> = {
    ...rest,
    'data-icon': resolved,
    style: css ? { color: css, flexShrink: 0, ...style } : { flexShrink: 0, ...style },
    ...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true, focusable: 'false' }),
  } as unknown as SVGProps<SVGSVGElement>;
  if (typeof entry === 'function') {
    const sw = strokeWidth ?? iconStrokeWidth(weight, DEFAULT_ICON_STROKE);
    return <>{entry({ ...svgProps, size, strokeWidth: sw, weight })}</>;
  }
  const sw = strokeWidth ?? iconStrokeWidth(weight, entry.stroke ?? DEFAULT_ICON_STROKE);
  return <DefinitionSvg def={entry} size={size} sw={sw} svgProps={svgProps} maskId={maskId} />;
}

/** Options applied when `resolveIcon` turns a string into an `<Icon>`. */
export type ResolveIconOptions = Omit<IconProps, 'name'>;

/**
 * String → `<Icon name>`; any other ReactNode (element, null, number) passes through unchanged. Lets components take
 * `icon?: ReactNode | string` so JSON specs can say `"icon": "square.and.arrow.up"`.
 */
export function resolveIcon(nameOrNode: ReactNode, options?: ResolveIconOptions): ReactNode {
  if (typeof nameOrNode === 'string') return <Icon name={nameOrNode} {...options} />;
  return nameOrNode;
}

/** True when `node` is an element produced by `resolveIcon` / `<Icon>`. */
export function isIconElement(node: unknown): boolean {
  return isValidElement(node) && node.type === Icon;
}
