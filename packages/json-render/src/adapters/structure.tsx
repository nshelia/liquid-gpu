/**
 * List, navigation, overlay, chart and paging adapters: swipe actions / menu items → handlers emitting element events,
 * `openPath` → isPresented / onDismiss, NavigationStack destinations (element ids) → screens, Tab children → <Tab>.
 */
import { Fragment, isValidElement, useContext, useId, useMemo, type ReactElement, type ReactNode } from 'react';
import { resolveElementProps, type UIElement } from '@json-render/core';
import { useStateStore } from '@json-render/react';
import {
  ActionSheet,
  Alert,
  AreaChart,
  BarButton,
  BarChart,
  ContentUnavailableView,
  ContextMenu,
  DisclosureGroup,
  Divider,
  GroupBox,
  Label,
  LabeledContent,
  LineChart,
  Link,
  List,
  Menu,
  Metric,
  NavBar,
  NavigationLink,
  NavigationStack,
  PageControl,
  PageView,
  PieChart,
  Popover,
  Row,
  Screen,
  ScrollView,
  Section,
  Sheet,
  Sparkline,
  Tab,
  TabView,
  Text,
  Toast,
  Toolbar,
  emptyStateSymbols,
  resolveColor,
  type AlertAction,
  type NavigationDestinations,
} from '@liquid-gpu/react';
import { ElementById, SpecContext, childArray, createMenuSelect, icon, toMenuContent, toSwipeActions, useBoundProp, useOpenPath } from '../runtime';
import type { AlertActionInput } from '../schemas';
import { defined, type P } from './types';

/** json-render passes `[]` for an element without children; components that test `children` need `undefined`. */
function nonEmpty(children: ReactNode): ReactNode | undefined {
  return childArray(children).some((c) => c !== null && c !== undefined && c !== false) ? children : undefined;
}

function slot(slots: Record<string, ReactNode> | undefined, name: string): ReactNode | undefined {
  return slots ? nonEmpty(slots[name]) : undefined;
}

// list ---------------------------------------------------------------------------------------------------------------

export function ListAdapter({ children }: P<'List'>) {
  return <List>{children}</List>;
}

export function SectionAdapter({ element, children }: P<'Section'>) {
  return <Section {...defined(element.props)}>{children}</Section>;
}

/** Settings-style icon: white glyph on a rounded colour square (or a plain tinted glyph without a background). */
function rowIcon(name: string | undefined, background: string | undefined): ReactNode {
  if (!name) return undefined;
  if (!background) return icon(name, 22);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 22,
        height: 22,
        borderRadius: 6,
        background: resolveColor(background) ?? background,
        color: '#fff',
      }}
    >
      {icon(name, 15)}
    </span>
  );
}

export function RowAdapter({ element, children, slots, emit, on }: P<'Row'>) {
  const { icon: name, iconBackground, trailingActions, leadingActions, title, subtitle, detail, accessory, selected } = element.props;
  const press = on('press');
  const trailing = slot(slots, 'trailing');
  const custom = nonEmpty(children);
  return (
    <Row
      {...defined({ title, subtitle, detail, accessory, selected })}
      {...(name ? { icon: rowIcon(name, iconBackground) } : {})}
      {...(press.bound && !trailing ? { onPress: () => emit('press') } : {})}
      {...(trailingActions?.length ? { trailingActions: toSwipeActions(trailingActions, emit) } : {})}
      {...(leadingActions?.length ? { leadingActions: toSwipeActions(leadingActions, emit) } : {})}
      {...(trailing ? { trailing } : {})}
    >
      {custom}
    </Row>
  );
}

export function LabeledContentAdapter({ element, children }: P<'LabeledContent'>) {
  const { label, value } = element.props;
  return (
    <LabeledContent label={label ?? ''} {...defined({ value })}>
      {nonEmpty(children)}
    </LabeledContent>
  );
}

export function DisclosureGroupAdapter(p: P<'DisclosureGroup'>) {
  const { label, defaultExpanded } = p.element.props;
  const [expanded, setExpanded] = useBoundProp<boolean>(p, 'isExpanded', 'change', defaultExpanded ?? false);
  return (
    <DisclosureGroup label={label ?? ''} isExpanded={!!expanded} onExpandedChange={setExpanded}>
      {p.children}
    </DisclosureGroup>
  );
}

