/**
 * Stylesheet for the media components, injected once (pattern of basics/shared.tsx `useBasicsCss`).
 * CT = uikit-internals/components/controls.md, SC = deep/swiftui-components/spec.md.
 */
import { useEffect } from 'react';

const CSS = [
  // CT §1 tinted button fill: tint @0.18 light / @0.25 dark (HC 0.18 / 0.25); SC `.tint(.green)` same alphas.
  '.lq-root{--lq-media-tint-a:0.18;}',
  '.lq-root[data-appearance="dark"]{--lq-media-tint-a:0.25;}',
  // TODO(unknown): Contacts monogram gradient not in the extraction; a light→dark systemGray-like ramp, top to bottom.
  '.lq-root{--lq-media-monogram:linear-gradient(180deg,#A5AAB4 0%,#858A95 100%);}',
  '.lq-root[data-appearance="dark"]{--lq-media-monogram:linear-gradient(180deg,#8E929B 0%,#6C7079 100%);}',
  // TODO(unknown): SwiftUI `.redacted(.placeholder)` fill not extracted; systemFill reads close on both appearances.
  '.lq-root{--lq-media-redact:var(--lq-system-fill);}',
  // Skeleton shimmer (opt-in, not an iOS behaviour).
  '@keyframes lq-media-shimmer{0%{background-position:150% 0}100%{background-position:-50% 0}}',
  '.lq-skel-shimmer{background-image:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.35) 50%,transparent 100%);background-size:200% 100%;background-repeat:no-repeat;animation:lq-media-shimmer 1.4s linear infinite;}',
  '.lq-root[data-appearance="dark"] .lq-skel-shimmer{background-image:linear-gradient(90deg,transparent 0%,rgba(255,255,255,.08) 50%,transparent 100%);}',
  '@media (prefers-reduced-motion: reduce){.lq-skel-shimmer{animation:none;background-image:none;}}',
  // <Redacted active>: text is hidden behind a per-line bar drawn with a thick text-decoration in the fill colour.
  '.lq-redacted,.lq-redacted *{color:transparent!important;caret-color:transparent;' +
    'text-decoration-line:underline!important;text-decoration-color:var(--lq-media-redact)!important;text-decoration-thickness:0.78em!important;' +
    'text-underline-offset:-0.62em!important;text-decoration-skip-ink:none!important;user-select:none;}',
  // Images keep their box but show the fill (the bitmap is moved out of view).
  '.lq-redacted img{object-position:-99999px 0!important;background:var(--lq-media-redact)!important;}',
  '.lq-redacted svg *{fill:var(--lq-media-redact)!important;stroke:var(--lq-media-redact)!important;}',
].join('');

let injected = false;
export function useMediaCss(): void {
  useEffect(() => {
    if (injected || typeof document === 'undefined') return;
    injected = true;
    const s = document.createElement('style');
    s.dataset.lq = 'media';
    s.textContent = CSS;
    document.head.appendChild(s);
  }, []);
}
