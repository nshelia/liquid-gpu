/**
 * `.searchable` demo: a large-title list of fruits filtered by the bottom search field. Open `/search.html`
 * (`?dark`, `?mode=minimize|scopes`, `?present=1`, `?text=ap`). Mirrors the native probe
 * uikit-internals/deep/demo-audit/search/src (SearchLab) for pixel comparison. Exposes `window.__search`.
 */
import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { List, LiquidRoot, NavigationStack, Row, Screen, ScrollView, Section, useLiquid } from '@liquid-gpu/react';
import { matchesSearch } from '../../../../packages/react/src/search/logic';

const q = new URLSearchParams(location.search);
const MODE = q.get('mode') ?? 'default';

const FRUITS = ['Apple', 'Apricot', 'Avocado', 'Banana', 'Blackberry', 'Blueberry', 'Cherry', 'Coconut', 'Cranberry', 'Date', 'Dragonfruit', 'Fig', 'Grape', 'Grapefruit', 'Guava', 'Kiwi', 'Lemon', 'Lime', 'Lychee', 'Mango', 'Melon', 'Nectarine', 'Orange', 'Papaya', 'Peach', 'Pear', 'Pineapple', 'Plum', 'Pomegranate', 'Raspberry'];
const SOUR = new Set(['Cranberry', 'Grapefruit', 'Kiwi', 'Lemon', 'Lime', 'Pomegranate', 'Raspberry']);
type Scope = 'all' | 'sweet' | 'sour';
const SCOPES = [
  { value: 'all' as Scope, label: 'All' },
  { value: 'sweet' as Scope, label: 'Sweet' },
  { value: 'sour' as Scope, label: 'Sour' },
];

function Fruits() {
  const ctx = useLiquid();
  const [text, setText] = useState(q.get('text') ?? '');
  const [presented, setPresented] = useState(q.get('present') === '1');
  const [scope, setScope] = useState<Scope>('all');
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__search = { setText, setPresented, setScope, ctx };
    document.documentElement.dataset.ready = '1';
  }, [ctx]);
  const rows = useMemo(
    () => FRUITS.filter((f) => matchesSearch(f, text) && (!presented || scope === 'all' || (scope === 'sour') === SOUR.has(f))),
    [text, scope, presented],
  );
  return (
    <Screen
      title="Fruits"
      largeTitle
      searchable={{
        text,
        onTextChange: setText,
        isPresented: presented,
        onPresentedChange: setPresented,
        minimize: MODE === 'minimize',
        scopes: MODE === 'scopes' ? SCOPES : undefined,
        scope,
        onScopeChange: (s) => setScope(s as Scope),
      }}
    >
      <ScrollView aria-label="Fruits">
        {/* Native inset-grouped lists have no first-section gap under a large title (web List adds 35). */}
        <List style={{ marginTop: presented ? 0 : -35 }}>
          <Section>
            {rows.map((f) => (
              <Row key={f} title={f} />
            ))}
          </Section>
        </List>
      </ScrollView>
    </Screen>
  );
}

function Page() {
  const safeArea = useMemo(() => ({ top: 62, bottom: 34 }), []);
  return (
    <LiquidRoot appearance={q.has('dark') ? 'dark' : 'light'} safeArea={safeArea}>
      <NavigationStack>
        <Fruits />
      </NavigationStack>
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
