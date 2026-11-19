/**
 * Status showcase: empty states, gauges, paged carousel. Open `/status.html` (`?dark`, `?fallback`).
 * `?probe=<id>` renders one component at the native harness position for pixel comparison
 * (uikit-internals/deep/demo-audit/status/tools/shots.cjs + diff.py): `unavailable.default`, `unavailable.two`, `unavailable.search`,
 * `gauge.<style>` at (20, 300) width 400 (circular: 58×58 centred), `page` / `page.always` full screen
 * (`&bg=white|black`, `&pages=12`, `&page=11`).
 */
import { StrictMode, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, LiquidRoot, ScrollView, SegmentedControl, Slider } from '@liquid-gpu/react';
import { ContentUnavailableView, SearchUnavailableView } from '../../../../packages/react/src/status/ContentUnavailableView';
import { Gauge, type GaugeStyle } from '../../../../packages/react/src/status/Gauge';
import { PageView } from '../../../../packages/react/src/status/PageView';

const q = new URLSearchParams(location.search);
const probe = q.get('probe');

/** iOS 27 systemRed/Orange/Green/Blue (ST page probe: red page (255,56,60) light, (255,66,69) dark). */
const pageColors = {
  light: ['#FF383C', '#FF8D28', '#34C759', '#0088FF'],
  dark: ['#FF4245', '#FF9230', '#30D158', '#0091FF'],
};

function Ready() {
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => (document.documentElement.dataset.ready = '1')));
  }, []);
  return null;
}

function Pages({ bg, dark }: { bg?: string | null; dark: boolean }) {
  const colors = pageColors[dark ? 'dark' : 'light'];
  const count = Number(q.get('pages') ?? 4);
  return Array.from({ length: count }, (_, i) => (
    <div
      key={i}
      style={{
        height: '100%',
        background: bg === 'white' ? '#fff' : bg === 'black' ? '#000' : colors[i % 4],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 17,
        color: bg === 'white' ? '#000' : '#fff',
      }}
    >
      Page {i}
    </div>
  ));
}

const at = (style: CSSProperties, children: ReactNode) => <div style={{ position: 'absolute', ...style }}>{children}</div>;

function ProbeView({ id, dark }: { id: string; dark: boolean }) {
  if (id === 'page' || id === 'page.always')
    return at(
      { left: 0, top: 62, width: 440, height: 860 },
      <PageView backgroundDisplayMode={id === 'page.always' ? 'always' : 'automatic'} page={q.has('page') ? Number(q.get('page')) : undefined}>{Pages({ bg: q.get('bg'), dark })}</PageView>,
    );
  if (id === 'unavailable.default')
    return at(
      { left: 20, top: 300, width: 400 },
      <ContentUnavailableView
        systemImage="tray.fill"
        title="No Mail"
        description="New mail you receive appears here."
        actions={
          <Button variant="filled" size="small" cornerStyle="capsule">
            Refresh
          </Button>
        }
      />,
    );
  if (id === 'unavailable.two')
    return at(
      { left: 20, top: 300, width: 400 },
      <ContentUnavailableView
        systemImage="tray.fill"
        title="No Mail"
        description="New mail you receive appears here."
        actions={
          <>
            <Button variant="filled" size="small" cornerStyle="capsule">
              Refresh
            </Button>
            <Button variant="plain" size="small">
              Settings
            </Button>
          </>
        }
      />,
    );
  if (id === 'unavailable.search') return at({ left: 20, top: 300, width: 400 }, <SearchUnavailableView text="abc" />);
  const style = id.replace('gauge.', '') as GaugeStyle;
  if (style.startsWith('accessoryCircular'))
    return at({ left: 191, top: 300 }, <Gauge gaugeStyle={style} value={0.4} label="T" currentValueLabel="40" />);
  const labels: Record<string, Partial<Parameters<typeof Gauge>[0]>> = {
    automatic: { label: 'Battery', currentValueLabel: '40', minimumValueLabel: '0', maximumValueLabel: '100' },
    linearCapacity: { label: 'Storage' },
    accessoryLinear: { label: 'Temp', currentValueLabel: '40' },
    accessoryLinearCapacity: { label: 'Temp' },
  };
  return at({ left: 20, top: 300, width: 400 }, <Gauge gaugeStyle={style} value={0.4} {...labels[style]} />);
}

