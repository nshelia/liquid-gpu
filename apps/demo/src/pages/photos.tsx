/**
 * Photos: the iOS 27 Photos library rebuilt on liquid-gpu, matched to the native app recorded in
 * uikit-internals/deep/photos-transition (raw/photos-p2.mp4, 440 × 956 @3x; PT = findings.md).
 *
 * - Library (native frame @151 s): "Library" Bold 34 with its cap top at y 71 and "N Photos" Semibold 15 below,
 *   inline with the nav bar row (y 62, 44 tall): a 44 pt filter circle and a "Select" capsule. Grid: 3 columns of
 *   145.33 pt squares, 2 pt gaps (147.33 pitch), first row at y 136.
 * - Tab bar: Library + Collections in the platter, search in its own circle (Tab role="search").
 * - Long press (PT §1–2): the stock context menu with the photo previewed at its aspect, the Copy / Duplicate / Hide
 *   accessory row, Share / Favorite, Add To › / Adjust Info ›, Delete. Tapping the preview commits with `.pop`
 *   into the one-up viewer.
 * - Tap (PT §4): the Photos tile transition (ζ 1, 0.3 s, square corners, the background crossfades to white).
 *   Swipe down (PT §5): 1:1 after 15 pt, scales down, flies back into the cell.
 * - One-up chrome (native frame @145 s): 44 pt glass circles at x 20 / 376 and a 160 × 44 title capsule at x 140,
 *   all at y 62; filmstrip of 20 × 30 thumbnails at a 23 pt pitch (the current one at its aspect, 13 pt either
 *   side) at y 831; bottom bar 48 tall at y 880: circles at x 28 / 364, a 163.33 capsule at x 138.67.
 *
 * URL: ?dark  ?light (default: system)  ?open=<index>  ?tab=library|collections|search
 * Photos: Lorem Picsum / Unsplash License (public/photos/CREDITS.md).
 */
import { createContext, StrictMode, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BarButton,
  ContextMenu,
  Glass,
  GlassAppearanceContext,
  LiquidRoot,
  NavigationStack,
  Screen,
  ScrollView,
  Tab,
  TabView,
  Toast,
  useLiquid,
  ZoomTransition,
  type ScrollViewHandle,
  type GlassHandle,
  type MenuItem,
} from '@liquid-gpu/react';
import DATA from './photos-data.json';
import { StatusBarLayer } from './statusbar';

const q = new URLSearchParams(location.search);

interface Photo {
  id: string;
  w: number;
  h: number;
  /** Image file id when it differs from `id` (a duplicate). */
  file?: string;
}

const GAP = 2;
// Grid: first row at y 136 at the top; at the bottom the last row ends at y 862.67 (native, 10.33 above the tab bar
// platter top 873 at 956 tall).
const GRID_TOP = 136;

const full = (p: Photo) => `/photos/${p.file ?? p.id}.jpg`;
const thumb = (p: Photo) => `/photos/${p.file ?? p.id}_t.jpg`;
const aspectOf = (p: Photo) => p.w / p.h;

/** Viewer photo rect: width-fit, capped at the screen height, centred (PT §4). */
function fit(vw: number, vh: number, a: number) {
  let w = vw;
  let h = vw / a;
  if (h > vh) {
    h = vh;
    w = vh * a;
  }
  return { x: (vw - w) / 2, y: (vh - h) / 2, width: w, height: h };
}

// ---------------------------------------------------------------------------------------------------------------
// Glyphs (SF Symbols redrawn at the measured ink sizes).

const stroke = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** photo.on.rectangle.fill, ink 28.33 × 21.33, top at y 885.33 in the bar (native tab frame: back 22.33 × 18, front 22.33 × 16 at (6, 5.33), gap 1.67). */
function LibraryGlyph() {
  return (
    <svg width={28.33} height={21.33} viewBox="0 0 28.33 21.33" aria-hidden style={{ position: 'relative', top: -0.67 }}>
      <defs>
        <mask id="lq-photos-lib">
          <rect width="28.33" height="21.33" fill="#fff" />
          <rect x="4.33" y="3.67" width="25.67" height="19.33" rx="5.1" fill="#000" />
        </mask>
        <mask id="lq-photos-lib2">
          <rect width="28.33" height="21.33" fill="#fff" />
          <circle cx="12.1" cy="11.2" r="2.15" fill="#000" />
          <path d="M8 19.6l5.2-5.1c.5-.5 1.2-.5 1.7 0l1.6 1.6 3.4-3.5c.5-.5 1.2-.5 1.7 0l4.6 4.7v2.3z" fill="#000" />
        </mask>
      </defs>
      <rect x="0" y="0" width="22.33" height="18" rx="3.7" fill="currentColor" mask="url(#lq-photos-lib)" />
      <rect x="6" y="5.33" width="22.33" height="16" rx="3.5" fill="currentColor" mask="url(#lq-photos-lib2)" />
    </svg>
  );
}

