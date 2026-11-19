/**
 * Example specs (what a model is expected to produce): a Settings app with push navigation, a sign-up form with
 * checks, and a dashboard with Metric tiles and charts. Used by the demo and the tests; handy as few-shot examples.
 */
import type { Spec } from '@json-render/core';

export const settingsSpec: Spec = {
  root: 'nav',
  elements: {
    nav: { type: 'NavigationStack', props: { destinations: { wifi: 'wifi-screen', notifications: 'notif-screen' } }, children: ['settings'] },
    settings: { type: 'Screen', props: { title: 'Settings', largeTitle: true }, children: ['list'] },
    list: { type: 'List', props: {}, children: ['account', 'network', 'general'] },
    account: { type: 'Section', props: {}, children: ['profile'] },
    profile: {
      type: 'Row',
      props: { title: 'Ana Lee', subtitle: 'Apple Account, iCloud, and more', icon: 'person.crop.circle.fill', accessory: 'disclosure' },
      children: [],
    },
    network: { type: 'Section', props: {}, children: ['airplane', 'wifi-link', 'bluetooth'] },
    airplane: { type: 'Row', props: { title: 'Airplane Mode', icon: 'paperplane.fill', iconBackground: 'orange' }, slots: { trailing: ['airplane-switch'] }, children: [] },
    'airplane-switch': { type: 'Switch', props: { isOn: { $bindState: '/settings/airplane' } }, children: [] },
    'wifi-link': {
      type: 'NavigationLink',
      props: { value: 'wifi', title: 'Wi-Fi', icon: 'wifi', detail: { $cond: { $state: '/settings/wifi' }, $then: 'Home', $else: 'Off' } },
      children: [],
    },
    bluetooth: { type: 'Row', props: { title: 'Bluetooth', icon: 'headphones', iconBackground: 'blue', detail: 'On', accessory: 'disclosure' }, children: [] },
    general: { type: 'Section', props: { footer: 'Notifications and sounds for this device.' }, children: ['notif-link', 'volume-row'] },
    'notif-link': { type: 'NavigationLink', props: { value: 'notifications', title: 'Notifications', icon: 'bell.fill' }, children: [] },
    'volume-row': { type: 'Row', props: {}, children: ['volume'] },
    volume: { type: 'Slider', props: { value: { $bindState: '/settings/volume' }, min: 0, max: 1, minimumIcon: 'speaker.fill', maximumIcon: 'speaker.wave.2.fill' }, children: [] },

    'wifi-screen': { type: 'Screen', props: { title: 'Wi-Fi' }, children: ['wifi-list'] },
    'wifi-list': { type: 'List', props: {}, children: ['wifi-section', 'networks'] },
    'wifi-section': { type: 'Section', props: {}, children: ['wifi-toggle'] },
    'wifi-toggle': { type: 'Row', props: { title: 'Wi-Fi' }, slots: { trailing: ['wifi-switch'] }, children: [] },
    'wifi-switch': { type: 'Switch', props: { isOn: { $bindState: '/settings/wifi' } }, children: [] },
    networks: { type: 'Section', props: { header: 'Networks' }, visible: { $state: '/settings/wifi' }, repeat: { statePath: '/networks', key: 'name' }, children: ['network-row'] },
    'network-row': { type: 'Row', props: { title: { $item: 'name' }, icon: 'wifi', detail: { $item: 'security' } }, children: [] },

    'notif-screen': { type: 'Screen', props: { title: 'Notifications' }, children: ['notif-list'] },
    'notif-list': { type: 'List', props: {}, children: ['notif-section'] },
    'notif-section': { type: 'Section', props: { header: 'Display As' }, children: ['notif-style', 'previews'] },
    'notif-style': {
      type: 'Picker',
      props: {
        pickerStyle: 'segmented',
        options: [
          { value: 'count', label: 'Count' },
          { value: 'stack', label: 'Stack' },
          { value: 'list', label: 'List' },
        ],
        selection: { $bindState: '/settings/notificationStyle' },
      },
      children: [],
    },
    previews: { type: 'Row', props: { title: 'Show Previews' }, slots: { trailing: ['previews-switch'] }, children: [] },
    'previews-switch': { type: 'Switch', props: { isOn: { $bindState: '/settings/previews' } }, children: [] },
  },
  state: {
    settings: { airplane: false, wifi: true, volume: 0.6, notificationStyle: 'stack', previews: true },
    networks: [
      { name: 'Home', security: 'WPA3' },
      { name: 'Café Guest', security: 'Open' },
      { name: 'Studio 5G', security: 'WPA2' },
    ],
  },
};

