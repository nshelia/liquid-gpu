/**
 * SF-Symbol-like glyphs for the tab bar extras, sized to the measured image boxes
 * (deep/demo-audit/tabbar-extras dumps): magnifyingglass 20.33 × 19.33, xmark 17.33 × 16, plus 18 × 16.67.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

/** magnifyingglass, 20.33 × 19.33 pt (search circle and field). */
export function MagnifyingGlassGlyph(p: P) {
  return (
    <svg width={20.33} height={19.33} viewBox="0 0 20.33 19.33" fill="none" stroke="currentColor" strokeWidth={2.1} strokeLinecap="round" aria-hidden {...p}>
      <circle cx="8.3" cy="8.3" r="7.1" />
      <path d="M13.5 13.5 19.1 18.2" />
    </svg>
  );
}

/** xmark, 17.33 × 16 pt (search close button). */
export function XMarkGlyph(p: P) {
  return (
    <svg width={17.33} height={16} viewBox="0 0 17.33 16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden {...p}>
      <path d="M1.7 1 15.6 15M15.6 1 1.7 15" />
    </svg>
  );
}

/** plus, 18 × 16.67 pt (prominent tab). */
export function PlusGlyph(p: P) {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden {...p}>
      <path d="M9 1v16M1 9h16" />
    </svg>
  );
}