/** rectangle.stack.fill, ink 23.67 × 22.33 from y 884.33 in the bar: bars 1.33 thick at y 0 (x 5…18.67) and y 3 (x 2.67…21), body 16 tall at y 6.33. */
function CollectionsGlyph() {
  return (
    <svg width={23.67} height={22.33} viewBox="0 0 23.67 22.33" fill="currentColor" aria-hidden style={{ position: 'relative', top: -1.67 }}>
      <rect x="5" y="0" width="13.67" height="1.4" rx="0.7" />
      <rect x="2.67" y="3" width="18.33" height="1.4" rx="0.7" />
      <rect x="0" y="6.33" width="23.67" height="16" rx="4" />
    </svg>
  );
}

/** line.3.horizontal.decrease, ink 21.33 × 12.33. */
function FilterGlyph() {
  return (
    <svg width={21.33} height={12.33} viewBox="0 0 21.33 12.33" aria-hidden>
      <g {...stroke} strokeWidth={1.7}>
        <path d="M.85.85h19.63M4.1 6.17h13.13M7.6 11.48h6.13" />
      </g>
    </svg>
  );
}

const Chevron = () => (
  // chevron.backward: ink 11 × 18.67 at x 35 (1.5 left of the circle's centre line).
  <svg width={11} height={18.67} viewBox="0 0 11 18.67" aria-hidden style={{ position: 'relative', left: -1.5 }}>
    <path d="M9.8 1.25L1.25 9.33l8.55 8.09" {...stroke} strokeWidth={2.5} />
  </svg>
);
const Ellipsis = () => (
  <svg width={19.67} height={4} viewBox="0 0 19.67 4" fill="currentColor" aria-hidden>
    <circle cx="2" cy="2" r="2" />
    <circle cx="9.83" cy="2" r="2" />
    <circle cx="17.67" cy="2" r="2" />
  </svg>
);
const ShareGlyph = ({ w = 19, h = 23.67 }: { w?: number; h?: number }) => (
  <svg width={w} height={h} viewBox="0 0 19 23.67" aria-hidden>
    <g {...stroke} strokeWidth={1.75}>
      <path d="M9.5 15.2V1.3M5.2 5.4l4.3-4.3 4.3 4.3" />
      <path d="M6.3 8.7H3.6A2.7 2.7 0 0 0 .9 11.4v8.7a2.7 2.7 0 0 0 2.7 2.7h11.8a2.7 2.7 0 0 0 2.7-2.7v-8.7a2.7 2.7 0 0 0-2.7-2.7h-2.7" />
    </g>
  </svg>
);
const HeartGlyph = ({ filled = false, w = 21.33, h = 18.33 }: { filled?: boolean; w?: number; h?: number }) => (
  <svg width={w} height={h} viewBox="0 0 21.33 18.33" aria-hidden>
    <path
      d="M10.67 17.4C5.4 13.9.9 10.2.9 5.9A5 5 0 0 1 5.9.9c2.1 0 3.8 1.2 4.77 3 .97-1.8 2.67-3 4.77-3a5 5 0 0 1 5 5c0 4.3-4.5 8-9.77 11.5z"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinejoin="round"
    />
  </svg>
);
const InfoGlyph = () => (
  <svg width={21.67} height={21.33} viewBox="0 0 21.67 21.33" aria-hidden>
    <circle cx="10.83" cy="10.67" r="9.75" {...stroke} strokeWidth={1.85} />
    <circle cx="10.83" cy="6.3" r="1.3" fill="currentColor" />
    <path d="M8.9 9.4h2.2v6.4M8.6 15.9h4.6" {...stroke} strokeWidth={1.6} />
  </svg>
);
const AdjustGlyph = () => (
  <svg width={21.67} height={18} viewBox="0 0 21.67 18" aria-hidden>
    <g {...stroke} strokeWidth={1.75}>
      <path d="M.9 3h9.4M16.4 3h4.4M.9 9h3.4M10.4 9h10.4M.9 15h9.4M16.4 15h4.4" />
      <circle cx="13.35" cy="3" r="2.1" />
      <circle cx="7.35" cy="9" r="2.1" />
      <circle cx="13.35" cy="15" r="2.1" />
    </g>
  </svg>
);
const TrashGlyph = ({ w = 20.67, h = 23.67, color }: { w?: number; h?: number; color?: string }) => (
  <svg width={w} height={h} viewBox="0 0 20.67 23.67" aria-hidden style={{ color }}>
    <g {...stroke} strokeWidth={1.75}>
      <path d="M.9 4.6h18.87M7.3 4.4V2.3c0-.8.6-1.4 1.4-1.4h3.3c.8 0 1.4.6 1.4 1.4v2.1" />
      <path d="M2.8 4.8l1.2 15.9c.1 1.2 1 2.1 2.2 2.1h8.3c1.2 0 2.1-.9 2.2-2.1l1.2-15.9" />
      <path d="M7.4 8.6l.4 10.4M10.33 8.6V19M13.3 8.6l-.4 10.4" />
    </g>
  </svg>
);
// Menu icons (rows 14.67–21 ink; accessories slightly larger, PT frame @60 s).
const CopyGlyph = () => (
  <svg width={16.67} height={20.67} viewBox="0 0 16.67 20.67" fill="currentColor" aria-hidden>
    <path d="M5.6 0h5.1c.5 0 1 .2 1.4.6l3.9 3.9c.4.4.6.9.6 1.4v8.6c0 1.4-1.1 2.5-2.5 2.5H5.6c-1.4 0-2.5-1.1-2.5-2.5V2.5C3.1 1.1 4.2 0 5.6 0z" />
    <path d="M1.9 4.6v11.4c0 1.8 1.5 3.3 3.3 3.3h8.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);
const DuplicateGlyph = () => (
  <svg width={17.33} height={17} viewBox="0 0 17.33 17" aria-hidden>
    <defs>
      <mask id="lq-photos-dup">
        <rect width="17.33" height="17" fill="#fff" />
        <path d="M11 7.6v6.1M7.9 10.65h6.2" stroke="#000" strokeWidth={1.6} strokeLinecap="round" />
      </mask>
    </defs>
    <path d="M3.2 12.6H2.9A2 2 0 0 1 .9 10.6V2.9a2 2 0 0 1 2-2h7.7a2 2 0 0 1 2 2v.3" {...stroke} strokeWidth={1.6} />
    <rect x="4.6" y="4.3" width="12.73" height="12.7" rx="2.6" fill="currentColor" mask="url(#lq-photos-dup)" />
  </svg>
);
const HideGlyph = () => (
  <svg width={22.33} height={15} viewBox="0 0 22.33 15" aria-hidden>
    <defs>
      <mask id="lq-photos-hide">
        <rect width="22.33" height="15" fill="#fff" />
        <circle cx="11.17" cy="7.5" r="3.4" fill="#000" />
        <path d="M3.6.6l15.1 13.8" stroke="#000" strokeWidth={3.4} strokeLinecap="round" />
      </mask>
    </defs>
    <path d="M11.17 1C5.6 1 1.9 5.6.9 7.5c1 1.9 4.7 6.5 10.27 6.5s9.27-4.6 10.27-6.5C20.44 5.6 16.74 1 11.17 1z" fill="currentColor" mask="url(#lq-photos-hide)" />
    <path d="M3.6.6l15.1 13.8" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" />
  </svg>
);
const AddToGlyph = () => (
  <svg width={21} height={17.33} viewBox="0 0 21 17.33" aria-hidden>
    <g {...stroke} strokeWidth={1.6}>
      <path d="M3.3 13.3l-.9-.2A2 2 0 0 1 .9 10.7L2.3 3.4A2 2 0 0 1 4.6 1.8l9.6 1.7" />
      <rect x="5.2" y="4.6" width="15" height="12" rx="2.2" />
      <path d="M6.2 15.6l4.1-4c.4-.4 1-.4 1.4 0l1.1 1.1 2.5-2.6c.4-.4 1-.4 1.4 0l3.2 3.3" />
    </g>
    <circle cx="10.3" cy="8.5" r="1.6" fill="currentColor" />
  </svg>
);

// ---------------------------------------------------------------------------------------------------------------

const DATES = ['Today', 'Today', 'Yesterday', 'Yesterday', 'Sunday', 'Saturday', 'Friday', 'Thursday', 'November 11', 'November 9', 'November 2', 'October 28'];
const dateOf = (i: number, n: number) => {
  const k = n - 1 - i; // newest last
  return { day: DATES[Math.min(DATES.length - 1, Math.floor(k / 4))]!, time: `${((k * 7) % 12) + 1}:${String((k * 17) % 60).padStart(2, '0')} ${k % 3 ? 'PM' : 'AM'}` };
};

/**
 * Photos' header over the grid (native iOS 27, deep/photos-header): white with label-coloured text while the grid's
 * first row is below the screen top (offset < 136); once photos are scrolled under it, a dark scrim + variable blur
 * with white text, white bar glyphs and dark glass. The switch is a 0.23 s ease-in-out crossfade (title luminance
 * 0 → 255 over 14 frames at 60 Hz, half-way at 0.115 s). No text shadow (pixels beside the glyphs equal the scrim).
 */
const HEADER_EASE = '0.23s cubic-bezier(0.42, 0, 0.58, 1)';
interface HeaderState {
  dark: boolean;
  setDark(d: boolean): void;
  /** The status bar is white only while the Library tab shows its dark header (no viewer open). */
  setViewerOpen(o: boolean): void;
  setTab(t: string): void;
}
const HeaderContext = createContext<HeaderState>({ dark: false, setDark: () => {}, setViewerOpen: () => {}, setTab: () => {} });

function LibraryHeading({ subtitle, dark }: { subtitle: string; dark: boolean }) {
  // Title box: Bold 34 (lh 40.57, ascent 32.38) with its cap top (ascent − 24) at y 71 → box top 62.6.
  // Subtitle: Semibold 15 (lh 17.9, ascent 14.28) with its baseline at 118.67 → box top 104.4.
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, pointerEvents: 'none', color: dark ? '#fff' : 'var(--lq-label)', transition: `color ${HEADER_EASE}` }}>
      <div style={{ position: 'absolute', left: -0.2, top: 0.6, fontSize: 34, fontWeight: 700, lineHeight: '40.57px', letterSpacing: 0.07, whiteSpace: 'nowrap' }} role="heading" aria-level={1}>
        Library
      </div>
      <div style={{ position: 'absolute', left: 0.27, top: 43.07, fontSize: 15, fontWeight: 600, lineHeight: '17.9px', letterSpacing: -0.2, whiteSpace: 'nowrap' }}>
        {subtitle}
      </div>
    </div>
  );
}