export const signUpSpec: Spec = {
  root: 'card',
  elements: {
    card: { type: 'VStack', props: { spacing: 0, alignment: 'leading', maxWidth: 'infinity' }, children: ['form', 'done-toast'] },
    form: { type: 'Form', props: { values: { $bindState: '/signup' } }, on: {
        submit: [
          { action: 'signUp', params: { values: { $state: '/signup' } } },
          { action: 'setState', params: { statePath: '/ui/created', value: true } },
        ],
      }, children: ['account', 'prefs', 'submit'] },
    account: { type: 'FormSection', props: { header: 'Account', footer: 'Use at least 8 characters.' }, children: ['name', 'email', 'password', 'confirm'] },
    name: { type: 'TextFieldRow', props: { name: 'name', label: 'Name', placeholder: 'Jane Appleseed', checks: [{ type: 'required' }] }, children: [] },
    email: { type: 'TextFieldRow', props: { name: 'email', label: 'Email', placeholder: 'name@example.com', keyboard: 'email', checks: [{ type: 'required' }, { type: 'email' }] }, children: [] },
    password: { type: 'SecureFieldRow', props: { name: 'password', label: 'Password', checks: [{ type: 'required' }, { type: 'minLength', value: 8 }] }, children: [] },
    confirm: {
      type: 'SecureFieldRow',
      props: { name: 'confirm', label: 'Confirm', checks: [{ type: 'required' }, { type: 'matches', value: 'password', message: 'Passwords do not match.' }] },
      children: [],
    },
    prefs: { type: 'FormSection', props: { header: 'Preferences' }, children: ['plan', 'news', 'guests'] },
    plan: {
      type: 'Field',
      props: { name: 'plan', label: 'Plan' },
      children: ['plan-picker'],
    },
    'plan-picker': {
      type: 'Picker',
      props: {
        options: [
          { value: 'free', label: 'Free' },
          { value: 'pro', label: 'Pro' },
          { value: 'team', label: 'Team' },
        ],
      },
      children: [],
    },
    news: { type: 'ToggleRow', props: { name: 'newsletter', label: 'Newsletter', defaultValue: true }, children: [] },
    guests: { type: 'StepperRow', props: { name: 'seats', label: 'Seats', min: 1, max: 10, format: '{value} seats' }, children: [] },
    submit: { type: 'SubmitButton', props: { label: 'Create Account' }, children: [] },
    'done-toast': { type: 'Toast', props: { openPath: '/ui/created', message: 'Account created', icon: 'checkmark.circle.fill' }, children: [] },
  },
  state: { signup: { name: '', email: '', password: '', confirm: '', plan: 'pro', seats: 1 }, ui: { created: false } },
};

