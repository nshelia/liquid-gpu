/**
 * List edit mode: Edit/Done, multi-select with a toolbar action, delete and reorder. Open `/list-edit.html`.
 * Query: `?dark`, `?scene=edit|multi` (the native lab scenes: one "Items" section of six rows), `?editing`,
 * `?sel=0,2`. Registers `window.__le` ({ setEditing }) for the comparison scripts.
 */
import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BarButton, LiquidRoot, List, NavigationStack, Row, Screen, ScrollView, Section, Toolbar, ToolbarSpacer } from '@liquid-gpu/react';
import { EditButton } from '../../../../packages/react/src/list/edit';
import { moveItem } from '../../../../packages/react/src/logic/list';

const q = new URLSearchParams(location.search);
const scene = q.get('scene');

function EditDemo() {
  const [editing, setEditing] = useState(q.has('editing'));
  const [inbox, setInbox] = useState(() => (scene ? [0, 1, 2, 3, 4, 5].map((i) => `Item ${i}`) : ['Groceries', 'Dentist', 'Flight check-in', 'Pay rent', 'Call mum', 'Return parcel']));
  const [favs, setFavs] = useState(['Tbilisi', 'Batumi', 'Kutaisi', 'Mestia']);
  const [sel, setSel] = useState<Set<string>>(() => new Set((q.get('sel') ?? '').split(',').filter(Boolean).map((i) => inbox[+i]!)));
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__le = { setEditing };
    document.documentElement.dataset.ready = '1';
  }, []);
  const multi = scene !== 'edit';
  const toggle = (v: boolean) => {
    setEditing(v);
    if (!v) setSel(new Set());
  };
  return (
    <Screen
      title="Edit"
      trailing={<EditButton editing={editing} onEditingChange={toggle} />}
      toolbar={
        editing && multi && !scene ? (
          <Toolbar>
            <ToolbarSpacer />
            <BarButton
              label={sel.size ? `Delete (${sel.size})` : 'Delete'}
              disabled={!sel.size}
              onPress={() => {
                setInbox((xs) => xs.filter((x) => !sel.has(x)));
                setSel(new Set());
              }}
            />
          </Toolbar>
        ) : undefined
      }
    >
      <ScrollView aria-label="Lists">
        <List editing={editing} selection={multi ? sel : undefined} onSelectionChange={setSel}>
          <Section header={scene ? 'Items' : 'Inbox'} onMove={(a, b) => setInbox((xs) => moveItem(xs, a, b))}>
            {inbox.map((t) => (
              <Row
                key={t}
                id={multi ? t : undefined}
                title={t}
                onDelete={() => setInbox((xs) => xs.filter((x) => x !== t))}
                trailingActions={[{ label: 'Delete', role: 'destructive', onAction: () => setInbox((xs) => xs.filter((x) => x !== t)) }]}
              />
            ))}
          </Section>
          {!scene && (
            <Section header="Favourites" footer="Delete with the minus control; drag the grabber to reorder." onMove={(a, b) => setFavs((xs) => moveItem(xs, a, b))}>
              {favs.map((t) => (
                <Row key={t} title={t} accessory="disclosure" onPress={() => {}} onDelete={() => setFavs((xs) => xs.filter((x) => x !== t))} />
              ))}
            </Section>
          )}
        </List>
      </ScrollView>
    </Screen>
  );
}

function Page() {
  return (
    <LiquidRoot appearance={q.has('dark') ? 'dark' : 'light'} safeArea={{ top: 62, bottom: 34 }}>
      <NavigationStack root={<EditDemo />} />
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
