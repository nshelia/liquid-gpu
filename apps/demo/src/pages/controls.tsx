/**
 * Showcase of controls, menus and transitions. Open `/controls.html` (`?dark`, `?fallback`, `?section=<id>`).
 * Registers `window.__lqc` for the CDP tasks in `apps/demo/test/tasks/controls-*.mjs`.
 */
import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ActivityIndicator,
  Button,
  LiquidRoot,
  ProgressView,
  ScrollView,
  SearchField,
  SegmentedControl,
  Slider,
  Stepper,
  Switch,
  TextField,
  useLiquid,
} from '@liquid-gpu/react';
import { extraShowcase } from './controls-extra';

const q = new URLSearchParams(location.search);

const only = q.get('only')?.split(',');

export function Section({ id, title, children, colorful }: { id: string; title: string; children: ReactNode; colorful?: boolean }) {
  if (only && !only.includes(id)) return null;
  return (
    <section id={id} data-section={id} style={{ margin: '0 16px 22px' }}>
      <h2 className="lq-footnote" style={{ margin: '0 20px 7px', textTransform: 'uppercase', color: 'var(--lq-secondary-label)', fontWeight: 400 }}>
        {title}
      </h2>
      <div
        style={{
          borderRadius: 26,
          padding: 16,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 12,
          alignItems: 'center',
          background: colorful ? 'linear-gradient(135deg,#ff8d28 0%,#ff2d55 35%,#cb30e0 65%,#0088ff 100%)' : 'var(--lq-secondary-system-grouped-background)',
          ['cornerShape' as string]: 'squircle',
        }}
      >
        {children}
      </div>
    </section>
  );
}

function Probe() {
  const ctx = useLiquid();
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__lqc = ctx;
    document.documentElement.dataset.ready = '1';
  }, [ctx]);
  return null;
}

function Controls() {
  const ctx = useLiquid();
  const [on, setOn] = useState(true);
  const [val, setVal] = useState(0.4);
  const [count, setCount] = useState(3);
  const [seg, setSeg] = useState<'day' | 'week' | 'month'>('week');
  const [progress, setProgress] = useState(0.3);
  useEffect(() => {
    const t = setInterval(() => setProgress((p) => (p >= 1 ? 0 : +(p + 0.1).toFixed(2))), 1500);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <Section id="buttons" title="Buttons">
        {(['plain', 'gray', 'tinted', 'filled'] as const).map((v) => (
          <Button key={v} variant={v}>
            {v[0]!.toUpperCase() + v.slice(1)}
          </Button>
        ))}
        <Button variant="filled" size="small">Small</Button>
        <Button variant="filled" size="large">Large</Button>
        <Button variant="gray" disabled>Disabled</Button>
        <Button variant="tinted" role="destructive">Delete</Button>
      </Section>
      <Section id="glass-buttons" title="Glass buttons" colorful>
        <Button variant="glass">Glass</Button>
        <Button variant="prominentGlass">Prominent</Button>
        <Button variant="clearGlass">Clear</Button>
        <Button variant="glass" size="large">Large glass</Button>
        <Button variant="glass" size="small">Small</Button>
      </Section>
      <Section id="switch" title="Switch">
        <Switch isOn={on} onChange={setOn} aria-label="Wi-Fi" />
        <Switch defaultOn={false} aria-label="Off" />
        <Switch defaultOn disabled aria-label="Disabled" />
        <span className="lq-body">{on ? 'On' : 'Off'}</span>
      </Section>
      <Section id="segmented" title="Segmented control">
        <SegmentedControl
          aria-label="Range"
          selection={seg}
          onChange={setSeg}
          segments={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
        />
      </Section>
      <Section id="slider" title="Slider">
        <Slider aria-label="Volume" value={val} onChange={setVal} />
        <Slider aria-label="Ticks" defaultValue={0.5} ticks={5} snapToTicks />
        <span className="lq-footnote" style={{ color: 'var(--lq-secondary-label)' }}>{val.toFixed(2)}</span>
      </Section>
      <Section id="stepper" title="Stepper">
        <Stepper aria-label="Count" value={count} onChange={setCount} min={0} max={50} />
        <span className="lq-body" data-testid="stepper-value">{count}</span>
      </Section>
      <Section id="progress" title="Progress">
        <ProgressView value={progress} aria-label="Download" />
        <ProgressView value={0.65} variant="bar" />
        <ActivityIndicator />
        <ActivityIndicator size="large" />
      </Section>
      <Section id="fields" title="Text fields">
        <TextField placeholder="Name" aria-label="Name" />
        <SearchField aria-label="Search" />
      </Section>
      {extraShowcase()}
      <div style={{ height: 40 + ctx.safeArea.bottom }} />
    </>
  );
}

function Page() {
  const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
  return (
    <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }}>
      <Probe />
      <ScrollView style={{ height: '100%', background: 'var(--lq-system-grouped-background)' }}>
        <div style={{ paddingTop: 62 }}>
          <h1 className="lq-large-title" style={{ margin: '0 0 12px 20px', fontWeight: 700 }}>
            Controls
          </h1>
          <Controls />
        </div>
      </ScrollView>
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
