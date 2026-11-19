/**
 * VStack / HStack / ZStack / Spacer: SwiftUI stacks as flexbox (ZStack as a one-cell grid). Stacks hug their content
 * (`width: fit-content`) unless `maxWidth` / `maxHeight` is `'infinity'`. Constants and sources: `./logic.ts`.
 */
import { createContext, useContext, useEffect, type CSSProperties, type ReactNode } from 'react';
import {
  DEFAULT_STACK_SPACING,
  frameCss,
  hAlignCss,
  paddingCss,
  spacerCss,
  vAlignCss,
  zAlignCss,
  type Axis,
  type HorizontalAlignment,
  type MaxLength,
  type Padding,
  type VerticalAlignment,
  type ZStackAlignment,
} from './logic';
import { resolveColor } from '../text/logic';

/** The axis of the enclosing stack (undefined outside a stack or inside a ZStack / Grid). */
export const StackAxisContext = createContext<Axis | undefined>(undefined);

interface FrameProps {
  /** Pad the content: points on every edge, `standard` (16, `.padding()`), or `margins` (20 pt side margins). */
  padding?: Padding;
  /** `'infinity'` fills the parent along that axis (`.frame(maxWidth: .infinity)`); a number caps the size. */
  maxWidth?: MaxLength;
  maxHeight?: MaxLength;
  /** Semantic colour name (e.g. `secondarySystemBackground`) or raw CSS behind the stack. */
  background?: string;
  /** Corner radius for the background (continuous corners). */
  cornerRadius?: number;
  children?: ReactNode;
  className?: string;
  id?: string;
  style?: CSSProperties;
}

export interface VStackProps extends FrameProps {
  /** Points between children. Default 8 (TODO(unknown) SwiftUI default spacing). */
  spacing?: number;
  alignment?: HorizontalAlignment;
}

export interface HStackProps extends FrameProps {
  spacing?: number;
  alignment?: VerticalAlignment;
}

export interface ZStackProps extends FrameProps {
  alignment?: ZStackAlignment;
}

function bgCss(background: string | undefined, cornerRadius: number | undefined): CSSProperties {
  const css: CSSProperties = {};
  if (background) css.background = colorValue(background);
  if (cornerRadius) {
    css.borderRadius = cornerRadius;
    (css as Record<string, unknown>).cornerShape = 'squircle';
  }
  return css;
}

function colorValue(c: string): string {
  return resolveColor(c) ?? c;
}

function base(p: FrameProps, parentAxis: Axis | undefined): CSSProperties {
  return {
    boxSizing: 'border-box',
    width: 'fit-content',
    maxWidth: '100%',
    padding: paddingCss(p.padding),
    ...bgCss(p.background, p.cornerRadius),
    ...frameCss(p.maxWidth, p.maxHeight, parentAxis),
  };
}

export function VStack({ spacing = DEFAULT_STACK_SPACING, alignment = 'center', children, className, id, style, ...frame }: VStackProps) {
  const parent = useContext(StackAxisContext);
  return (
    <div
      id={id}
      className={className}
      style={{ ...base(frame, parent), display: 'flex', flexDirection: 'column', alignItems: hAlignCss(alignment), gap: Math.max(0, spacing), ...style }}
    >
      <StackAxisContext.Provider value="vertical">{children}</StackAxisContext.Provider>
    </div>
  );
}

export function HStack({ spacing = DEFAULT_STACK_SPACING, alignment = 'center', children, className, id, style, ...frame }: HStackProps) {
  const parent = useContext(StackAxisContext);
  return (
    <div
      id={id}
      className={className}
      style={{ ...base(frame, parent), display: 'flex', flexDirection: 'row', alignItems: vAlignCss(alignment), gap: Math.max(0, spacing), ...style }}
    >
      <StackAxisContext.Provider value="horizontal">{children}</StackAxisContext.Provider>
    </div>
  );
}

const ZCSS = '.lq-zstack>*{grid-area:1/1;}';
let zInjected = false;
function useZStackCss(): void {
  useEffect(() => {
    if (zInjected || typeof document === 'undefined') return;
    zInjected = true;
    const s = document.createElement('style');
    s.dataset.lq = 'zstack';
    s.textContent = ZCSS;
    document.head.appendChild(s);
  }, []);
}

/** Children overlap in one grid cell, later children on top. */
export function ZStack({ alignment = 'center', children, className, id, style, ...frame }: ZStackProps) {
  useZStackCss();
  const parent = useContext(StackAxisContext);
  return (
    <div
      id={id}
      className={['lq-zstack', className].filter(Boolean).join(' ')}
      style={{ ...base(frame, parent), display: 'grid', gridTemplate: 'minmax(0, 1fr) / minmax(0, 1fr)', ...zAlignCss(alignment), ...style }}
    >
      <StackAxisContext.Provider value={undefined}>{children}</StackAxisContext.Provider>
    </div>
  );
}

export interface SpacerProps {
  /** Minimum length along the stack axis. Default 8 (TODO(unknown) SwiftUI default spacing). */
  minLength?: number;
}

/** Flexible space along the enclosing stack's axis. */
export function Spacer({ minLength }: SpacerProps) {
  const axis = useContext(StackAxisContext);
  return <div aria-hidden style={spacerCss(minLength, axis)} />;
}