/**
 * Dark header backdrop (native, solid cyan / magenta under the header, 3x): black overlay alpha 0.592 from the top to
 * y 40, then 0.578 @50, 0.555 @60, 0.523 @70, 0.477 @80, 0.408 @90, 0.349 @100, 0.266 @110, 0.188 @120, 0.115 @130,
 * 0.055 @140, 0.032 @145, 0 by ≈155. Under it a backdrop blur, σ ≈ 3 pt down to y 75 (cell-gap edge 10–90 % width
 * 7.3–7.7 pt), σ ≈ 1.4 at y 100, ≈ 0 by y 130 (the white cell gaps show again).
 */
function HeaderScrim({ dark }: { dark: boolean }) {
  const stops = [
    [0, 0.592], [40, 0.592], [50, 0.578], [60, 0.555], [70, 0.523], [80, 0.477], [90, 0.408], [100, 0.349],
    [110, 0.266], [120, 0.188], [130, 0.115], [140, 0.055], [145, 0.032], [156, 0],
  ];
  const grad = `linear-gradient(to bottom, ${stops.map(([y, a]) => `rgba(0,0,0,${a}) ${y}px`).join(', ')})`;
  const mask = 'linear-gradient(to bottom, #000 0, #000 75px, rgba(0,0,0,0.45) 100px, transparent 130px)';
  return (
    <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 156, pointerEvents: 'none', zIndex: 2, opacity: dark ? 1 : 0, transition: `opacity ${HEADER_EASE}` }}>
      <div style={{ position: 'absolute', inset: 0, backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', maskImage: mask, WebkitMaskImage: mask }} />
      <div style={{ position: 'absolute', inset: 0, background: grad }} />
    </div>
  );
}

