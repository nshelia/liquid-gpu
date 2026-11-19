/**
 * Simulated iOS 27 status bar + Dynamic Island for desktop previews of the 440 × 956 demo pages.
 * Measured from uikit-internals/deep/photos-transition/raw/photos-p2.mp4 @151 s (iPhone 18 Pro Max simulator, 3x):
 * - time: Semibold ≈19.33 pt, ink 35 × 14 from (73.33, 25.33) for "9:31" (centred on x 90.83)
 * - Dynamic Island: 94.67 × 36.67 at (172.67, 14), black capsule (centred on the screen)
 * - signal: four 3.67 pt dots #BDBBBC at x 302 / 308.33 / 314.33 / 320.67, y 36.67 (simulator "no service")
 * - Wi-Fi: ink 19.33 × 14.67 at (333.33, 25.33)
 * - battery: body 29.33 × 15 at (361.67, 24.67), solid; cap 2.33 × 3.67 at (391.67, 30.33)
 * Horizontal positions are kept relative to the 440 pt layout's edges (left group from the left, right group from
 * the right). Hidden on real iOS devices, which draw their own status bar.
 */
import { useEffect, useState } from 'react';
import { LayerView, useLiquid } from '@liquid-gpu/react';

export function isRealIOS(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function clock() {
  const fixed = new URLSearchParams(location.search).get('clock'); // e.g. ?clock=9:31 for pixel comparisons
  if (fixed) return fixed;
  const d = new Date();
  return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StatusBar({ width, color = 'var(--lq-label)' }: { width: number; color?: string }) {
  const [t, setT] = useState(clock);
  useEffect(() => {
    const id = setInterval(() => setT(clock()), 5000);
    return () => clearInterval(id);
  }, []);
  const r = (x: number) => width - (440 - x); // right-anchored x
  return (
    <div aria-hidden style={{ position: 'absolute', left: 0, top: 0, width, height: 54, pointerEvents: 'none', color, zIndex: 1, transition: 'color 0.23s cubic-bezier(0.42, 0, 0.58, 1)' }}>
      {/* Digits 14 tall → Semibold ≈19.33 (cap 0.705): baseline 39.33, ascent 18.4 → box top 20.93, lh 23.06. */}
      <div style={{ position: 'absolute', left: 90.83 - 40, width: 80, top: 19.93, textAlign: 'center', fontSize: 19.33, fontWeight: 600, lineHeight: '23.06px', letterSpacing: -0.2 }}>{t}</div>
      <div style={{ position: 'absolute', left: width / 2 - 47.33, top: 14, width: 94.67, height: 36.67, borderRadius: 18.33, background: '#000' }} />
      <svg style={{ position: 'absolute', left: r(302), top: 36.67 }} width={22.33} height={3.67} viewBox="0 0 22.33 3.67" aria-hidden>
        {[0, 6.33, 12.33, 18.67].map((x) => (
          <circle key={x} cx={x + 1.83} cy={1.83} r={1.83} fill="#BDBBBC" />
        ))}
      </svg>
      <svg style={{ position: 'absolute', left: r(333.33), top: 25.33 }} width={19.33} height={14.67} viewBox="0 0 19.33 14.67" fill="currentColor" aria-hidden>
        <path d="M9.67 0C6 0 2.7 1.4.2 3.7c-.3.3-.3.7 0 1l1.5 1.5c.3.3.7.3 1 0a10 10 0 0 1 13.9 0c.3.3.7.3 1 0l1.5-1.5c.3-.3.3-.7 0-1A13.9 13.9 0 0 0 9.67 0z" />
        <path d="M9.67 5.1c-2.3 0-4.4.9-6 2.3-.3.3-.3.7 0 1l1.5 1.5c.3.3.7.3 1 0a5.2 5.2 0 0 1 7 0c.3.3.7.3 1 0l1.5-1.5c.3-.3.3-.7 0-1a8.6 8.6 0 0 0-6-2.3z" />
        <path d="M9.67 10.2c-.9 0-1.8.3-2.5.9-.3.3-.3.7 0 1l2 2.3c.3.3.7.3 1 0l2-2.3c.3-.3.3-.7 0-1-.7-.6-1.6-.9-2.5-.9z" />
      </svg>
      <div style={{ position: 'absolute', left: r(361.67), top: 24.67, width: 29.33, height: 15, borderRadius: 4.67, background: 'currentColor' }} />
      <div style={{ position: 'absolute', left: r(391.67), top: 30.33, width: 2.33, height: 3.67, borderRadius: '0 1.2px 1.2px 0', background: 'currentColor' }} />
    </div>
  );
}

/**
 * The status bar as its own layer: above the one-up viewer (z 7000…7003) and below menus (8000), so a context
 * menu's dimming covers it as on iOS (PT frame @60 s). Off on real iOS and with `?nostatus`.
 */
export function StatusBarLayer({ color }: { color?: string }) {
  const { viewport } = useLiquid();
  if (isRealIOS() || new URLSearchParams(location.search).has('nostatus')) return null;
  return (
    <LayerView z={7500} width={viewport.width} height={54} aria-hidden="true" style={{ pointerEvents: 'none' }}>
      <StatusBar width={viewport.width} color={color} />
    </LayerView>
  );
}
