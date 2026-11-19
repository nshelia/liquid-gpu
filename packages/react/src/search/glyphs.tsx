/** SF-Symbol stand-ins for the search UI, sized to the measured frames (search/logic.ts SEARCH). */
import { useId, type CSSProperties } from 'react';

interface G {
  width: number;
  height: number;
  style?: CSSProperties;
}

/** `magnifyingglass`: ring + handle in its 20.67 × 19.33 frame; ink 16.33 × 16.67 from (2, 1.33) (SL pixel profile). */
export function Magnifier({ width, height, style }: G) {
  return (
    <svg width={width} height={height} viewBox="0 0 20.67 19.33" aria-hidden="true" style={style}>
      <circle cx="8.35" cy="8" r="5.65" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12.45 12.25 16.95 16.75" stroke="currentColor" strokeWidth="2.45" strokeLinecap="round" />
    </svg>
  );
}

/** `xmark` in its 22.67 × 21.33 frame; ink 17 × 17 from (2.67, 2.33) (SL). */
export function XMark({ width, height, style }: G) {
  return (
    <svg width={width} height={height} viewBox="0 0 22.67 21.33" aria-hidden="true" style={style}>
      <path d="M3.62 3.28 18.72 18.38M18.72 3.28 3.62 18.38" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

/** `xmark.circle.fill`: a 17.2 pt label-coloured disc centred in the 20 pt frame, cross knocked out (SL: #000 / #FFF). */
export function XMarkCircleFill({ size }: { size: number }) {
  const id = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <mask id={id}>
        <rect width="20" height="20" fill="#fff" />
        <path d="M6.8 6.8 13.2 13.2M13.2 6.8 6.8 13.2" stroke="#000" strokeWidth="1.9" strokeLinecap="round" />
      </mask>
      <circle cx="10" cy="10" r="8.6" fill="currentColor" mask={`url(#${id})`} />
    </svg>
  );
}
