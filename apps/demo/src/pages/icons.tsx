/**
 * Searchable grid of every registered icon. Open `/icons.html` (`?dark`, `?q=<filter>`, `?weight=bold`, `?color=blue`).
 * Click a cell to copy its name. Registers `window.__lqi = { names }` for scripted checks.
 */
import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiquidRoot, ScrollView, SearchField, SegmentedControl } from '@liquid-gpu/react';
import { Icon, iconNames, type IconWeight } from '../../../../packages/react/src/iconset';

const q = new URLSearchParams(location.search);
(window as unknown as { __lqi: unknown }).__lqi = { names: iconNames };

const WEIGHTS: IconWeight[] = ['thin', 'regular', 'semibold', 'bold'];

function Grid() {
  const [filter, setFilter] = useState(q.get('q') ?? '');
  const [weight, setWeight] = useState<IconWeight>((q.get('weight') as IconWeight | null) ?? 'regular');
  const [copied, setCopied] = useState<string | null>(null);
  const color = q.get('color') ?? undefined;
  const names = useMemo(() => {
    const terms = filter.toLowerCase().split(/\s+/).filter(Boolean);
    return iconNames.filter((n) => terms.every((t) => n.includes(t)));
  }, [filter]);

  const copy = (n: string) => {
    void navigator.clipboard?.writeText(n).catch(() => {});
    setCopied(n);
  };

  return (
    <div style={{ padding: '0 16px' }}>
      <SearchField value={filter} onChange={setFilter} placeholder={`Search ${iconNames.length} icons`} aria-label="Search icons" />
      <div style={{ margin: '12px 0' }}>
        <SegmentedControl
          segments={WEIGHTS.map((w) => ({ value: w, label: w }))}
          selection={weight}
          onChange={setWeight}
          width={320}
          aria-label="Weight"
        />
      </div>
      <p className="lq-footnote" style={{ margin: '0 4px 10px', color: 'var(--lq-secondary-label)' }}>
        {names.length} shown{copied ? ` · copied “${copied}”` : ' · tap to copy the name'}
      </p>
      <div
        data-testid="icon-grid"
        style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 8 }}
      >
        {names.map((n) => (
          <button
            key={n}
            type="button"
            data-name={n}
            onClick={() => copy(n)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 8,
              padding: '14px 4px 10px',
              border: 0,
              borderRadius: 14,
              background: 'var(--lq-secondary-system-grouped-background)',
              color: 'var(--lq-label)',
              font: 'inherit',
              cursor: 'pointer',
            }}
          >
            <Icon name={n} size={26} weight={weight} color={color} />
            <span className="lq-caption2" style={{ color: 'var(--lq-secondary-label)', wordBreak: 'break-all', textAlign: 'center' }}>
              {n}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Page() {
  const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
  return (
    <LiquidRoot appearance={appearance} safeArea={{ top: 62, bottom: 34 }}>
      <ScrollView style={{ height: '100%', background: 'var(--lq-system-grouped-background)' }}>
        <div style={{ paddingTop: 62, paddingBottom: 60 }}>
          <h1 className="lq-large-title" style={{ margin: '0 0 12px 20px', fontWeight: 700 }}>
            Icons
          </h1>
          <Grid />
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
