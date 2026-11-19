/** star.fill, traced from the iOS 27 render (BL shots/native-standalone-light-1.png, 3× px grid, 18.67 × 18 pt box). */
import type { SVGProps } from 'react';

export function StarFill(p: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 56 54" width="100%" height="100%" aria-hidden {...p}>
      <path
        d="M28 2.5 35.1 20.3 53.5 21 40.2 33.8 44.5 52.5 28 42.6 11.5 52.5 15.8 33.8 1.5 21 20.9 20.3Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth={3}
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** chevron.right 7 × 12 (DisclosureGroup indicator, BL static-standalone-c; stroke ≈ 1.9 pt from the 3× trace). */
export function DisclosureChevron(p: SVGProps<SVGSVGElement>) {
  return (
    <svg width={7} height={12} viewBox="0 0 7 12" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M1 1 6 6 1 11" />
    </svg>
  );
}