export function GroupBoxAdapter({ element, children }: P<'GroupBox'>) {
  return <GroupBox {...defined(element.props)}>{children}</GroupBox>;
}

export function DividerAdapter({ element }: P<'Divider'>) {
  return <Divider {...defined(element.props)} />;
}

export function LabelAdapter({ element }: P<'Label'>) {
  const { title, icon: name, labelStyle } = element.props;
  return <Label title={title ?? ''} {...defined({ labelStyle })} {...(name ? { icon: icon(name) } : {})} />;
}

export function LinkAdapter({ element }: P<'Link'>) {
  const { href, label, inline, target } = element.props;
  return (
    <Link href={href ?? '#'} {...defined({ inline, target: target ?? '_blank' })}>
      {label ?? href}
    </Link>
  );
}

export function ContentUnavailableViewAdapter({ element, slots }: P<'ContentUnavailableView'>) {
  const { title, systemImage, description } = element.props;
  const image = systemImage ? (systemImage in emptyStateSymbols ? systemImage : icon(systemImage, 48)) : undefined;
  const actions = slot(slots, 'actions');
  return <ContentUnavailableView title={title ?? ''} {...defined({ description, systemImage: image, actions })} />;
}

// navigation ---------------------------------------------------------------------------------------------------------

export function NavigationStackAdapter(p: P<'NavigationStack'>) {
  const { destinations } = p.element.props;
  const key = JSON.stringify(destinations ?? {});
  const dests = useMemo<NavigationDestinations>(
    () => Object.fromEntries(Object.entries(destinations ?? {}).map(([value, id]) => [value, <ElementById key={id} id={id} />])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const bound = !!p.bindings?.path;
  const [path, setPath] = useBoundProp<string[]>(p, 'path', 'change');
  const kids = childArray(p.children);
  const root: ReactElement = kids.length === 1 && isValidElement(kids[0]) ? kids[0] : <Fragment>{p.children}</Fragment>;
  return <NavigationStack root={root} destinations={dests} {...(bound ? { path: Array.isArray(path) ? path : [], onPathChange: setPath } : {})} />;
}

export function NavigationLinkAdapter({ element, emit, on }: P<'NavigationLink'>) {
  const { icon: name, value, ...rest } = element.props;
  const press = on('press');
  return (
    <NavigationLink
      value={value ?? ''}
      {...defined(rest)}
      {...(name ? { icon: icon(name, 22) } : {})}
      {...(press.bound ? { onPress: () => emit('press') } : {})}
    />
  );
}

export function ScreenAdapter({ element, children, slots }: P<'Screen'>) {
  const leading = slot(slots, 'leading');
  const trailing = slot(slots, 'trailing');
  const toolbar = slot(slots, 'toolbar');
  const { scroll = true, ...props } = element.props;
  return (
    <Screen {...defined(props)} {...defined({ leading, trailing, toolbar })}>
      {scroll ? <ScrollView {...(props.title ? { 'aria-label': props.title } : {})}>{children}</ScrollView> : children}
    </Screen>
  );
}

export function NavBarAdapter({ element, slots }: P<'NavBar'>) {
  const leading = slot(slots, 'leading');
  const trailing = slot(slots, 'trailing');
  return <NavBar {...defined(element.props)} {...defined({ leading, trailing })} />;
}

export function ToolbarAdapter({ children }: P<'Toolbar'>) {
  return <Toolbar>{children}</Toolbar>;
}

export function BarButtonAdapter({ element, emit }: P<'BarButton'>) {
  const { icon: name, label, ...rest } = element.props;
  return (
    <BarButton
      {...defined(rest)}
      {...(name ? { icon: icon(name, 20) } : {})}
      {...(label ? { label } : {})}
      aria-label={label ?? name ?? 'Button'}
      onPress={() => emit('press')}
    />
  );
}

// overlays -----------------------------------------------------------------------------------------------------------

export function SheetAdapter({ element, children, emit }: P<'Sheet'>) {
  const { openPath, title, ...rest } = element.props;
  const [open, dismiss] = useOpenPath(openPath, emit);
  return (
    <Sheet isPresented={open} onDismiss={dismiss} {...defined(rest)} {...(title ? { 'aria-label': title } : {})}>
      {title ? (
        <Text style="headline" alignment="center" cssStyle={{ display: 'block', padding: '18px 16px 8px' }}>
          {title}
        </Text>
      ) : null}
      {children}
    </Sheet>
  );
}

function toAlertActions(actions: AlertActionInput[] | undefined, emit: (e: string) => void, dismiss: () => void): AlertAction[] | undefined {
  if (!Array.isArray(actions)) return undefined;
  return actions
    .filter((a) => a && typeof a.title === 'string')
    .map((a) => ({
      ...defined({ title: a.title, role: a.role, preferred: a.preferred, disabled: a.disabled }),
      onPress: () => {
        if (a.event) emit(a.event);
        dismiss();
      },
    }));
}

export function AlertAdapter({ element, children, emit }: P<'Alert'>) {
  const { openPath, title, message, actions } = element.props;
  const [open, dismiss] = useOpenPath(openPath, emit);
  const list = toAlertActions(actions, emit, dismiss);
  return (
    <Alert isPresented={open} onDismiss={dismiss} {...defined({ title, message, actions: list })}>
      {nonEmpty(children)}
    </Alert>
  );
}

export function ConfirmationDialogAdapter({ element, emit }: P<'ConfirmationDialog'>) {
  const { openPath, title, message, actions } = element.props;
  const [open, dismiss] = useOpenPath(openPath, emit);
  const list = toAlertActions(actions, emit, dismiss);
  return <ActionSheet isPresented={open} onDismiss={dismiss} {...defined({ title, message, actions: list })} />;
}

export function ToastAdapter({ element, emit }: P<'Toast'>) {
  const { openPath, message, icon: name, duration, placement } = element.props;
  const [open, dismiss] = useOpenPath(openPath, emit);
  return (
    <Toast isPresented={open} onDismiss={dismiss} {...defined({ duration, placement })} {...(name ? { icon: icon(name, 20) } : {})}>
      {message ?? ''}
    </Toast>
  );
}

export function PopoverAdapter({ element, children, emit }: P<'Popover'>) {
  const { openPath, anchor, width, arrowEdge } = element.props;
  const [open, dismiss] = useOpenPath(openPath, emit);
  const own = `lq-popover-anchor-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const target = anchor && typeof document !== 'undefined' && document.getElementById(anchor) ? anchor : own;
  return (
    <>
      <span id={own} aria-hidden style={{ display: 'block', width: 1, height: 1 }} />
      <Popover isPresented={open} onDismiss={dismiss} anchor={target} {...defined({ width, arrowEdge })}>
        {children}
      </Popover>
    </>
  );
}

function useMenuSelect(p: P<'Menu'> | P<'ContextMenu'>) {
  const { set } = useStateStore();
  return createMenuSelect(set, p.bindings?.value, p.emit);
}

export function MenuAdapter(p: P<'Menu'>) {
  const { items, label, icon: name, value: _v, ...rest } = p.element.props;
  const select = useMenuSelect(p);
  const content = toMenuContent(items, select);
  return (
    <Menu items={content} {...defined(rest)} {...(label ? { label } : {})} {...(name ? { icon: icon(name, 17) } : {})} aria-label={label ?? name ?? 'Menu'} />
  );
}

export function ContextMenuAdapter(p: P<'ContextMenu'>) {
  const { items, disabled } = p.element.props;
  const select = useMenuSelect(p);
  return (
    <ContextMenu items={toMenuContent(items, select)} {...defined({ disabled })}>
      <div>{p.children}</div>
    </ContextMenu>
  );
}

// charts -------------------------------------------------------------------------------------------------------------

function useChartSelection(p: P<'BarChart'> | P<'LineChart'> | P<'AreaChart'> | P<'PieChart'>) {
  const bound = !!p.bindings?.selection;
  const [sel, setSel] = useBoundProp<string | null>(p, 'selection', 'select', null);
  return bound ? { selection: sel ?? null, onSelectionChange: setSel } : { onSelectionChange: () => p.emit('select') };
}

export function BarChartAdapter(p: P<'BarChart'>) {
  const { data, x, y, selection: _s, ...rest } = p.element.props;
  return <BarChart data={Array.isArray(data) ? data : []} x={x ?? 'x'} y={y ?? 'y'} {...defined(rest)} {...useChartSelection(p)} />;
}

export function LineChartAdapter(p: P<'LineChart'>) {
  const { data, x, y, selection: _s, ...rest } = p.element.props;
  return <LineChart data={Array.isArray(data) ? data : []} x={x ?? 'x'} y={y ?? 'y'} {...defined(rest)} {...useChartSelection(p)} />;
}

export function AreaChartAdapter(p: P<'AreaChart'>) {
  const { data, x, y, selection: _s, ...rest } = p.element.props;
  return <AreaChart data={Array.isArray(data) ? data : []} x={x ?? 'x'} y={y ?? 'y'} {...defined(rest)} {...useChartSelection(p)} />;
}

export function PieChartAdapter(p: P<'PieChart'>) {
  const { data, x, y, selection: _s, ...rest } = p.element.props;
  return <PieChart data={Array.isArray(data) ? data : []} x={x ?? 'x'} y={y ?? 'y'} {...defined(rest)} {...useChartSelection(p)} />;
}

export function MetricAdapter({ element }: P<'Metric'>) {
  const { label, value, icon: name, ...rest } = element.props;
  return <Metric label={label ?? ''} value={value ?? '–'} {...defined(rest)} {...(name ? { icon: icon(name, 17) } : {})} />;
}

export function SparklineAdapter({ element }: P<'Sparkline'>) {
  const { data, ...rest } = element.props;
  return <Sparkline data={Array.isArray(data) ? (data as number[]) : []} {...defined(rest)} />;
}

// pages & tabs -------------------------------------------------------------------------------------------------------

export function PageViewAdapter(p: P<'PageView'>) {
  const { height, indexDisplayMode, backgroundDisplayMode } = p.element.props;
  const [page, setPage] = useBoundProp<number>(p, 'page', 'change', 0);
  const pages = childArray(p.children).filter((c) => c !== null && c !== undefined);
  return (
    <PageView page={page ?? 0} onPageChange={setPage} {...defined({ indexDisplayMode, backgroundDisplayMode })} style={{ height: height ?? 240 }}>
      {pages}
    </PageView>
  );
}

export function PageControlAdapter(p: P<'PageControl'>) {
  const { numberOfPages, backgroundStyle, hidesForSinglePage } = p.element.props;
  const [page, setPage] = useBoundProp<number>(p, 'currentPage', 'change', 0);
  return <PageControl numberOfPages={numberOfPages ?? 1} currentPage={page ?? 0} onChange={(n) => setPage(n)} {...defined({ backgroundStyle, hidesForSinglePage })} />;
}

/** A Tab element renders its content; TabView reads the Tab props from the spec (it needs them as `<Tab>` props). */
export function TabAdapter({ children }: P<'Tab'>) {
  return <>{children}</>;
}

export function TabViewAdapter(p: P<'TabView'>) {
  const ctx = useContext(SpecContext);
  const { state } = useStateStore();
  const { minimizeBehavior, height } = p.element.props;
  const keys = (p.element as UIElement).children ?? [];
  const rendered = childArray(p.children);
  const tabs = keys
    .map((key, i) => {
      const el = ctx?.spec.elements[key];
      if (!el || el.type !== 'Tab') return null;
      const props = resolveElementProps(el.props ?? {}, { stateModel: state }) as { id?: string; label?: string; icon?: string; badge?: string | number; role?: 'search' | 'prominent' };
      const id = props.id ?? key;
      return (
        <Tab key={id} id={id} {...defined({ label: props.label, badge: props.badge, role: props.role })} {...(props.icon ? { icon: icon(props.icon, 24) } : {})}>
          {rendered[i]}
        </Tab>
      );
    })
    .filter((t): t is ReactElement => t !== null);
  const first = (tabs[0]?.props as { id?: string } | undefined)?.id;
  const [sel, setSel] = useBoundProp<string>(p, 'selection', 'change', first);
  return (
    <div style={{ position: 'relative', height: height ?? 520, overflow: 'hidden' }}>
      <TabView {...(sel ? { selection: sel } : {})} onSelectionChange={setSel} {...defined({ minimizeBehavior })}>
        {tabs}
      </TabView>
    </div>
  );
}
