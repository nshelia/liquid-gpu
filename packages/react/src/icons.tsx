/**
 * A few SF-Symbol-like glyphs drawn as SVG (SF Symbols are not available on the web).
 * Sizes follow the extraction where known: chevron.backward 12.67×17.33 (bars §1.6), chevron.forward 10.33×14
 * (lists §1.2), otherwise sized for a 24 pt frame. All glyphs use `currentColor`.
 */
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number, p: P) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...p,
});

/** chevron.backward, semibold, 12.67 × 17.33 pt (bars §1.6). */
export function ChevronBackward(p: P) {
  return (
    <svg width={12.67} height={17.33} viewBox="0 0 12.67 17.33" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M10.2 1.6 2.6 8.66l7.6 7.07" />
    </svg>
  );
}

/** chevron.forward, 10.33 × 14 pt (lists §1.2 disclosure indicator). */
export function ChevronForward(p: P) {
  return (
    <svg width={10.33} height={14} viewBox="0 0 10.33 14" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...p}>
      <path d="M2 1.5 8 7l-6 5.5" />
    </svg>
  );
}

export function PlusIcon({ size = 22, ...p }: P) {
  return (
    <svg {...base(size, p)} strokeWidth={2.2}>
      <path d="M12 4.5v15M4.5 12h15" />
    </svg>
  );
}

export function EllipsisIcon({ size = 24, ...p }: P) {
  return (
    <svg {...base(size, p)} stroke="none" fill="currentColor">
      <circle cx="5.5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18.5" cy="12" r="2" />
    </svg>
  );
}

export function ShareIcon({ size = 22, ...p }: P) {
  return (
    <svg {...base(size, p)} strokeWidth={2}>
      <path d="M12 3.5v11M8 7l4-3.5L16 7" />
      <path d="M8.5 10H6.5A1.5 1.5 0 0 0 5 11.5v7A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-7a1.5 1.5 0 0 0-1.5-1.5h-2" />
    </svg>
  );
}

export function SearchIcon({ size = 22, ...p }: P) {
  return (
    <svg {...base(size, p)} strokeWidth={2.2}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m15.5 15.5 5 5" />
    </svg>
  );
}

export function TrashIcon({ size = 22, ...p }: P) {
  return (
    <svg {...base(size, p)} strokeWidth={2}>
      <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10 10v6M14 10v6" />
    </svg>
  );
}

export function ComposeIcon({ size = 22, ...p }: P) {
  return (
    <svg {...base(size, p)} strokeWidth={2}>
      <path d="M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13" />
      <path d="M17.5 3.5 20.5 6.5 12 15l-4 1 1-4z" />
    </svg>
  );
}

export function HouseFill({ size = 24, ...p }: P) {
  return (
    <svg {...base(size, p)} stroke="none" fill="currentColor">
      <path d="M12 3.2 2.8 11a.9.9 0 0 0 1.2 1.4l.9-.8V19a2 2 0 0 0 2 2h3.3v-5.3h3.6V21H17a2 2 0 0 0 2-2v-7.4l.9.8a.9.9 0 0 0 1.2-1.4z" />
    </svg>
  );
}

export function SquareGridFill({ size = 24, ...p }: P) {
  return (
    <svg {...base(size, p)} stroke="none" fill="currentColor">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" />
      <rect x="13" y="3.5" width="7.5" height="7.5" rx="2" />
      <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" />
      <rect x="13" y="13" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}

export function PersonFill({ size = 24, ...p }: P) {
  return (
    <svg {...base(size, p)} stroke="none" fill="currentColor">
      <circle cx="12" cy="8" r="4.2" />
      <path d="M4 20.2c0-4 3.6-6.7 8-6.7s8 2.7 8 6.7c0 .5-.4.8-.9.8H4.9c-.5 0-.9-.3-.9-.8z" />
    </svg>
  );
}

export function GearIcon({ size = 24, ...p }: P) {
  return (
    <svg {...base(size, p)} strokeWidth={2}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </svg>
  );
}

export function PinFill({ size = 22, ...p }: P) {
  return (
    <svg {...base(size, p)} stroke="none" fill="currentColor">
      <path d="M8 3h8l-1 6 3 3v2h-5v6l-1 1-1-1v-6H6v-2l3-3z" />
    </svg>
  );
}