/** Subtitle at rest: the top row's date; at the very bottom the photo count (native: "18 ნოე. 2026" / "57 Photos"). */
const dayOf = (i: number, n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - Math.floor((n - 1 - i) / 4));
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function Grid({
  photos,
  favs,
  cellRefs,
  onOpen,
  onCommit,
  onMenu,
}: {
  photos: Photo[];
  favs: Set<string>;
  cellRefs: RefObject<Map<string, HTMLDivElement>>;
  onOpen(i: number): void;
  onCommit(i: number): void;
  onMenu(i: number, item: MenuItem): void;
}) {
  const { viewport } = useLiquid();
  const vw = viewport.width;
  const vh = viewport.height;
  return (
    // Three columns edge to edge: (width − 2 × 2) / 3 (145.33 at 440 wide, 129.67 at 393).
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: GAP, width: '100%' }}>
      {photos.map((p, i) => {
        const a = aspectOf(p);
        const D = fit(vw, vh, a);
        const fav = favs.has(p.id);
        return (
          <ContextMenu
            key={p.id}
            aria-label={`Photo ${i + 1}`}
            style={{ width: '100%', aspectRatio: '1' }}
            preview={<img src={full(p)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />}
            previewAspect={a}
            // Photos caps the preview height at the screen width (native 3:4 → 330 × 440 on 440 × 956; deep/ctxmenu-fit).
            previewMaxHeight={vw}
            commitDestination={
              <div style={{ position: 'absolute', inset: 0, width: vw, height: vh, background: 'var(--lq-system-background)' }}>
                <img src={full(p)} alt="" draggable={false} style={{ position: 'absolute', left: D.x, top: D.y, width: D.width, height: D.height, display: 'block' }} />
              </div>
            }
            onPreviewCommit={() => onCommit(i)}
            accessories={[
              { id: 'copy', title: 'Copy', icon: <CopyGlyph /> },
              { id: 'duplicate', title: 'Duplicate', icon: <DuplicateGlyph /> },
              { id: 'hide', title: 'Hide', icon: <HideGlyph /> },
            ]}
            items={[
              [
                { id: 'share', title: 'Share', icon: <ShareGlyph w={14.67} h={18.67} /> },
                { id: 'favorite', title: fav ? 'Unfavorite' : 'Favorite', icon: <HeartGlyph filled={fav} w={16.33} h={15} /> },
              ],
              [
                { id: 'add', title: 'Add To', icon: <AddToGlyph />, submenu: true },
                { id: 'adjust', title: 'Adjust Info', icon: <InfoGlyph />, submenu: true },
              ],
              [{ id: 'delete', title: 'Delete', icon: <TrashGlyph w={15.67} h={18} />, destructive: true }],
            ]}
            onSelect={(item) => onMenu(i, item)}
          >
            <div
              ref={(el) => {
                if (el) cellRefs.current.set(p.id, el);
                else cellRefs.current.delete(p.id);
              }}
              role="button"
              tabIndex={0}
              aria-label={`Open photo ${i + 1}`}
              data-testid={`cell-${i}`}
              onClick={() => onOpen(i)}
              onKeyDown={(e) => e.key === 'Enter' && onOpen(i)}
              style={{ width: '100%', aspectRatio: '1', overflow: 'hidden', cursor: 'pointer', background: 'var(--lq-secondary-system-background)' }}
            >
              <img src={thumb(p)} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
            </div>
          </ContextMenu>
        );
      })}
    </div>
  );
}

