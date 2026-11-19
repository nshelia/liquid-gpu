/** Menus, overlays and transitions showcase sections. */
import { useRef, useState } from 'react';
import {
  ActionSheet,
  Alert,
  Button,
  ContextMenu,
  GlassCardButton,
  Menu,
  Popover,
  SegmentedControl,
  Toast,
  ZoomTransition,
  type MenuItem,
} from '@liquid-gpu/react';
import { Section } from './controls';

const icon = (d: string) => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
export const icons = {
  copy: icon('M7 7h9v10H7zM4 13V3h9'),
  share: icon('M10 2v11M6 6l4-4 4 4M4 10v8h12v-8'),
  heart: icon('M10 17s-7-4.3-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 17 8c0 4.7-7 9-7 9z'),
  trash: icon('M4 5h12M8 5V3h4v2M6 5l1 12h6l1-12'),
};

/** Deterministic "photo" tiles (gradients), so the demo needs no image assets. */
export const photoColors = [
  ['#ff8d28', '#ff2d55'],
  ['#34c759', '#00c3d0'],
  ['#0088ff', '#6155f5'],
  ['#cb30e0', '#ff2d55'],
  ['#ffcc00', '#ff8d28'],
  ['#00c8b3', '#0088ff'],
  ['#ac7f5e', '#ff8d28'],
  ['#6155f5', '#cb30e0'],
  ['#ff383c', '#ffcc00'],
] as const;
export function Photo({ i, style }: { i: number; style?: React.CSSProperties }) {
  const [a, b] = photoColors[i % photoColors.length]!;
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.55), rgba(255,255,255,0) 40%), linear-gradient(145deg, ${a}, ${b})`,
        ...style,
      }}
    />
  );
}

function Menus({ log }: { log: (s: string) => void }) {
  const [sort, setSort] = useState('date');
  const items: MenuItem[][] = [
    [
      { id: 'copy', title: 'Copy', icon: icons.copy },
      { id: 'share', title: 'Share', icon: icons.share },
      { id: 'fav', title: 'Favorite', icon: icons.heart },
    ],
    [{ id: 'delete', title: 'Delete', icon: icons.trash, destructive: true }],
  ];
  const sortItems: MenuItem[] = ['date', 'name', 'size'].map((k) => ({
    id: k,
    title: k[0]!.toUpperCase() + k.slice(1),
    checked: sort === k,
    onSelect: () => setSort(k),
  }));
  return (
    <>
      <Section id="menu" title="Menu" colorful>
        <Menu label="Actions" items={items} onSelect={(i) => log(`menu:${i.id}`)} aria-label="Actions" />
        <Menu label={`Sort: ${sort}`} items={sortItems} variant="gray" onSelect={(i) => log(`sort:${i.id}`)} />
      </Section>
      <Section id="context-menu" title="Context menu (long-press)">
        {[0, 1, 2].map((i) => (
          <ContextMenu
            key={i}
            items={items}
            onSelect={(it) => log(`ctx${i}:${it.id}`)}
            preview={i === 2 ? <Photo i={i} /> : undefined}
            previewAspect={i === 2 ? 4 / 3 : undefined}
            onPreviewCommit={i === 2 ? () => log('commit') : undefined}
            commitDestination={i === 2 ? <Photo i={i} /> : undefined}
            aria-label={`Photo ${i + 1}`}
            style={{ width: 110, height: 110, borderRadius: 14, overflow: 'hidden' }}
          >
            <div data-testid={`ctx-${i}`} style={{ width: 110, height: 110 }}>
              <Photo i={i} />
            </div>
          </ContextMenu>
        ))}
      </Section>
    </>
  );
}

export function extraShowcase() {
  return <Extra />;
}

function Overlays({ log }: { log: (s: string) => void }) {
  const [alert, setAlert] = useState(false);
  const [alert3, setAlert3] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [toast, setToast] = useState(false);
  const [pop, setPop] = useState(false);
  const popRef = useRef<HTMLSpanElement | null>(null);
  return (
    <Section id="overlays" title="Alerts and overlays" colorful>
      <Button variant="glass" onClick={() => setAlert(true)} aria-label="Show alert">Alert</Button>
      <Button variant="glass" onClick={() => setAlert3(true)}>3 actions</Button>
      <Button variant="glass" onClick={() => setSheet(true)}>Action sheet</Button>
      <Button variant="glass" onClick={() => setToast(true)}>Toast</Button>
      <span ref={popRef} style={{ display: 'inline-block' }}>
        <Button variant="glass" onClick={() => setPop(true)}>Popover</Button>
      </span>
      <Alert
        isPresented={alert}
        title="Allow notifications?"
        message="Notifications may include alerts, sounds and icon badges."
        actions={[
          { title: "Don't Allow", role: 'cancel', onPress: () => log('alert:cancel') },
          { title: 'Allow', preferred: true, onPress: () => log('alert:allow') },
        ]}
        onDismiss={() => setAlert(false)}
      />
      <Alert
        isPresented={alert3}
        title="Delete photo?"
        message="This photo will be deleted from all your devices."
        actions={[
          { title: 'Delete', role: 'destructive', onPress: () => log('alert3:delete') },
          { title: 'Keep', onPress: () => log('alert3:keep') },
          { title: 'Cancel', role: 'cancel', onPress: () => log('alert3:cancel') },
        ]}
        onDismiss={() => setAlert3(false)}
      />
      <ActionSheet
        isPresented={sheet}
        title="Photo"
        actions={[
          { title: 'Save to Files', onPress: () => log('sheet:save') },
          { title: 'Duplicate', onPress: () => log('sheet:dup') },
          { title: 'Delete', role: 'destructive', onPress: () => log('sheet:delete') },
          { title: 'Cancel', role: 'cancel' },
        ]}
        onDismiss={() => setSheet(false)}
      />
      <Toast isPresented={toast} onDismiss={() => setToast(false)} icon={icons.heart}>
        Added to Favorites
      </Toast>
      <Popover isPresented={pop} anchor={popRef} onDismiss={() => setPop(false)} aria-label="Info">
        <div style={{ padding: 20 }} className="lq-body">
          <div className="lq-headline" style={{ fontWeight: 590, marginBottom: 6 }}>Popover</div>
          Anchored glass panel with a 13 pt arrow gap.
        </div>
      </Popover>
    </Section>
  );
}

function Zoom({ log }: { log: (s: string) => void }) {
  const [mode, setMode] = useState<'zoom' | 'tile'>('zoom');
  const [open, setOpen] = useState<number | null>(null);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const src = useRef<HTMLDivElement | null>(null);
  const last = useRef(0);
  if (open !== null) last.current = open;
  src.current = refs.current[last.current] ?? null;
  return (
    <Section id="zoom" title="Zoom transition (tap, swipe down)">
      <SegmentedControl
        aria-label="Zoom mode"
        selection={mode}
        onChange={setMode}
        segments={[
          { value: 'zoom', label: '.zoom' },
          { value: 'tile', label: 'Photos' },
        ]}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2, width: '100%' }}>
        {photoColors.map((_, i) => (
          <div
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            data-testid={`thumb-${i}`}
            role="button"
            aria-label={`Open photo ${i + 1}`}
            tabIndex={0}
            onClick={() => {
              setOpen(i);
              log(`zoom:open${i}`);
            }}
            style={{ aspectRatio: '1', borderRadius: mode === 'zoom' ? 8 : 0, overflow: 'hidden', cursor: 'pointer' }}
          >
            <Photo i={i} />
          </div>
        ))}
      </div>
      <ZoomTransition
        isPresented={open !== null}
        sourceRef={src}
        mode={mode}
        aspect={3 / 4}
        onDismiss={() => {
          log('zoom:dismiss');
          setOpen(null);
        }}
        aria-label="Photo viewer"
      >
        <Photo i={last.current} />
      </ZoomTransition>
    </Section>
  );
}

function GlassCard() {
  return (
    <Section id="glass-card" title="Glass button → full-screen card" colorful>
      <GlassCardButton variant="glass" label="Compose" aria-label="Compose">
        {(close) => (
          <div style={{ padding: '70px 24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="lq-title1" style={{ margin: 0, fontWeight: 700 }}>New message</h2>
              <Button variant="glass" onClick={close} aria-label="Close card">Done</Button>
            </div>
            <p className="lq-body" style={{ color: 'var(--lq-secondary-label)' }}>
              The button's glass grew into this card. Drag down anywhere to dismiss.
            </p>
          </div>
        )}
      </GlassCardButton>
      <GlassCardButton variant="prominentGlass" label="Prominent">
        {(close) => (
          <div style={{ padding: '70px 24px' }}>
            <Button variant="filled" onClick={close}>Close</Button>
          </div>
        )}
      </GlassCardButton>
    </Section>
  );
}

function Extra() {
  const [events, setEvents] = useState<string[]>([]);
  const log = (s: string) => {
    setEvents((e) => [...e.slice(-4), s]);
    (window as unknown as { __lqEvents?: string[] }).__lqEvents ??= [];
    (window as unknown as { __lqEvents: string[] }).__lqEvents.push(s);
  };
  return (
    <>
      <Menus log={log} />
      <Overlays log={log} />
      <Zoom log={log} />
      <GlassCard />
      <div className="lq-footnote" data-testid="events" style={{ margin: '0 36px 22px', color: 'var(--lq-secondary-label)' }}>
        {events.join(' · ') || 'No events'}
      </div>
    </>
  );
}
