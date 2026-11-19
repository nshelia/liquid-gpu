/**
 * liquid-gpu showcase: every component in light and dark, English sample text.
 *
 * URL: ?dark  ?light  ?fallback (CSS renderer)  ?tab=photos|settings  ?push=glass|list|scroll|toolbar  ?sheet=1
 *      ?scroll=<pt> (initial scroll of the first tab's list)  ?desktop (no device safe areas)
 */
import { useEffect, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import {
  BarButton,
  BarGroup,
  ComposeIcon,
  EllipsisIcon,
  GearIcon,
  Glass,
  HouseFill,
  List,
  LiquidRoot,
  NavigationStack,
  PinFill,
  PlusIcon,
  Row,
  Screen,
  ScrollView,
  SearchIcon,
  Section,
  ShareIcon,
  Sheet,
  SquareGridFill,
  Tab,
  TabView,
  Toolbar,
  ToolbarSpacer,
  TrashIcon,
  useLiquid,
  useNavigation,
  type AppearanceSetting,
  type ScrollViewHandle,
} from '@liquid-gpu/react';

const q = new URLSearchParams(location.search);

const GITHUB_URL = 'https://github.com/nshelia/liquid-gpu';

const PLACES: [string, string][] = [
  ['Tbilisi', 'Old Town'],
  ['Mtskheta', 'Svetitskhoveli Cathedral'],
  ['Kazbegi', 'Gergeti Trinity Church'],
  ['Batumi', 'Seaside Boulevard'],
  ['Sighnaghi', 'City of Love'],
  ['Ushguli', 'Svaneti Towers'],
  ['Vardzia', 'Cave Monastery'],
  ['Kutaisi', 'Bagrati Cathedral'],
];

const photo = (i: number) => {
  const h = (i * 47) % 360;
  return `linear-gradient(160deg, hsl(${h} 80% 62%), hsl(${(h + 40) % 360} 85% 70%) 45%, hsl(${(h + 200) % 360} 45% 38%) 46%, hsl(${(h + 230) % 360} 50% 24%))`;
};

function Expose() {
  const ctx = useLiquid();
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__lq = ctx;
    document.documentElement.dataset.ready = '1';
    document.documentElement.dataset.renderer = ctx.mode;
  }, [ctx]);
  return null;
}