/** A glass button of the one-up chrome, placed absolutely; opacity driven by the transition. */
function ChromeGlass({
  x,
  y,
  w,
  h,
  label,
  onPress,
  handles,
  children,
  interactive = true,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  onPress?(): void;
  handles: RefObject<Set<GlassHandle>>;
  children: ReactNode;
  interactive?: boolean;
}) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, pointerEvents: 'auto' }}>
      <Glass
        ref={(g) => {
          if (g) handles.current.add(g);
        }}
        as={onPress ? 'button' : 'div'}
        interactive={interactive}
        radius={h / 2}
        aria-label={label}
        onClick={onPress}
        contentStyle={{ width: w, height: h, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--lq-label)', borderRadius: h / 2 }}
      >
        {children}
      </Glass>
    </div>
  );
}

function OneUpChrome({
  photos,
  index,
  fav,
  onBack,
  onSelect,
  onFav,
  onDelete,
  handles,
}: {
  photos: Photo[];
  index: number;
  fav: boolean;
  onBack(): void;
  onSelect(i: number): void;
  onFav(): void;
  onDelete(): void;
  handles: RefObject<Set<GlassHandle>>;
}) {
  const { viewport } = useLiquid();
  const vw = viewport.width;
  const vh = viewport.height;
  const mid = vw / 2;
  const { day, time } = dateOf(index, photos.length);
  // Filmstrip: 20 × 30 at a 23 pt pitch; the current item at its aspect (h 30) with 13 pt either side, centred on 220.
  const cur = photos[index]!;
  const cw = Math.min(60, Math.max(20, 30 * aspectOf(cur)));
  const strip: { p: Photo; i: number; x: number; w: number }[] = [];
  let x = mid + cw / 2 + 13;
  for (let i = index + 1; i < photos.length && x < vw + 20; i++, x += 23) strip.push({ p: photos[i]!, i, x, w: 20 });
  x = mid - cw / 2 - 13 - 20;
  for (let i = index - 1; i >= 0 && x > -40; i--, x -= 23) strip.push({ p: photos[i]!, i, x, w: 20 });
  strip.push({ p: cur, i: index, x: mid - cw / 2, w: cw });
  // Native 440 × 956 positions, anchored to the nearest edge: top row y 62, filmstrip vh − 125, bottom bar vh − 76.
  const filmY = vh - 125;
  const barY = vh - 76;
  return (
    // Full-screen chrome box: transparent to the swipe; buttons and the filmstrip opt back in.
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <ChromeGlass x={20} y={62} w={44} h={44} label="Back" onPress={onBack} handles={handles}>
        <Chevron />
      </ChromeGlass>
      <ChromeGlass x={mid - 80} y={62} w={160} h={44} handles={handles} interactive={false}>
        {/* Title Semibold 15 (lh 17.9) at y 67.67, time Regular 11 (lh 13.13) baseline 97.33 (BR §1.5 subtitle stack). */}
        <div style={{ textAlign: 'center', marginTop: -2 }}>
          <div style={{ fontSize: 15, fontWeight: 600, lineHeight: '17.9px', letterSpacing: -0.2 }}>{day}</div>
          <div style={{ fontSize: 11, lineHeight: '13.13px', marginTop: 1.6, letterSpacing: 0.1 }}>{time}</div>
        </div>
      </ChromeGlass>
      <ChromeGlass x={vw - 64} y={62} w={44} h={44} label="More" handles={handles}>
        <Ellipsis />
      </ChromeGlass>
      <div style={{ position: 'absolute', left: 0, top: filmY, width: vw, height: 30, overflow: 'hidden', pointerEvents: 'auto' }} aria-label="Filmstrip">
        {strip.map((s) => (
          <img
            key={s.p.id}
            src={thumb(s.p)}
            alt=""
            draggable={false}
            onClick={() => onSelect(s.i)}
            style={{ position: 'absolute', left: s.x, top: 0, width: s.w, height: 30, objectFit: 'cover', cursor: 'pointer' }}
          />
        ))}
      </div>
      <ChromeGlass x={28} y={barY} w={48} h={48} label="Share" handles={handles}>
        <ShareGlyph />
      </ChromeGlass>
      <ChromeGlass x={mid - 81.33} y={barY} w={163.33} h={48} handles={handles} interactive>
        {/* Glyph centres at 26.67 / 81.17 / 135.83 in the capsule (native heart 165.33, info 219.83, adjust 274.5). */}
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {(
            [
              [26.67, fav ? 'Unfavorite' : 'Favorite', <HeartGlyph key="h" filled={fav} />, onFav],
              [81.17, 'Info', <InfoGlyph key="i" />, undefined],
              [135.83, 'Edit', <AdjustGlyph key="a" />, undefined],
            ] as const
          ).map(([cx, label, glyph, press]) => (
            <button
              key={label}
              type="button"
              aria-label={label}
              onClick={press}
              style={{ all: 'unset', position: 'absolute', left: cx - 22, top: 2, width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
            >
              {glyph}
            </button>
          ))}
        </div>
      </ChromeGlass>
      <ChromeGlass x={vw - 76} y={barY} w={48} h={48} label="Delete" onPress={onDelete} handles={handles}>
        <TrashGlyph />
      </ChromeGlass>
    </div>
  );
}

function Library() {
  const [photos, setPhotos] = useState<Photo[]>(DATA as Photo[]);
  const [favs, setFavs] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<{ id: string; immediate: boolean } | null>(() => {
    const o = q.get('open');
    const p = o !== null ? (DATA as Photo[])[Number(o)] : undefined;
    return p ? { id: p.id, immediate: false } : null;
  });
  const [toast, setToast] = useState<string | null>(null);
  const header = useContext(HeaderContext);
  const { viewport } = useLiquid();
  const scrollRef = useRef<ScrollViewHandle | null>(null);
  const [topRow, setTopRow] = useState(-1); // -1: at the bottom (count), else the row under the header
  const pitch = (viewport.width - 2 * GAP) / 3 + GAP;
  const onScroll = (offset: number) => {
    const dark = offset >= GRID_TOP - 0.5; // the first row has passed the screen top
    if (dark !== header.dark) header.setDark(dark);
    const max = scrollRef.current?.physics.bounds.max ?? Infinity;
    const row = offset >= max - 1 ? -1 : Math.max(0, Math.floor(offset / pitch));
    if (row !== topRow) setTopRow(row);
  };
  // Photos opens at the newest photos (the bottom of the library).
  useEffect(() => {
    if (q.has('top')) return;
    let n = 0;
    const tick = () => {
      const h = scrollRef.current;
      if (h && h.physics.bounds.max > 0) h.scrollTo(h.physics.bounds.max, false);
      else if (n++ < 30) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, []);
  useEffect(() => header.setViewerOpen(open !== null), [open, header]);
  const subtitle = topRow < 0 ? `${photos.length} Photos` : dayOf(Math.min(photos.length - 1, topRow * 3), photos.length);
  const cellRefs = useRef(new Map<string, HTMLDivElement>());
  const srcRef = useRef<HTMLDivElement | null>(null);
  const handles = useRef(new Set<GlassHandle>());
  const last = useRef<string | null>(open?.id ?? null);
  if (open) last.current = open.id;
  const shownId = open?.id ?? last.current;
  const index = Math.max(0, photos.findIndex((p) => p.id === shownId));
  const shown = photos[index];
  srcRef.current = shown ? (cellRefs.current.get(shown.id) ?? null) : null;

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__photos = {
      open: (i: number) => setOpen({ id: photos[i]!.id, immediate: false }),
      close: () => setOpen(null),
      scrollTo: (o: number, animated = false) => scrollRef.current?.scrollTo(o, animated),
      offset: () => scrollRef.current?.offset,
    };
    document.documentElement.dataset.ready = '1';
  }, [photos]);

  const toggleFav = (id: string) =>
    setFavs((f) => {
      const n = new Set(f);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const remove = (id: string) => setPhotos((ps) => ps.filter((p) => p.id !== id));

  return (
    <Screen
      background="plain"
      scrollEdge={header.dark ? 'none' : 'automatic'}
      leading={<LibraryHeading subtitle={subtitle} dark={header.dark} />}
      trailing={
        <GlassAppearanceContext.Provider value={header.dark ? 'dark' : undefined}>
          <BarButton icon={<FilterGlyph />} aria-label="Filter" style={{ color: header.dark ? '#fff' : undefined, transition: `color ${HEADER_EASE}` }} />
          <BarButton label="Select" style={{ color: header.dark ? '#fff' : undefined, transition: `color ${HEADER_EASE}` }} />
        </GlassAppearanceContext.Provider>
      }
    >
      <HeaderScrim dark={header.dark} />
      <ScrollView ref={scrollRef} aria-label="Library" contentInset={{ top: GRID_TOP - 116, bottom: 10.33 }} onScroll={onScroll}>
        <Grid
          photos={photos}
          favs={favs}
          cellRefs={cellRefs}
          onOpen={(i) => setOpen({ id: photos[i]!.id, immediate: false })}
          onCommit={(i) => setOpen({ id: photos[i]!.id, immediate: true })}
          onMenu={(i, item) => {
            const p = photos[i]!;
            if (item.id === 'favorite') toggleFav(p.id);
            else if (item.id === 'delete' || item.id === 'hide') remove(p.id);
            else if (item.id === 'duplicate') setPhotos((ps) => [...ps.slice(0, i + 1), { ...p, id: `${p.id}~${Date.now()}`, file: p.file ?? p.id }, ...ps.slice(i + 1)]);
            else if (item.id === 'copy') setToast('Copied');
          }}
        />
      </ScrollView>
      {shown && (
        <ZoomTransition
          isPresented={open !== null}
          sourceRef={srcRef}
          mode="tile"
          immediate={open?.immediate}
          aspect={aspectOf(shown)}
          paging={{
            key: shown.id,
            prev: photos[index - 1] ? { aspect: aspectOf(photos[index - 1]!), content: <img src={full(photos[index - 1]!)} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} /> } : null,
            next: photos[index + 1] ? { aspect: aspectOf(photos[index + 1]!), content: <img src={full(photos[index + 1]!)} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} /> } : null,
            onPage: (d) => {
              const n = photos[index + d];
              if (n) setOpen({ id: n.id, immediate: true });
            },
          }}
          background="var(--lq-system-background)"
          onDismiss={() => setOpen(null)}
          onChromeOpacity={(o) => {
            for (const h of handles.current) {
              if (h.shape) h.shape.opacity = o;
              if (h.layer) {
                h.layer.opacity = o;
                h.layer.visible = o > 0.001;
              }
              if (h.shape) h.shape.visible = o > 0.001;
            }
          }}
          overlay={
            <OneUpChrome
              photos={photos}
              index={index}
              fav={favs.has(shown.id)}
              handles={handles}
              onBack={() => setOpen(null)}
              onSelect={(i) => setOpen({ id: photos[i]!.id, immediate: true })}
              onFav={() => toggleFav(shown.id)}
              onDelete={() => {
                const next = photos[index + 1] ?? photos[index - 1];
                remove(shown.id);
                setOpen(next ? { id: next.id, immediate: true } : null);
              }}
            />
          }
          aria-label="Photo"
        >
          <img src={full(shown)} alt="" draggable={false} style={{ width: '100%', height: '100%', display: 'block' }} />
        </ZoomTransition>
      )}
      <Toast isPresented={toast !== null} onDismiss={() => setToast(null)}>
        {toast}
      </Toast>
    </Screen>
  );
}

function Collections() {
  const photos = DATA as Photo[];
  const albums = useMemo(
    () => [
      ['Recents', 0],
      ['Favorites', 7],
      ['Landscapes', 11],
      ['Travel', 4],
      ['Details', 21],
      ['Golden Hour', 15],
    ] as const,
    [],
  );
  return (
    <Screen title="Collections" largeTitle background="plain">
      <ScrollView aria-label="Collections">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '18px 12px', padding: '4px 20px 24px' }}>
          {albums.map(([name, i]) => (
            <div key={name}>
              <img src={thumb(photos[i]!)} alt="" draggable={false} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 16, display: 'block' }} />
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 7, color: 'var(--lq-label)' }}>{name}</div>
              <div style={{ fontSize: 15, color: 'var(--lq-secondary-label)' }}>{(i * 37) % 300 + 12}</div>
            </div>
          ))}
        </div>
      </ScrollView>
    </Screen>
  );
}

