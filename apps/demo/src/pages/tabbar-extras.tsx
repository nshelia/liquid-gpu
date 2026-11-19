/**
 * Tab bar extras: `Tab role="search"`, `Tab role="prominent"` and `bottomAccessory` (+ minimize on scroll).
 * Open `/tabbar-extras.html?variant=search|prominent|accessory` (`&dark`, `&sel=<tab id>`, `&min=0` to keep the
 * accessory bar from minimizing). Mirrors the native probe in uikit-internals/deep/demo-audit/tabbar-extras/src.
 * Registers `window.__tabx = { select(id), ctx }` for the pixel/motion scripts.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { GearIcon, HouseFill, LiquidRoot, NavigationStack, Screen, ScrollView, useLiquid } from '@liquid-gpu/react';
import { Tab, TabView } from '../../../../packages/react/src/tabbar/TabView';
import { PlusGlyph } from '../../../../packages/react/src/tabbar/glyphs';

const q = new URLSearchParams(location.search);
const variant = (q.get('variant') ?? 'search') as 'search' | 'prominent' | 'accessory';

/** books.vertical.fill, 24 × 21.33 in a 33.33 × 29.33 box. */
function BooksFill() {
  return (
    <svg width={24} height={21.33} viewBox="0 0 24 21.33" fill="currentColor" aria-hidden>
      <rect x="0.6" y="2.2" width="4.9" height="19" rx="1.2" />
      <rect x="6.6" y="2.2" width="5.6" height="19" rx="1.2" />
      <rect x="13.2" y="0" width="4.9" height="21.2" rx="1.2" />
      <path d="M18.6 2.6c.3-.6 1-.8 1.5-.6l.6.2c.6.2.9.8.8 1.4l-2.3 16.9c-.1.6-.6 1-1.2 1h-.4c-.5 0-.8-.5-.7-1z" />
      <rect x="2" y="7" width="2" height="1" rx=".5" fill="var(--lq-system-background)" />
      <rect x="8.4" y="7" width="2" height="1" rx=".5" fill="var(--lq-system-background)" />
      <rect x="8.4" y="16" width="2" height="1" rx=".5" fill="var(--lq-system-background)" />
    </svg>
  );
}

function MusicNote() {
  return (
    <svg width={10.33} height={17} viewBox="0 0 10.33 17" fill="currentColor" aria-hidden>
      <path d="M5.2 1.1C5.2.5 5.7 0 6.3.2l3.3.9c.5.1.7.5.7 1v1.6c0 .6-.5 1-1.1.9L7.2 4v9.6C7.2 15.6 5.7 17 3.6 17 1.6 17 0 15.8 0 14.3s1.6-2.7 3.6-2.7c.6 0 1.1.1 1.6.3z" />
    </svg>
  );
}

function PlayFill() {
  return (
    <svg width={12.67} height={14} viewBox="0 0 12.67 14" fill="currentColor" aria-hidden>
      <path d="M0 1.2C0 .3 1 -.3 1.8.2l10.2 5.8c.8.4.8 1.6 0 2L1.8 13.8C1 14.3 0 13.7 0 12.8z" />
    </svg>
  );
}

function Grouped() {
  return <div style={{ position: 'absolute', inset: 0, background: 'var(--lq-system-grouped-background)' }} />;
}

/** Native `Cards`: 40 cells, 72 tall, 12 apart, 16 from the edges, secondarySystemGroupedBackground. */
function Cards() {
  return (
    <NavigationStack>
      <Screen hideNavBar background="grouped" aria-label="Cards">
        <ScrollView aria-label="Cards">
          <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 40 }, (_, i) => (
              <div key={i} style={{ height: 72, background: 'var(--lq-secondary-system-grouped-background)', flex: 'none' }} />
            ))}
          </div>
        </ScrollView>
      </Screen>
    </NavigationStack>
  );
}

function MiniPlayer() {
  return (
    <>
      {/* TX: music.note drawn at x 39 in a 14.33 box from 37, label at 59.33. */}
      <span style={{ marginLeft: 2, display: 'flex' }}>
        <MusicNote />
      </span>
      <span style={{ marginLeft: 10, fontSize: 17, lineHeight: '20.33px' }}>Now Playing</span>
      <span style={{ flex: 1 }} />
      <PlayFill />
    </>
  );
}

function Demo() {
  const [sel, setSel] = useState(q.get('sel') ?? 'home');
  const [text, setText] = useState('');
  const ctx = useLiquid();
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__tabx = { select: setSel, ctx };
    document.documentElement.dataset.ready = '1';
  }, [ctx]);
  if (variant === 'accessory')
    return (
      <TabView selection={sel} onSelectionChange={setSel} bottomAccessory={<MiniPlayer />} minimizeBehavior={q.get('min') === '0' ? 'never' : 'onScrollDown'}>
        <Tab id="home" label="Home" icon={<HouseFill />}>
          <Cards />
        </Tab>
        <Tab id="library" label="Library" icon={<BooksFill />}>
          <Grouped />
        </Tab>
        <Tab id="settings" label="Settings" icon={<GearIcon />}>
          <Grouped />
        </Tab>
      </TabView>
    );
  return (
    <TabView selection={sel} onSelectionChange={setSel} searchText={text} onSearchTextChange={setText}>
      <Tab id="home" label="Home" icon={<HouseFill />}>
        <Grouped />
      </Tab>
      <Tab id="library" label="Library" icon={<BooksFill />}>
        <Grouped />
      </Tab>
      {variant === 'prominent' ? (
        <Tab id="new" label="New" icon={<PlusGlyph />} role="prominent">
          <Grouped />
        </Tab>
      ) : (
        <Tab id="search" role="search">
          <Grouped />
        </Tab>
      )}
    </TabView>
  );
}

function Page() {
  const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
  return (
    <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }} style={{ background: 'var(--lq-system-grouped-background)' }}>
      <Demo />
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
