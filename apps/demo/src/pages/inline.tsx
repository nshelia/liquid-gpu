/**
 * Inline roots: a scrolling chat-like page with several `<LiquidRoot mode="inline">` embedded in normal document flow.
 * Each root holds a glass Button, Switch, Slider, Menu, Popover, Alert and Toast. Roots past `maxGpuRoots` (4) use the
 * CSS renderer; two roots carry a `theme` override. Open `/inline.html` (`?dark`, `?light`, `?fallback`).
 * Each message writes its state to `[data-status]` below the root (read by smoke scripts).
 */
import { StrictMode, useRef, useState, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { Alert, Button, LiquidRoot, Menu, Popover, Slider, Switch, Toast, type ThemeOverrides } from '@liquid-gpu/react';

const q = new URLSearchParams(location.search);
const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
const dark = appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);

const THEMES: Record<number, ThemeOverrides> = {
  1: { tint: '#FF2D55', fontFamily: 'Georgia, "Times New Roman", serif' },
  3: { tint: '#34C759', fontFamily: '"Courier New", Courier, monospace', radiusScale: 0.5 },
};

const PHOTOS = ['/photos/10.jpg', '/photos/102_t.jpg', '/photos/10_t.jpg'];

function Message({ index }: { index: number }) {
  const [on, setOn] = useState(index % 2 === 0);
  const [value, setValue] = useState(0.3 + 0.1 * index);
  const [flavor, setFlavor] = useState('none');
  const [taps, setTaps] = useState(0);
  const [popover, setPopover] = useState(false);
  const [alert, setAlert] = useState(false);
  const [toast, setToast] = useState(false);
  const [last, setLast] = useState('');
  const anchor = useRef<HTMLSpanElement | null>(null);
  const theme = THEMES[index];
  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' };
  return (
    <article data-msg={index} style={{ margin: '0 12px 28px' }}>
      <p style={{ margin: '0 8px 6px', font: '13px system-ui', color: dark ? '#8e8e93' : '#6c6c70' }}>
        Assistant · message {index + 1}
        {theme ? ` · themed ${theme.tint}` : ''}
      </p>
      <div style={{ height: 260, borderRadius: 24, overflow: 'hidden' }}>
        <LiquidRoot mode="inline" appearance={appearance} theme={theme}>
          <div
            style={{
              height: '100%',
              boxSizing: 'border-box',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
              background: `center / cover url(${PHOTOS[index % PHOTOS.length]})`,
              fontFamily: 'var(--lq-font)',
            }}
          >
            <div style={{ ...row, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,.6)', fontSize: 20, fontWeight: 600 }}>Card {index + 1}</div>
            <div style={row}>
              <Button variant="glass" onClick={() => (setTaps((t) => t + 1), setLast('glass'))}>
                Glass {taps}
              </Button>
              <Switch isOn={on} onChange={(v) => (setOn(v), setLast('switch'))} aria-label={`Switch ${index + 1}`} />
              <Menu
                label="Menu"
                aria-label={`Menu ${index + 1}`}
                items={['Chocolate', 'Vanilla', 'Mint'].map((t) => ({ title: t, checked: flavor === t, onSelect: () => (setFlavor(t), setLast('menu')) }))}
              />
            </div>
            <div style={{ ...row, background: 'var(--lq-secondary-system-grouped-background)', borderRadius: 16, padding: '8px 12px' }}>
              <span style={{ color: 'var(--lq-label)', fontSize: 15 }}>Level</span>
              <div style={{ flex: 1 }}>
                <Slider value={value} onChange={(v) => (setValue(v), setLast('slider'))} aria-label={`Slider ${index + 1}`} />
              </div>
            </div>
            <div style={row}>
              <span ref={anchor} style={{ display: 'inline-block' }}>
                <Button variant="tinted" onClick={() => (setPopover(true), setLast('popover'))}>
                  Popover
                </Button>
              </span>
              <Button variant="filled" onClick={() => (setAlert(true), setLast('alert'))}>
                Alert
              </Button>
              <Button variant="gray" onClick={() => (setToast(true), setLast('toast'))}>
                Toast
              </Button>
            </div>
          </div>
          <Popover isPresented={popover} anchor={anchor} onDismiss={() => setPopover(false)} aria-label="Popover">
            <div style={{ padding: 16, color: 'var(--lq-label)', fontFamily: 'var(--lq-font)' }}>Popover of card {index + 1}</div>
          </Popover>
          <Alert
            isPresented={alert}
            title={`Alert ${index + 1}`}
            message="Inline root overlay."
            actions={[{ title: 'Cancel', role: 'cancel' }, { title: 'OK', preferred: true, onPress: () => setLast('alert-ok') }]}
            onDismiss={() => setAlert(false)}
          />
          <Toast isPresented={toast} onDismiss={() => setToast(false)} duration={1.5}>
            Toast from card {index + 1}
          </Toast>
        </LiquidRoot>
      </div>
      <p data-status style={{ margin: '6px 8px 0', font: '12px ui-monospace, monospace', color: dark ? '#8e8e93' : '#6c6c70' }}>
        taps={taps} on={String(on)} value={value.toFixed(2)} flavor={flavor} last={last}
      </p>
    </article>
  );
}

function Page() {
  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '24px 0 200px', background: dark ? '#000' : '#fff', minHeight: '100vh' }}>
      <h1 style={{ font: '700 28px system-ui', margin: '0 20px 20px', color: dark ? '#fff' : '#000' }}>Inline roots</h1>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i}>
          <p style={{ margin: '0 20px 16px', font: '16px/1.4 system-ui', color: dark ? '#ddd' : '#222' }}>
            User: show me card {i + 1}. Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.
          </p>
          <Message index={i} />
        </div>
      ))}
    </main>
  );
}

export function mount(el: HTMLElement): void {
  document.body.style.background = dark ? '#000' : '#fff';
  createRoot(el).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