function App() {
  const [tab, setTab] = useState(q.get('tab') ?? 'library');
  const header = useContext(HeaderContext);
  useEffect(() => header.setTab(tab), [tab, header]);
  const [text, setText] = useState('');
  return (
    <TabView selection={tab} onSelectionChange={setTab} searchText={text} onSearchTextChange={setText}>
      <Tab id="library" label="Library" icon={<LibraryGlyph />}>
        <NavigationStack>
          <Library />
        </NavigationStack>
      </Tab>
      <Tab id="collections" label="Collections" icon={<CollectionsGlyph />}>
        <NavigationStack>
          <Collections />
        </NavigationStack>
      </Tab>
      <Tab id="search" role="search">
        <div style={{ position: 'absolute', inset: 0, background: 'var(--lq-system-background)' }} />
      </Tab>
    </TabView>
  );
}

function Page() {
  const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
  const safeArea = q.has('desktop') ? undefined : { top: 62, bottom: 34 };
  const [dark, setDark] = useState(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [tab, setTab] = useState('library');
  const header = useMemo(() => ({ dark, setDark, setViewerOpen, setTab }), [dark]);
  const whiteStatus = dark && !viewerOpen && tab === 'library';
  return (
    <LiquidRoot appearance={appearance} safeArea={safeArea} style={{ background: 'var(--lq-system-background)' }}>
      <HeaderContext.Provider value={header}>
        <App />
      </HeaderContext.Provider>
      {/* White over the dark header scrim (Library tab only). */}
      <StatusBarLayer color={whiteStatus ? '#fff' : undefined} />
    </LiquidRoot>
  );
}

export function mount(el: HTMLElement): void {
  createRoot(el).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
