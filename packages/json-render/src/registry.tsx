/**
 * The registry: catalog type → adapter component. Every adapter is wrapped in a per-element error boundary and, while
 * a spec is still streaming, shows a Skeleton until its props satisfy the catalog schema.
 */
import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react';
import type { ComponentRegistry, ComponentRenderProps, ComponentRenderer } from '@json-render/react';
import { Skeleton } from '@liquid-gpu/react';
import { liquidComponents, type LiquidComponentName } from './schemas';
import * as basic from './adapters/basic';
import * as controls from './adapters/controls';
import * as form from './adapters/form';
import * as s from './adapters/structure';

type AnyAdapter = ComponentType<ComponentRenderProps<any>>;

/** Adapter per catalog component (unwrapped). */
export const liquidAdapters: Record<LiquidComponentName, AnyAdapter> = {
  VStack: basic.VStackAdapter,
  HStack: basic.HStackAdapter,
  ZStack: basic.ZStackAdapter,
  Spacer: basic.SpacerAdapter,
  Grid: basic.GridAdapter,
  Text: basic.TextAdapter,
  Heading: basic.HeadingAdapter,
  Icon: basic.IconAdapter,
  Image: basic.ImageAdapter,
  Avatar: basic.AvatarAdapter,
  AvatarGroup: basic.AvatarGroupAdapter,
  Badge: basic.BadgeAdapter,
  Tag: basic.TagAdapter,
  Skeleton: basic.SkeletonAdapter,
  Button: controls.ButtonAdapter,
  Switch: controls.SwitchAdapter,
  Slider: controls.SliderAdapter,
  Stepper: controls.StepperAdapter,
  SegmentedControl: controls.SegmentedControlAdapter,
  ProgressView: controls.ProgressViewAdapter,
  ActivityIndicator: controls.ActivityIndicatorAdapter,
  Gauge: controls.GaugeAdapter,
  TextField: controls.TextFieldAdapter,
  SearchField: controls.SearchFieldAdapter,
  Picker: controls.PickerAdapter,
  PickerRow: controls.PickerRowAdapter,
  WheelPicker: controls.WheelPickerAdapter,
  TextEditor: controls.TextEditorAdapter,
  ColorPicker: controls.ColorPickerAdapter,
  Toggle: controls.ToggleAdapter,
  ToggleGroup: controls.ToggleGroupAdapter,
  CheckmarkToggle: controls.CheckmarkToggleAdapter,
  Rating: controls.RatingAdapter,
  Tooltip: controls.TooltipAdapter,
  OneTimeCodeField: controls.OneTimeCodeFieldAdapter,
  Form: form.FormAdapter,
  FormSection: form.FormSectionAdapter,
  Field: form.FieldAdapter,
  TextFieldRow: form.TextFieldRowAdapter,
  SecureFieldRow: form.SecureFieldRowAdapter,
  ToggleRow: form.ToggleRowAdapter,
  StepperRow: form.StepperRowAdapter,
  SliderRow: form.SliderRowAdapter,
  SubmitButton: form.SubmitButtonAdapter,
  List: s.ListAdapter,
  Section: s.SectionAdapter,
  Row: s.RowAdapter,
  LabeledContent: s.LabeledContentAdapter,
  DisclosureGroup: s.DisclosureGroupAdapter,
  GroupBox: s.GroupBoxAdapter,
  Divider: s.DividerAdapter,
  Label: s.LabelAdapter,
  Link: s.LinkAdapter,
  ContentUnavailableView: s.ContentUnavailableViewAdapter,
  NavigationStack: s.NavigationStackAdapter,
  NavigationLink: s.NavigationLinkAdapter,
  Screen: s.ScreenAdapter,
  NavBar: s.NavBarAdapter,
  Toolbar: s.ToolbarAdapter,
  BarButton: s.BarButtonAdapter,
  Sheet: s.SheetAdapter,
  Alert: s.AlertAdapter,
  ConfirmationDialog: s.ConfirmationDialogAdapter,
  Toast: s.ToastAdapter,
  Popover: s.PopoverAdapter,
  Menu: s.MenuAdapter,
  ContextMenu: s.ContextMenuAdapter,
  BarChart: s.BarChartAdapter,
  LineChart: s.LineChartAdapter,
  AreaChart: s.AreaChartAdapter,
  PieChart: s.PieChartAdapter,
  Metric: s.MetricAdapter,
  Sparkline: s.SparklineAdapter,
  PageView: s.PageViewAdapter,
  PageControl: s.PageControlAdapter,
  TabView: s.TabViewAdapter,
  Tab: s.TabAdapter,
};

interface BoundaryProps {
  type: string;
  resetKey: unknown;
  onError?: ((error: unknown, type: string) => void) | undefined;
  children: ReactNode;
}

/** Per-element error boundary: a throwing element renders nothing; it retries when its element changes. */
export class ElementBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidCatch(error: unknown, info: ErrorInfo) {
    if (this.props.onError) this.props.onError(error, this.props.type);
    else console.warn(`[liquid json-render] <${this.props.type}> failed to render:`, error, info.componentStack);
  }
  override componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** Props of an element whose `type` is in the catalog parse against its schema. */
export function propsComplete(type: string, props: unknown): boolean {
  const d = (liquidComponents as Record<string, { props: { safeParse(v: unknown): { success: boolean } } }>)[type];
  return d ? d.props.safeParse(props ?? {}).success : true;
}

export interface WrapOptions {
  /** While loading, render a Skeleton for elements whose props do not parse yet (default true). */
  skeletonWhileIncomplete?: boolean;
  onError?: (error: unknown, type: string) => void;
}

/** Wrap an adapter with the error boundary and the streaming skeleton. */
export function wrapAdapter(type: string, Adapter: AnyAdapter, options: WrapOptions = {}): ComponentRenderer {
  const { skeletonWhileIncomplete = true, onError } = options;
  function Wrapped(p: ComponentRenderProps<Record<string, unknown>>) {
    if (p.loading && skeletonWhileIncomplete && !propsComplete(type, p.element.props)) return <Skeleton lines={1} />;
    return (
      <ElementBoundary type={type} resetKey={p.element} onError={onError}>
        <Adapter {...p} />
      </ElementBoundary>
    );
  }
  Wrapped.displayName = `Liquid(${type})`;
  return Wrapped;
}

/** Unknown component types: a Skeleton while streaming, nothing afterwards. */
export function LiquidFallback({ loading }: ComponentRenderProps) {
  return loading ? <Skeleton lines={1} /> : null;
}

/**
 * Build a registry: the Liquid adapters plus `extra` components (catalog-agnostic json-render renderers, e.g. your
 * own `Card`), each wrapped in an error boundary.
 */
export function createLiquidRegistry(extra: ComponentRegistry = {}, options: WrapOptions = {}): ComponentRegistry {
  const out: ComponentRegistry = {};
  for (const [type, A] of Object.entries({ ...liquidAdapters, ...extra })) out[type] = wrapAdapter(type, A as AnyAdapter, options);
  return out;
}

/** The default registry (all Liquid components). */
export const liquidRegistry: ComponentRegistry = createLiquidRegistry();