function Card({ title, children, style }: { title: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ margin: '0 16px 22px' }}>
      <h2 className="lq-footnote" style={{ margin: '0 20px 7px', textTransform: 'uppercase', color: 'var(--lq-secondary-label)', fontWeight: 400 }}>
        {title}
      </h2>
      <div style={{ borderRadius: 26, background: 'var(--lq-secondary-system-grouped-background)', overflow: 'hidden', ...style }}>{children}</div>
    </section>
  );
}

function Showcase({ dark }: { dark: boolean }) {
  const [v, setV] = useState(0.4);
  const [mode, setMode] = useState(0);
  const pct = Math.round(v * 100);
  return (
    <>
      <Card title="Content unavailable">
        <ContentUnavailableView
          systemImage="tray.fill"
          title="No Mail"
          description="New mail you receive appears here."
          actions={
            <Button variant="filled" size="small" cornerStyle="capsule">
              Refresh
            </Button>
          }
        />
      </Card>
      <Card title="Search">
        <SearchUnavailableView text="abc" />
      </Card>
      <Card title="Gauges" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 28 }}>
        <Slider value={v} onChange={setV} aria-label="Gauge value" />
        <Gauge value={v} label="Battery" currentValueLabel={String(pct)} minimumValueLabel="0" maximumValueLabel="100" />
        <Gauge value={v} gaugeStyle="linearCapacity" label="Storage" />
        <div style={{ padding: '6px 0' }}>
          <Gauge value={v} gaugeStyle="accessoryLinear" currentValueLabel={String(pct)} />
        </div>
        <Gauge value={v} gaugeStyle="accessoryLinearCapacity" label="Temp" />
        <div style={{ display: 'flex', justifyContent: 'space-around' }}>
          <Gauge value={v} gaugeStyle="accessoryCircular" label="T" currentValueLabel={String(pct)} />
          <Gauge value={v} gaugeStyle="accessoryCircularCapacity" currentValueLabel={String(pct)} />
          <Gauge value={v} gaugeStyle="accessoryCircularCapacity" tint="#34C759" currentValueLabel={String(pct)} />
        </div>
      </Card>
      <Card title="Paged carousel" style={{ height: 300 }}>
        <PageView backgroundDisplayMode={mode === 1 ? 'always' : 'automatic'} aria-label="Carousel">
          {Pages({ dark })}
        </PageView>
      </Card>
      <div style={{ margin: '0 32px 40px' }}>
        <SegmentedControl
          segments={[
            { value: 0, label: 'Automatic' },
            { value: 1, label: 'Always' },
          ]}
          selection={mode}
          onChange={setMode}
          aria-label="Dots background"
        />
      </div>
    </>
  );
}

function Page() {
  const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
  const dark = appearance === 'dark' || (appearance === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  return (
    <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }}>
      <Ready />
      {probe ? (
        <div style={{ position: 'absolute', inset: 0, background: 'var(--lq-system-background)' }}>
          <ProbeView id={probe} dark={dark} />
        </div>
      ) : (
        <ScrollView style={{ height: '100%', background: 'var(--lq-system-grouped-background)' }}>
          <div style={{ paddingTop: 62 }}>
            <h1 className="lq-large-title" style={{ margin: '0 0 12px 20px', fontWeight: 700 }}>
              Status
            </h1>
            <Showcase dark={dark} />
            <div style={{ height: 34 }} />
          </div>
        </ScrollView>
      )}
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