const week = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const dashboardSpec: Spec = {
  root: 'dash',
  elements: {
    dash: { type: 'VStack', props: { spacing: 14, padding: 'standard', alignment: 'leading', maxWidth: 'infinity' }, children: ['header', 'range', 'kpis', 'revenue-card', 'split'] },
    header: { type: 'HStack', props: { spacing: 8, maxWidth: 'infinity' }, children: ['title', 'spacer', 'live', 'menu'] },
    title: { type: 'Heading', props: { text: 'Store Overview', level: 2 }, children: [] },
    spacer: { type: 'Spacer', props: {}, children: [] },
    live: { type: 'Tag', props: { label: 'Live', color: 'green', icon: 'bolt.fill' }, children: [] },
    menu: {
      type: 'Menu',
      props: {
        icon: 'ellipsis',
        variant: 'glass',
        items: [
          [
            { id: 'export', title: 'Export CSV', icon: 'square.and.arrow.up' },
            { id: 'share', title: 'Share', icon: 'person.2' },
          ],
          [{ id: 'reset', title: 'Reset Filters', icon: 'arrow.counterclockwise', destructive: true }],
        ],
      },
      on: { export: { action: 'exportData', params: { range: { $state: '/range' } } } },
      children: [],
    },
    range: {
      type: 'SegmentedControl',
      props: { segments: ['Day', 'Week', 'Month'], selection: { $bindState: '/range' } },
      children: [],
    },
    kpis: { type: 'Grid', props: { columns: 2, spacing: 12, alignment: 'fill' }, children: ['m-revenue', 'm-orders', 'm-conv', 'm-latency'] },
    'm-revenue': { type: 'Metric', props: { label: 'Revenue', value: 48210, format: 'currency', delta: 0.124, deltaLabel: 'vs last week', sparkline: [32, 35, 31, 40, 42, 45, 48], icon: 'dollarsign.circle' }, children: [] },
    'm-orders': { type: 'Metric', props: { label: 'Orders', value: 1284, delta: 0.051, sparkline: [980, 1010, 1100, 1090, 1180, 1220, 1284], icon: 'bag' }, children: [] },
    'm-conv': { type: 'Metric', props: { label: 'Conversion', value: 0.034, format: 'percent', delta: -0.08, icon: 'chart.line.uptrend.xyaxis' }, children: [] },
    'm-latency': { type: 'Metric', props: { label: 'p95 Latency', value: '182 ms', delta: -0.12, invertDelta: true, sparkline: [240, 230, 210, 220, 200, 190, 182], icon: 'timer' }, children: [] },
    'revenue-card': { type: 'GroupBox', props: { label: 'Revenue by Channel' }, children: ['revenue-chart'] },
    'revenue-chart': {
      type: 'BarChart',
      props: {
        data: week.flatMap((day, i) => [
          { day, channel: 'Online', amount: 3200 + ((i * 937) % 1800) },
          { day, channel: 'Retail', amount: 1800 + ((i * 611) % 1200) },
        ]),
        x: 'day',
        y: 'amount',
        series: 'channel',
        height: 200,
        yAxis: { format: 'compact' },
        cornerRadius: 3,
      },
      children: [],
    },
    split: { type: 'Grid', props: { columns: 2, spacing: 12, alignment: 'fill' }, children: ['traffic-card', 'mix-card'] },
    'traffic-card': { type: 'GroupBox', props: { label: 'Visitors' }, children: ['traffic'] },
    traffic: {
      type: 'AreaChart',
      props: { data: week.map((day, i) => ({ day, visits: 1200 + Math.round(600 * Math.sin(i / 1.4)) + i * 80 })), x: 'day', y: 'visits', height: 150, interpolation: 'monotone', showLine: true, yAxis: { format: 'compact' } },
      children: [],
    },
    'mix-card': { type: 'GroupBox', props: { label: 'Sales Mix' }, children: ['mix'] },
    mix: {
      type: 'PieChart',
      props: {
        data: [
          { cat: 'Apparel', share: 42 },
          { cat: 'Shoes', share: 27 },
          { cat: 'Bags', share: 18 },
          { cat: 'Other', share: 13 },
        ],
        x: 'cat',
        y: 'share',
        innerRadius: 0.6,
        height: 150,
        centerLabel: 'Units',
        showLegend: false,
      },
      children: [],
    },
  },
  state: { range: 'Week' },
};

export const exampleSpecs = { settings: settingsSpec, signUp: signUpSpec, dashboard: dashboardSpec } as const;

/** Serialise a spec as json-render's SpecStream (one JSONL patch per line), the format `catalog.prompt()` asks for. */
export function specToPatches(spec: Spec): string {
  const lines: string[] = [JSON.stringify({ op: 'add', path: '/root', value: spec.root })];
  // Parents before children: walk the tree from the root, then any elements not reached (destinations).
  const order: string[] = [];
  const seen = new Set<string>();
  const visit = (id: string) => {
    if (seen.has(id) || !spec.elements[id]) return;
    seen.add(id);
    order.push(id);
    const el = spec.elements[id]!;
    for (const c of [...(el.children ?? []), ...Object.values(el.slots ?? {}).flat()]) visit(c);
  };
  visit(spec.root);
  for (const id of Object.keys(spec.elements)) visit(id);
  // State first so bound controls show their values as soon as they stream in.
  for (const [k, v] of Object.entries(spec.state ?? {})) lines.push(JSON.stringify({ op: 'add', path: `/state/${k}`, value: v }));
  for (const id of order) lines.push(JSON.stringify({ op: 'add', path: `/elements/${id.replace(/~/g, '~0').replace(/\//g, '~1')}`, value: spec.elements[id] }));
  return lines.join('\n') + '\n';
}