function Icon({ bg, children }: { bg: string; children: ReactNode }) {
  return (
    <span style={{ width: 30, height: 30, borderRadius: 8, background: bg, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </span>
  );
}

// ------------------------------------------------------------------------------------------- screens

function ComponentsHome({ appearance, setAppearance, openSheet }: { appearance: AppearanceSetting; setAppearance(a: AppearanceSetting): void; openSheet(): void }) {
  const nav = useNavigation();
  const ref = useRef<ScrollViewHandle | null>(null);
  useEffect(() => {
    const s = Number(q.get('scroll') ?? 0);
    if (s) setTimeout(() => ref.current?.scrollTo(s, false), 50);
    const p = q.get('push');
    if (p) setTimeout(() => nav?.push(DEST[p]?.() ?? <GlassDemo />), 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  (window as unknown as Record<string, unknown>).__demo = {
    push: (n: string) => nav?.push(DEST[n]?.() ?? <GlassDemo />),
    pop: () => nav?.pop(),
    scrollTo: (o: number, a = true) => ref.current?.scrollTo(o, a),
    openSheet,
    setAppearance,
  };
  return (
    <Screen
      title="Components"
      largeTitle
      trailing={
        <BarGroup aria-label="Actions">
          <BarButton icon={<PlusIcon />} aria-label="Add" />
          <BarButton icon={<EllipsisIcon />} aria-label="More" />
        </BarGroup>
      }
    >
      <ScrollView ref={ref} aria-label="Components" onRefresh={() => new Promise((r) => setTimeout(r, 1200))}>
        <List>
          <Section header="About" footer="The iOS 27 UI as React 19 components: Liquid Glass, springs, scroll physics, sheets.">
            <Row
              title="Source on GitHub"
              subtitle="github.com/nshelia/liquid-gpu"
              accessory="disclosure"
              icon={<Icon bg="#1F2328">{'</>'}</Icon>}
              onPress={() => window.open(GITHUB_URL, '_blank', 'noopener')}
            />
          </Section>
          <Section header="Navigation" footer="Push with the parallax spring; swipe back from the edge or anywhere.">
            <Row title="Glass" subtitle="press, drag, merge" accessory="disclosure" icon={<Icon bg="var(--lq-system-blue)">◎</Icon>} onPress={() => nav?.push(<GlassDemo />)} />
            <Row title="Lists & swipe actions" subtitle="swipe to delete" accessory="disclosure" icon={<Icon bg="var(--lq-system-red)">≡</Icon>} onPress={() => nav?.push(<ListDemo />)} />
            <Row title="Scroll & paging" subtitle="rubber band 0.55" accessory="disclosure" icon={<Icon bg="var(--lq-system-green)">↕</Icon>} onPress={() => nav?.push(<ScrollDemo />)} />
            <Row title="Toolbar" subtitle="48 pt capsules" accessory="disclosure" icon={<Icon bg="var(--lq-system-orange)">▭</Icon>} onPress={() => nav?.push(<ToolbarDemo />)} />
          </Section>
          <Section header="Presentation">
            <Row title="Sheet" subtitle="medium · large · glass → opaque" accessory="disclosure" icon={<Icon bg="var(--lq-system-indigo)">▤</Icon>} onPress={openSheet} />
          </Section>
          <Section header="Components" footer="Each opens a standalone page measured against iOS 27.">
            {([
              ['Search', 'bottom field, scopes, minimize', '/search.html', 'var(--lq-system-blue)', '⌕'],
              ['Tab bar extras', 'search tab · prominent · accessory', '/tabbar-extras.html', 'var(--lq-system-purple)', '◉'],
              ['List edit mode', 'select, delete, reorder', '/list-edit.html', 'var(--lq-system-red)', '✎'],
              ['Status views', 'empty state · gauge · page dots', '/status.html', 'var(--lq-system-teal)', '◔'],
              ['Basics', 'disclosure · labeled content · group box', '/basics.html', 'var(--lq-system-gray)', '≣'],
              ['Messages-style chat', 'send animation', '/chat.html', 'var(--lq-system-green)', '✉'],
              ['Controls', 'buttons · switches · sliders · menus', '/controls.html', 'var(--lq-system-orange)', '⚙'],
              ['Generative UI', 'json-render catalog · streaming specs', '/genui', 'var(--lq-system-indigo)', '✦'],
              ['Inline roots', 'glass inside chat messages · themes', '/inline', 'var(--lq-system-cyan)', '▢'],
              ['Charts', 'bar · line · area · pie · metric', '/charts', 'var(--lq-system-green)', '▥'],
              ['Form', 'fields · validation · submit', '/form', 'var(--lq-system-blue)', '✓'],
              ['Pickers', 'menu · inline · segmented · wheel', '/picker', 'var(--lq-system-purple)', '◎'],
              ['Inputs', 'text editor · color · toggle · rating · code', '/inputs', 'var(--lq-system-pink)', '⌨'],
              ['Media', 'image · avatar · badge · skeleton', '/media', 'var(--lq-system-yellow)', '◐'],
              ['Icons', '270 named symbols', '/icons', 'var(--lq-system-mint)', '★'],
              ['Layout & text', 'stacks · grid · type styles', '/layout-text', 'var(--lq-system-brown)', 'Aa'],
            ] as const).map(([t, sub, href, bg, g]) => (
              <Row key={t} title={t} subtitle={sub} accessory="disclosure" icon={<Icon bg={bg}>{g}</Icon>} onPress={() => (location.href = href)} />
            ))}
          </Section>
          <Section header="Appearance">
            {(['system', 'light', 'dark'] as const).map((a) => (
              <Row key={a} title={{ system: 'System', light: 'Light', dark: 'Dark' }[a]} accessory={appearance === a ? 'checkmark' : 'none'} onPress={() => setAppearance(a)} />
            ))}
          </Section>
          <Section header="Places" footer="Georgia sits at the crossroads of Europe and Asia.">
            {PLACES.map(([t, s], i) => (
              <Row key={t} title={t} subtitle={s} detail={`${(i * 37) % 200} photos`} accessory="disclosure" onPress={() => nav?.push(<PlaceDetail name={t} sub={s} i={i} />)} />
            ))}
          </Section>
        </List>
      </ScrollView>
    </Screen>
  );
}

function PlaceDetail({ name, sub, i }: { name: string; sub: string; i: number }) {
  return (
    <Screen title={name} trailing={<BarButton icon={<ShareIcon />} aria-label="Share" />}>
      <ScrollView>
        <div style={{ margin: '8px 20px 0', height: 260, borderRadius: 26, background: photo(i), display: 'flex', alignItems: 'flex-end', padding: 18, boxSizing: 'border-box', color: '#fff', fontWeight: 700, fontSize: 26, textShadow: '0 1px 8px rgba(0,0,0,.35)' }}>
          {name}
        </div>
        <p className="lq-body" style={{ margin: '18px 20px', lineHeight: '22px' }}>
          {sub}. An old city in the Mtkvari valley, its streets full of carved balconies, sulfur baths and churches. The old town climbs the hills on both banks of the Mtkvari.
        </p>
        <List>
          <Section header="Info">
            <Row title="Region" detail="Kartli" />
            <Row title="Elevation" detail={`${380 + i * 120} m`} />
            <Row title="Population" detail={`${(i + 1) * 13},000`} />
          </Section>
        </List>
      </ScrollView>
    </Screen>
  );
}

function GlassDemo() {
  return (
    <Screen title="Glass" background="plain" trailing={<BarButton label="Done" prominent aria-label="Done" />}>
      <ScrollView>
        <div style={{ position: 'relative', margin: '0 0 20px', height: 520, background: photo(5), display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
          <div style={{ display: 'flex', gap: 4 }}>
            <Glass as="button" interactive group="fab" spacing={20} aria-label="Add" contentStyle={{ width: 58, height: 58 }}>
              <PlusIcon size={26} />
            </Glass>
            <Glass as="button" interactive group="fab" spacing={20} aria-label="Search" contentStyle={{ width: 58, height: 58 }}>
              <SearchIcon size={24} />
            </Glass>
          </div>
          <Glass as="button" interactive contentStyle={{ height: 50.33, padding: '0 24px', fontWeight: 590 }}>
            Continue
          </Glass>
          <Glass as="button" interactive style="clear" contentStyle={{ height: 50.33, padding: '0 24px', fontWeight: 590, color: '#fff' }}>
            Clear glass
          </Glass>
          <Glass as="button" interactive tint="#0088FF" contentStyle={{ height: 50.33, padding: '0 24px', fontWeight: 590, color: '#fff' }}>
            Tinted
          </Glass>
          <Glass as="div" radius={26} fit="container" boxStyle={{ width: 360, height: 120 }} contentStyle={{ padding: 18, alignItems: 'flex-start', justifyContent: 'flex-start', flexDirection: 'column', gap: 4 }}>
            <b>Liquid Glass</b>
            <span className="lq-footnote" style={{ color: 'var(--lq-secondary-label)' }}>
              blur, refraction, rim light
            </span>
          </Glass>
        </div>
        <p className="lq-footnote" style={{ margin: '0 20px 40px', color: 'var(--lq-secondary-label)' }}>
          Press and drag the buttons: the flex stretch, glow and pressed chromatic aberration come from glass-drag §3–7.
        </p>
      </ScrollView>
    </Screen>
  );
}

function ListDemo() {
  const [items, setItems] = useState(() => PLACES.map(([t, s]) => ({ t, s, pinned: false })));
  return (
    <Screen title="Lists">
      <ScrollView>
        <List>
          <Section header="Swipe left to delete, right to pin" footer="Full swipe performs the first action (GS §1).">
            {items.map((it) => (
              <Row
                key={it.t}
                title={it.t}
                subtitle={it.s}
                icon={it.pinned ? <PinFill size={18} /> : undefined}
                onPress={() => {}}
                trailingActions={[
                  { label: 'Delete', role: 'destructive', onAction: () => setItems((xs) => xs.filter((x) => x.t !== it.t)) },
                  { label: 'More', onAction: () => {} },
                ]}
                leadingActions={[{ label: it.pinned ? 'Unpin' : 'Pin', color: 'var(--lq-system-orange)', onAction: () => setItems((xs) => xs.map((x) => (x.t === it.t ? { ...x, pinned: !x.pinned } : x))) }]}
              />
            ))}
          </Section>
          <Section header="Accessories">
            <Row title="Disclosure" accessory="disclosure" onPress={() => {}} />
            <Row title="Checkmark" accessory="checkmark" />
            <Row title="Detail" detail="Value" />
            <Row title="Selected row" selected />
          </Section>
        </List>
      </ScrollView>
    </Screen>
  );
}

function ScrollDemo() {
  return (
    <Screen title="Scroll">
      <ScrollView>
        <List>
          <Section header="Paging (horizontal)" footer="Paging friction 0.97 per ms at this width (SMG §4).">
            <div style={{ height: 200 }}>
              <ScrollView axis="horizontal" paging showsIndicator={false} publish={false} style={{ height: 200 }}>
                {PLACES.slice(0, 5).map(([t], i) => (
                  <div key={t} style={{ width: 400, height: 200, flex: 'none', background: photo(i + 10), color: '#fff', display: 'flex', alignItems: 'flex-end', padding: 16, boxSizing: 'border-box', fontSize: 22, fontWeight: 700 }}>
                    {i + 1} · {t}
                  </div>
                ))}
              </ScrollView>
            </div>
          </Section>
          <Section header="Rows">
            {Array.from({ length: 30 }, (_, i) => (
              <Row key={i} title={`${PLACES[i % 8]![0]} ${i + 1}`} detail={`#${i + 1}`} />
            ))}
          </Section>
        </List>
      </ScrollView>
    </Screen>
  );
}

function ToolbarDemo() {
  return (
    <Screen
      title="Toolbar"
      toolbar={
        <Toolbar>
          <BarGroup>
            <BarButton icon={<ShareIcon />} aria-label="Share" />
            <BarButton icon={<TrashIcon />} aria-label="Delete" />
          </BarGroup>
          <ToolbarSpacer />
          <BarButton label="Edit" />
          <BarButton icon={<ComposeIcon />} aria-label="Compose" />
        </Toolbar>
      }
    >
      <ScrollView>
        <div style={{ margin: '0 20px' }}>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} style={{ height: 140, borderRadius: 26, marginBottom: 12, background: photo(i + 20) }} />
          ))}
        </div>
      </ScrollView>
    </Screen>
  );
}

const DEST: Record<string, () => ReactElement> = {
  glass: () => <GlassDemo />,
  list: () => <ListDemo />,
  scroll: () => <ScrollDemo />,
  toolbar: () => <ToolbarDemo />,
  place: () => <PlaceDetail name={PLACES[0]![0]} sub={PLACES[0]![1]} i={0} />,
};

function Photos() {
  return (
    <NavigationStack>
      <Screen title="Photos" largeTitle background="plain" trailing={<BarButton label="Select" />}>
        <ScrollView aria-label="Photos">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 2 }}>
            {Array.from({ length: 60 }, (_, i) => (
              <div key={i} style={{ aspectRatio: '1', background: photo(i + 3) }} />
            ))}
          </div>
          <p className="lq-footnote" style={{ textAlign: 'center', color: 'var(--lq-secondary-label)', margin: '16px 0 24px' }}>
            60 Photos — scroll down to minimize the tab bar
          </p>
        </ScrollView>
      </Screen>
    </NavigationStack>
  );
}

function Settings() {
  const nav = useNavigation();
  return (
    <Screen title="Settings" largeTitle>
      <ScrollView>
        <List>
          <Section>
            <Row title="Alex Morgan" subtitle="Account, iCloud, Media & Purchases" icon={<Icon bg="var(--lq-system-gray)">A</Icon>} accessory="disclosure" onPress={() => nav?.push(<PlaceDetail name="Account" sub="ანგარიში" i={2} />)} />
          </Section>
          <Section header="General">
            {['Wi-Fi', 'Bluetooth', 'Cellular', 'Notifications', 'Sounds', 'Focus', 'Screen Time'].map((t, i) => (
              <Row key={t} title={t} detail={i === 0 ? 'Home' : i === 1 ? 'On' : undefined} icon={<Icon bg={['var(--lq-system-blue)', 'var(--lq-system-blue)', 'var(--lq-system-green)', 'var(--lq-system-red)', 'var(--lq-system-pink)', 'var(--lq-system-indigo)', 'var(--lq-system-purple)'][i]!}>{t[0]}</Icon>} accessory="disclosure" onPress={() => nav?.push(<PlaceDetail name={t} sub={t} i={i} />)} />
            ))}
          </Section>
          <Section>
            {['General', 'Accessibility', 'Camera', 'Control Center', 'Display & Brightness', 'Home Screen', 'Search', 'Siri', 'Wallpaper'].map((t, i) => (
              <Row key={t} title={t} icon={<Icon bg={['var(--lq-system-gray)', 'var(--lq-system-blue)', 'var(--lq-system-gray)', 'var(--lq-system-gray)', 'var(--lq-system-blue)', 'var(--lq-system-indigo)', 'var(--lq-system-gray)', 'var(--lq-system-purple)', 'var(--lq-system-cyan)'][i]!}>{t[0]}</Icon>} accessory="disclosure" onPress={() => nav?.push(<PlaceDetail name={t} sub={t} i={i} />)} />
            ))}
          </Section>
          <Section>
            {['Privacy & Security', 'App Store', 'Wallet', 'Passwords'].map((t, i) => (
              <Row key={t} title={t} icon={<Icon bg={['var(--lq-system-blue)', 'var(--lq-system-blue)', 'var(--lq-system-gray)', 'var(--lq-system-gray)'][i]!}>{t[0]}</Icon>} accessory="disclosure" onPress={() => nav?.push(<PlaceDetail name={t} sub={t} i={i} />)} />
            ))}
          </Section>
        </List>
      </ScrollView>
    </Screen>
  );
}

function SheetContent({ onClose }: { onClose(): void }) {
  return (
    <NavigationStack>
      <Screen title="Sheet" leading={<BarButton label="Cancel" onPress={onClose} />} trailing={<BarButton label="Done" prominent onPress={onClose} />}>
        <ScrollView aria-label="Sheet content">
          <List>
            <Section header="Drag the sheet or scroll" footer="At medium the sheet is glass; past the midpoint it turns opaque (deep/sheets §4).">
              {Array.from({ length: 24 }, (_, i) => (
                <Row key={i} title={`${PLACES[i % 8]![0]} · ${i + 1}`} subtitle={PLACES[i % 8]![1]} />
              ))}
            </Section>
          </List>
        </ScrollView>
      </Screen>
    </NavigationStack>
  );
}

export function App() {
  const [appearance, setAppearance] = useState<AppearanceSetting>(q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'light');
  const [sheet, setSheet] = useState(q.get('sheet') === '1');
  const [tab, setTab] = useState(q.get('tab') ?? 'components');
  const safeArea = useMemo(() => (q.has('desktop') ? undefined : { top: 62, bottom: 34 }), []);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__setTab = setTab;
  }, []);
  return (
    <LiquidRoot appearance={appearance} safeArea={safeArea}>
      <Expose />
      <TabView selection={tab} onSelectionChange={setTab} minimizeBehavior="onScrollDown">
        <Tab id="components" label="Components" icon={<HouseFill />}>
          <NavigationStack>
            <ComponentsHome appearance={appearance} setAppearance={setAppearance} openSheet={() => setSheet(true)} />
          </NavigationStack>
        </Tab>
        <Tab id="photos" label="Photos" icon={<SquareGridFill />} badge={3}>
          <Photos />
        </Tab>
        <Tab id="settings" label="Settings" icon={<GearIcon />}>
          <NavigationStack>
            <Settings />
          </NavigationStack>
        </Tab>
      </TabView>
      <Sheet isPresented={sheet} onDismiss={() => setSheet(false)} detents={['medium', 'large']} aria-label="Sheet">
        <SheetContent onClose={() => setSheet(false)} />
      </Sheet>
    </LiquidRoot>
  );
}
