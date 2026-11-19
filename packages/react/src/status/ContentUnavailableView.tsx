/**
 * `ContentUnavailableView` (SwiftUI; the reference) and its `.search(text:)` variant.
 *
 * Measured at a 400 pt proposal (deep/swiftui-components out/raw/unavailable.default|search, 400 × 201.67 / 203.67):
 * - symbol in secondaryLabel at its glyph box (tray.fill 46.33×33.67, magnifyingglass 38.33×38.67), 19.33 from the top;
 * - title 23.67 below the glyph: 20 pt Bold (title3), 24 tall, label colour;
 * - description 3 below: 20 pt Regular, secondaryLabel, centred, wraps within width − 64 (336 of 400) avoiding a
 *   one-word last line, 24 / 49 tall for 1 / 2 lines;
 * - actions 30 below the description, then 16 to the bottom. Without actions the 30 + 16 remain (search: 46).
 *   Several actions stack 15 apart (ST cu2: Refresh 457.67–485.67, then a plain "Settings" button whose 28 pt
 *   small-control frame starts at 500.67 (text 505.67, 15 pt in the tint); view 400 × 244.67).
 * Light secondaryLabel #3C3C43@0.6, dark #EBEBF5@0.6; the Refresh button is borderedProminent small (73×28, r 14).
 *
 * UIKit's UIContentUnavailableView differs (components/bars.md §7): symbol pointSize 48 (67.33×49.33), title Bold 22,
 * secondary Regular 15, gaps 15 / 3 / 20, margins 16/32. This component follows SwiftUI.
 */
import type { CSSProperties, ReactNode } from 'react';
import { cssVar } from '../root';
import { SymbolImage, symbols, type EmptyStateSymbol, type EmptyStateSymbolName } from './symbols';

export interface ContentUnavailableViewProps {
  /** Title (`Label` text). */
  title: ReactNode;
  /** SF Symbol name from `symbols`, a custom outline, or any node (drawn in secondaryLabel). */
  systemImage?: EmptyStateSymbolName | EmptyStateSymbol | ReactNode;
  description?: ReactNode;
  /** Buttons below the description (SwiftUI `actions:`), e.g. `<Button variant="filled" size="small">`. */
  actions?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

/** SUI unavailable.*: vertical rhythm in pt. */
export const unavailableMetrics = {
  top: 19.3333,
  imageToTitle: 23.6667,
  titleToDescription: 3,
  descriptionToActions: 30,
  bottom: 16,
  sidePadding: 32,
  titleSize: 20,
  titleLine: 24,
  descriptionSize: 20,
  descriptionLine: 24.5,
} as const;

const M = unavailableMetrics;

function resolveImage(img: ContentUnavailableViewProps['systemImage']): ReactNode {
  if (typeof img === 'string' && img in symbols) return <SymbolImage symbol={symbols[img as EmptyStateSymbolName]} style={{ display: 'block' }} />;
  if (img && typeof img === 'object' && 'd' in (img as object)) return <SymbolImage symbol={img as EmptyStateSymbol} style={{ display: 'block' }} />;
  return img as ReactNode;
}

export function ContentUnavailableView({ title, systemImage, description, actions, className, style }: ContentUnavailableViewProps) {
  const image = resolveImage(systemImage);
  return (
    <div
      role="status"
      className={className}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: `${M.top}px ${M.sidePadding}px ${M.bottom}px`,
        ...style,
      }}
    >
      {image && <div style={{ color: cssVar('secondaryLabel'), marginBottom: M.imageToTitle, lineHeight: 0 }}>{image}</div>}
      <div style={{ fontSize: M.titleSize, lineHeight: `${M.titleLine}px`, fontWeight: 700, color: cssVar('label') }}>{title}</div>
      {description && (
        <div
          style={{
            marginTop: M.titleToDescription,
            // 2 lines measure 49, 1 line 24: a 24.5 line box is exact for 2 lines and 0.5 tall for one.
            // SUI unavailable.search wraps "…try a / new search." although "…try a new" fits 336: Apple's line
            // breaking avoids a one-word last line, as `text-wrap: pretty` does.
            textWrap: 'pretty',
            fontSize: M.descriptionSize,
            lineHeight: `${M.descriptionLine}px`,
            color: cssVar('secondaryLabel'),
          }}
        >
          {description}
        </div>
      )}
      <div style={{ marginTop: M.descriptionToActions, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 15 }}>{actions}</div>
    </div>
  );
}

export interface SearchUnavailableViewProps {
  /** The search text; the title reads “No Results for “text”” (or “No Results” when empty). */
  text?: string;
  className?: string;
  style?: CSSProperties;
}

/** `ContentUnavailableView.search(text:)` (SUI unavailable.search). */
export function SearchUnavailableView({ text, className, style }: SearchUnavailableViewProps) {
  return (
    <ContentUnavailableView
      systemImage="magnifyingglass"
      title={text ? `No Results for “${text}”` : 'No Results'}
      description="Check the spelling or try a new search."
      className={className}
      style={style}
    />
  );
}
