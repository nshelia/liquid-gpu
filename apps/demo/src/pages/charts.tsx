/**
 * Charts showcase: Metric tiles, bar (grouped / stacked / horizontal), line, area, pie / donut. Open `/charts.html`
 * (`?dark`, `?light`, `?fallback`). Scrub with a pointer or drag; focus a chart and use the arrow keys.
 */
import { StrictMode, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { Button, LiquidRoot, ScrollView, SegmentedControl } from '@liquid-gpu/react';
import { AreaChart, BarChart, LineChart, Metric, PieChart, Sparkline, type Interpolation } from '../../../../packages/react/src/charts';

const q = new URLSearchParams(location.search);

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const rand = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;

function makeData(seed: number) {
  const r = rand(seed);
  const steps = days.flatMap((d) => [
    { day: d, steps: Math.round(4000 + r() * 8000), who: 'Me' },
    { day: d, steps: Math.round(3000 + r() * 7000), who: 'Partner' },
  ]);
  const temps = Array.from({ length: 12 }, (_, i) => [
    { month: i + 1, temp: Math.round((12 + 10 * Math.sin((i - 3) / 1.9) + r() * 3) * 10) / 10, city: 'Tbilisi' },
    { month: i + 1, temp: Math.round((8 + 8 * Math.sin((i - 3) / 1.9) + r() * 3) * 10) / 10, city: 'London' },
  ]).flat();
  const energy = days.flatMap((d) => [
    { day: d, kwh: Math.round(2 + r() * 4), source: 'Solar' },
    { day: d, kwh: Math.round(1 + r() * 3), source: 'Grid' },
    { day: d, kwh: Math.round(r() * 2), source: 'Battery' },
  ]);
  const spend = [
    { cat: 'Rent', amount: 1400 },
    { cat: 'Food', amount: 420 + Math.round(r() * 200) },
    { cat: 'Transport', amount: 120 + Math.round(r() * 80) },
    { cat: 'Fun', amount: 160 + Math.round(r() * 200) },
    { cat: 'Other', amount: 90 + Math.round(r() * 60) },
  ];
  const lang = [
    { lang: 'TypeScript', share: 0.42 },
    { lang: 'Swift', share: 0.21 + r() * 0.05 },
    { lang: 'Rust', share: 0.12 },
    { lang: 'Python', share: 0.09 },
  ];
  const revenue = Array.from({ length: 14 }, (_, i) => 20 + i * 1.5 + r() * 6);
  const latency = Array.from({ length: 14 }, (_, i) => 180 - i * 3 + r() * 20);
  return { steps, temps, energy, spend, lang, revenue, latency };
}

function Card({ title, children, style }: { title: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <section style={{ margin: '0 16px 22px' }}>
      <h2 className="lq-footnote" style={{ margin: '0 20px 7px', textTransform: 'uppercase', color: 'var(--lq-secondary-label)', fontWeight: 400 }}>
        {title}
      </h2>
      <div style={{ borderRadius: 26, background: 'var(--lq-secondary-system-grouped-background)', padding: 16, ...style }}>{children}</div>
    </section>
  );
}

function Showcase() {
  const [seed, setSeed] = useState(7);
  const d = useMemo(() => makeData(seed), [seed]);
  const [barMode, setBarMode] = useState(0);
  const [interp, setInterp] = useState<Interpolation>('monotone');
  const [sel, setSel] = useState<string | null>(null);
  const last = d.revenue.at(-1)!;
  const prev = d.revenue.at(-2)!;
  return (
    <>
      <div style={{ margin: '0 16px 22px', display: 'flex', justifyContent: 'flex-end' }}>
        <Button variant="tinted" size="small" cornerStyle="capsule" onClick={() => setSeed((s) => s + 1)}>
          Shuffle data
        </Button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, margin: '0 16px 22px' }}>
        <Metric label="Revenue" value={last * 1000} format="currency" delta={(last - prev) / prev} sparkline={d.revenue} />
        <Metric label="p95 latency" value={`${Math.round(d.latency.at(-1)!)} ms`} delta={-0.08} invertDelta sparkline={d.latency} />
        <Metric label="Active users" value={12840 + seed * 13} format="compact" delta={0.034} deltaLabel="7d" icon={<Dot />} />
        <Metric label="Churn" value={0.021} format="percent" delta={0} />
      </div>

      <Card title="Bar chart">
        <div style={{ marginBottom: 12 }}>
          <SegmentedControl
            segments={[
              { value: 0, label: 'Stacked' },
              { value: 1, label: 'Grouped' },
              { value: 2, label: 'Horizontal' },
            ]}
            selection={barMode}
            onChange={setBarMode}
            width={300}
            aria-label="Bar layout"
          />
        </div>
        <BarChart
          title="Steps per day"
          data={barMode === 2 ? d.steps.filter((r) => r.who === 'Me') : d.steps}
          x="day"
          y="steps"
          series={barMode === 2 ? undefined : 'who'}
          stacking={barMode === 1 ? 'grouped' : 'stacked'}
          orientation={barMode === 2 ? 'horizontal' : 'vertical'}
          yAxis={{ format: 'compact' }}
          rule={{ value: barMode === 0 ? 15000 : 8000, label: 'Goal', color: 'red' }}
          height={barMode === 2 ? 240 : 200}
          cornerRadius={barMode === 1 ? 3 : 0}
        />
      </Card>

      <Card title="Line chart">
        <div style={{ marginBottom: 12 }}>
          <SegmentedControl
            segments={[
              { value: 'linear', label: 'Linear' },
              { value: 'catmullRom', label: 'Catmull-Rom' },
              { value: 'monotone', label: 'Monotone' },
            ]}
            selection={interp}
            onChange={(v) => setInterp(v as Interpolation)}
            width={320}
            aria-label="Interpolation"
          />
        </div>
        <LineChart
          title="Average temperature"
          data={d.temps}
          x="month"
          y="temp"
          series="city"
          interpolation={interp}
          showPoints
          selection={sel}
          onSelectionChange={setSel}
          yAxis={{ includeZero: false }}
        />
        <div className="lq-footnote" style={{ marginTop: 6, color: 'var(--lq-secondary-label)' }}>
          Selected month: {sel ?? 'none'}
        </div>
      </Card>

      <Card title="Area chart (stacked)">
        <AreaChart title="Energy" data={d.energy} x="day" y="kwh" series="source" interpolation="monotone" yAxis={{ format: 'number' }} />
      </Card>

      <Card title="Pie and donut">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <PieChart title="Spending" data={d.spend} x="cat" y="amount" height={150} format="currency" />
          <PieChart title="Languages" data={d.lang} x="lang" y="share" height={150} innerRadius={0.62} angularInset={1.5} format="percent" centerLabel="Share" />
        </div>
      </Card>

      <Card title="Sparklines">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Sparkline data={d.revenue} color="green" fill showEndPoint aria-label="Revenue trend" />
          <Sparkline data={d.latency} color="orange" interpolation="linear" />
        </div>
      </Card>
    </>
  );
}

function Dot() {
  return (
    <svg width={12} height={12} viewBox="0 0 12 12" aria-hidden>
      <circle cx={6} cy={6} r={5} fill="currentColor" />
    </svg>
  );
}

function Page() {
  const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
  return (
    <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }}>
      <ScrollView style={{ height: '100%', background: 'var(--lq-system-grouped-background)' }}>
        <div style={{ paddingTop: 62 }}>
          <h1 className="lq-large-title" style={{ margin: '0 0 12px 20px', fontWeight: 700 }}>
            Charts
          </h1>
          <Showcase />
          <div style={{ height: 34 }} />
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
