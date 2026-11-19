/**
 * Grid: LazyVGrid-style column grid. `columns` is a count or a list of serializable GridItems
 * (`fixed` / `flexible` / `adaptive`). Constants and sources: `./logic.ts`.
 */
import { useContext, type CSSProperties, type ReactNode } from 'react';
import { DEFAULT_GRID_SPACING, frameCss, gridTemplateColumns, hAlignCss, paddingCss, type GridColumn, type HorizontalAlignment, type MaxLength, type Padding } from './logic';
import { StackAxisContext } from './Stack';

export interface GridProps {
  /** Column count (equal flexible columns) or GridItem descriptors. Default 2. */
  columns?: number | GridColumn[];
  /** Horizontal space between columns. Default 8 (TODO(unknown)). */
  spacing?: number;
  /** Vertical space between rows. Defaults to `spacing`. */
  rowSpacing?: number;
  /** Cell content alignment within its column. Default `center` (LazyVGrid default). */
  alignment?: HorizontalAlignment;
  padding?: Padding;
  /** Default `'infinity'`: a grid fills the proposed width like LazyVGrid. */
  maxWidth?: MaxLength;
  children?: ReactNode;
  className?: string;
  id?: string;
  style?: CSSProperties;
}

export function Grid({ columns = 2, spacing = DEFAULT_GRID_SPACING, rowSpacing, alignment = 'center', padding, maxWidth = 'infinity', children, className, id, style }: GridProps) {
  const parent = useContext(StackAxisContext);
  return (
    <div
      id={id}
      className={className}
      style={{
        boxSizing: 'border-box',
        display: 'grid',
        gridTemplateColumns: gridTemplateColumns(columns),
        columnGap: Math.max(0, spacing),
        rowGap: Math.max(0, rowSpacing ?? spacing),
        justifyItems: hAlignCss(alignment).replace('flex-', ''),
        alignItems: 'center',
        padding: paddingCss(padding),
        ...frameCss(maxWidth, undefined, parent),
        ...style,
      }}
    >
      <StackAxisContext.Provider value={undefined}>{children}</StackAxisContext.Provider>
    </div>
  );
}
