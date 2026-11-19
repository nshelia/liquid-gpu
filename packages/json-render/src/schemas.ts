/**
 * Zod prop schemas for every component in the Liquid catalog. Every prop is JSON-serialisable: icons are SF-Symbol
 * style names (`gear`, `bell.fill`), events are bound with the element's `on` field, two-way values with
 * `{ "$bindState": "/path" }`, overlays open from a boolean state path (`openPath`).
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------------------------------------------------

/** SF-Symbol-style icon name, e.g. `gear`, `bell.fill`, `square.and.arrow.up`. */
const icon = z.string();
/** System colour name (`blue`, `systemRed`, `secondaryLabel`, `tint`) or any CSS colour. */
const color = z.string();
const length = z.union([z.number(), z.string()]);
const maxLength = z.union([z.number(), z.literal('infinity')]);
const padding = z.union([z.number(), z.enum(['standard', 'margins'])]);
const hAlign = z.enum(['leading', 'center', 'trailing']);
const semanticColor = z.enum(['red', 'orange', 'yellow', 'green', 'mint', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'brown', 'gray', 'tint']);
const avatarSize = z.union([z.enum(['small', 'medium', 'large']), z.number()]);
const buttonVariant = z.enum(['plain', 'gray', 'tinted', 'filled', 'glass', 'prominentGlass', 'clearGlass']);
const buttonSize = z.enum(['mini', 'small', 'medium', 'large']);
const textStyle = z.enum(['largeTitle', 'title', 'title2', 'title3', 'headline', 'subheadline', 'body', 'callout', 'footnote', 'caption', 'caption2']);
const fontWeight = z.enum(['ultraLight', 'thin', 'light', 'regular', 'medium', 'semibold', 'bold', 'heavy', 'black']);
const axisFormat = z.enum(['number', 'percent', 'currency', 'compact']);
const interpolation = z.enum(['linear', 'catmullRom', 'monotone']);
const datum = z.record(z.string(), z.union([z.string(), z.number()]));
/** A DOM id (set an `id` prop on another element to anchor a popover to it). */
const domId = z.string();
/** Boolean state path that opens the overlay (`true` = shown); dismissing writes `false`. */
const openPath = z.string();

/**
 * A validation check. Two dialects are accepted and normalised: json-render's `{ type, args, message }`
 * (`{ "type": "minLength", "args": { "min": 8 } }`) and the Liquid form's `{ type, value, message }`
 * (`{ "type": "minLength", "value": 8 }`). Types: required, email, url, minLength, maxLength, min, max, pattern,
 * numeric, matches (another field name or `{ "$state": path }`), custom (a named validator).
 */
export const checkSchema = z.object({
  type: z.string(),
  message: z.string().optional(),
  value: z.union([z.number(), z.string()]).optional(),
  args: z.record(z.string(), z.unknown()).optional(),
  flags: z.string().optional(),
  protocols: z.array(z.string()).optional(),
  name: z.string().optional(),
});
export type CheckInput = z.infer<typeof checkSchema>;
const checks = z.array(checkSchema);
const validateOn = z.enum(['change', 'blur', 'submit']);

/** Menu / context-menu item. Selecting it emits the element event `event` (default: the item `id`). */
export const menuItemSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  icon: icon.optional(),
  destructive: z.boolean().optional(),
  disabled: z.boolean().optional(),
  checked: z.boolean().optional(),
  event: z.string().optional(),
});
export type MenuItemInput = z.infer<typeof menuItemSchema>;
const menuItems = z.union([z.array(menuItemSchema), z.array(z.array(menuItemSchema))]);

/** Row swipe action; swiping and tapping it emits the element event `event`. */
export const swipeActionSchema = z.object({
  label: z.string(),
  event: z.string(),
  role: z.enum(['destructive', 'normal']).optional(),
  color: color.optional(),
  icon: icon.optional(),
});
export type SwipeActionInput = z.infer<typeof swipeActionSchema>;

/** Alert / confirmation dialog button; pressing it emits `event` (if set) and closes the dialog. */
export const alertActionSchema = z.object({
  title: z.string(),
  role: z.enum(['cancel', 'destructive']).optional(),
  preferred: z.boolean().optional(),
  disabled: z.boolean().optional(),
  event: z.string().optional(),
});
export type AlertActionInput = z.infer<typeof alertActionSchema>;

const option = z.object({
  value: z.union([z.string(), z.number()]),
  label: z.string(),
  icon: icon.optional(),
  disabled: z.boolean().optional(),
});
export type OptionInput = z.infer<typeof option>;
const options = z.array(option);

const gridColumn = z.union([
  z.object({ type: z.literal('fixed'), size: z.number() }),
  z.object({ type: z.literal('flexible'), minimum: z.number().optional(), maximum: z.number().optional() }),
  z.object({ type: z.literal('adaptive'), minimum: z.number(), maximum: z.number().optional() }),
]);

const frame = {
  padding: padding.optional(),
  maxWidth: maxLength.optional(),
  maxHeight: maxLength.optional(),
  background: color.optional(),
  cornerRadius: z.number().optional(),
  id: domId.optional(),
};

const chartAxis = z.object({
  hidden: z.boolean().optional(),
  format: axisFormat.optional(),
  currency: z.string().optional(),
  ticks: z.number().optional(),
  domain: z.tuple([z.number(), z.number()]).optional(),
  includeZero: z.boolean().optional(),
  grid: z.boolean().optional(),
  label: z.string().optional(),
});
const chartRule = z.object({ value: z.number(), label: z.string().optional(), color: color.optional(), dashed: z.boolean().optional() });
const chartBase = {
  data: z.array(datum),
  x: z.string(),
  y: z.string(),
  series: z.string().optional(),
  height: z.number().optional(),
  colors: z.array(color).optional(),
  showLegend: z.boolean().optional(),
  xAxis: chartAxis.optional(),
  yAxis: chartAxis.optional(),
  rule: z.union([chartRule, z.array(chartRule)]).optional(),
  title: z.string().optional(),
  selectable: z.boolean().optional(),
  selection: z.string().nullable().optional(),
  animate: z.boolean().optional(),
};

const fieldBase = {
  name: z.string(),
  label: z.string().optional(),
  checks: checks.optional(),
  helpText: z.string().optional(),
  disabled: z.boolean().optional(),
};

const keyboard = z.enum(['text', 'email', 'password', 'number', 'tel', 'url', 'search']);

// ---------------------------------------------------------------------------------------------------------------------
// Component definitions
// ---------------------------------------------------------------------------------------------------------------------

export interface ComponentDefinition {
  props: z.ZodObject<z.ZodRawShape>;
  description: string;
  /** `['default']` for containers; named slots are filled with the element's `slots` field. */
  slots?: string[];
  /** Events the component emits (bind them with the element's `on` field). */
  events?: string[];
  /** Prop values used by the prompt's examples. */
  example?: Record<string, unknown>;
}

const def = <S extends z.ZodRawShape>(
  shape: S,
  description: string,
  extra: { slots?: string[]; events?: string[]; example?: Record<string, unknown> } = {},
) => ({ props: z.object(shape), description, ...extra });

const DEFAULT = ['default'];

export const liquidComponents = {
  // layout ------------------------------------------------------------------------------------------------------------
  VStack: def({ ...frame, spacing: z.number().optional(), alignment: hAlign.optional() }, 'Vertical stack (SwiftUI VStack); children top to bottom.', {
    slots: DEFAULT,
    example: { spacing: 12, padding: 'standard' },
  }),
  HStack: def(
    { ...frame, spacing: z.number().optional(), alignment: z.enum(['top', 'center', 'bottom', 'firstTextBaseline', 'lastTextBaseline']).optional() },
    'Horizontal stack (SwiftUI HStack); children leading to trailing, use Spacer to push apart.',
    { slots: DEFAULT, example: { spacing: 8 } },
  ),
  ZStack: def(
    { ...frame, alignment: z.enum(['topLeading', 'top', 'topTrailing', 'leading', 'center', 'trailing', 'bottomLeading', 'bottom', 'bottomTrailing']).optional() },
    'Overlay stack (SwiftUI ZStack); later children draw on top.',
    { slots: DEFAULT },
  ),
  Spacer: def({ minLength: z.number().optional() }, 'Flexible space that expands along the parent stack axis.'),
  Grid: def(
    {
      columns: z.union([z.number(), z.array(gridColumn)]).optional(),
      spacing: z.number().optional(),
      rowSpacing: z.number().optional(),
      alignment: z.enum(['leading', 'center', 'trailing', 'fill']).optional(),
      padding: padding.optional(),
    },
    'Grid (LazyVGrid): a column count or GridItem descriptors; children fill row by row. alignment "fill" stretches cells (equal-size cards).',
    { slots: DEFAULT, example: { columns: 2, spacing: 12 } },
  ),

  // text --------------------------------------------------------------------------------------------------------------
  Text: def(
    {
      text: z.string(),
      style: textStyle.optional(),
      weight: fontWeight.optional(),
      color: color.optional(),
      alignment: hAlign.optional(),
      lineLimit: z.number().optional(),
      monospacedDigit: z.boolean().optional(),
      italic: z.boolean().optional(),
      id: domId.optional(),
    },
    'Text in a Dynamic Type style (body, headline, footnote, caption…); color is a system colour name or CSS.',
    { example: { text: 'Hello', style: 'body' } },
  ),
  Heading: def(
    { text: z.string(), level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(), color: color.optional(), alignment: hAlign.optional(), weight: fontWeight.optional() },
    'Title text: level 1 = largeTitle, 2 = title, 3 = title2.',
    { example: { text: 'Overview', level: 2 } },
  ),

  // media -------------------------------------------------------------------------------------------------------------
  Icon: def(
    { name: icon, size: z.number().optional(), color: color.optional(), weight: z.enum(['ultralight', 'thin', 'light', 'regular', 'medium', 'semibold', 'bold', 'heavy', 'black']).optional(), label: z.string().optional() },
    'SF-Symbol-style icon by name (e.g. "heart.fill", "gear", "bell").',
    { example: { name: 'star.fill', color: 'yellow' } },
  ),
  Image: def(
    {
      src: z.string().optional(),
      alt: z.string().optional(),
      aspectRatio: z.union([z.number(), z.string()]).optional(),
      contentMode: z.enum(['fill', 'fit']).optional(),
      cornerRadius: z.union([z.number(), z.enum(['none', 'small', 'medium', 'large', 'capsule'])]).optional(),
      width: length.optional(),
      height: length.optional(),
    },
    'Remote image with a placeholder while loading; aspectRatio like 1.5 or "16/9".',
  ),
  Avatar: def({ src: z.string().optional(), name: z.string().optional(), size: avatarSize.optional(), initials: z.string().optional() }, 'Circular avatar: photo or monogram from name.', {
    example: { name: 'Ana Lee', size: 'medium' },
  }),
  AvatarGroup: def(
    { items: z.array(z.object({ src: z.string().optional(), name: z.string().optional() })), size: avatarSize.optional(), max: z.number().optional() },
    'Overlapping avatars with a "+N" chip beyond max.',
  ),
  Badge: def(
    { value: z.union([z.string(), z.number()]).optional(), color: semanticColor.optional(), variant: z.enum(['count', 'dot', 'label']).optional(), max: z.number().optional(), showZero: z.boolean().optional() },
    'Notification badge: count bubble, dot or short label.',
  ),
  Tag: def(
    { label: z.string(), color: semanticColor.optional(), variant: z.enum(['tinted', 'filled', 'gray']).optional(), size: z.enum(['small', 'regular']).optional(), icon: icon.optional() },
    'Capsule tag / chip with an optional icon.',
    { example: { label: 'New', color: 'blue' } },
  ),
  Skeleton: def(
    { lines: z.number().optional(), width: length.optional(), height: length.optional(), circle: z.boolean().optional(), radius: z.number().optional(), shimmer: z.boolean().optional() },
    'Loading placeholder: text lines, a block or a circle.',
  ),

  // controls ----------------------------------------------------------------------------------------------------------
  Button: def(
    {
      label: z.string().optional(),
      icon: icon.optional(),
      variant: buttonVariant.optional(),
      size: buttonSize.optional(),
      tint: color.optional(),
      role: z.enum(['destructive', 'cancel']).optional(),
      disabled: z.boolean().optional(),
      fullWidth: z.boolean().optional(),
      id: domId.optional(),
    },
    'Button (plain, gray, tinted, filled, glass, prominentGlass); emits press.',
    { events: ['press'], example: { label: 'Continue', variant: 'filled' } },
  ),
  Switch: def(
    { isOn: z.boolean().optional(), label: z.string().optional(), tint: color.optional(), disabled: z.boolean().optional() },
    'On/off switch; bind isOn with $bindState. With label it renders a labelled line.',
    { events: ['change'], example: { isOn: { $bindState: '/settings/wifi' }, label: 'Wi-Fi' } },
  ),
  Slider: def(
    {
      value: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
      ticks: z.number().optional(),
      snapToTicks: z.boolean().optional(),
      tint: color.optional(),
      disabled: z.boolean().optional(),
      minimumIcon: icon.optional(),
      maximumIcon: icon.optional(),
      label: z.string().optional(),
    },
    'Continuous slider; bind value. Optional min/max icons at the ends.',
    { events: ['change', 'changeEnd'], example: { value: { $bindState: '/volume' }, min: 0, max: 1 } },
  ),
  Stepper: def(
    { value: z.number().optional(), min: z.number().optional(), max: z.number().optional(), step: z.number().optional(), wraps: z.boolean().optional(), label: z.string().optional(), disabled: z.boolean().optional() },
    'Minus/plus stepper; bind value. With label renders "label: value" before it.',
    { events: ['change'] },
  ),
  SegmentedControl: def(
    {
      segments: z.array(z.union([z.string(), z.object({ value: z.union([z.string(), z.number()]), label: z.string(), icon: icon.optional() })])),
      selection: z.union([z.string(), z.number()]).optional(),
      width: z.number().optional(),
      disabled: z.boolean().optional(),
    },
    'Segmented control; segments as strings or {value,label}; bind selection.',
    { events: ['change'], example: { segments: ['Day', 'Week', 'Month'], selection: { $bindState: '/range' } } },
  ),
  ProgressView: def(
    { value: z.number().optional(), variant: z.enum(['default', 'bar']).optional(), tint: color.optional(), label: z.string().optional() },
    'Progress bar for value 0…1; without value an indeterminate spinner.',
  ),
  ActivityIndicator: def({ size: z.enum(['medium', 'large']).optional(), color: color.optional() }, 'Spinning activity indicator.'),
  Gauge: def(
    {
      value: z.number(),
      min: z.number().optional(),
      max: z.number().optional(),
      gaugeStyle: z.enum(['automatic', 'linearCapacity', 'accessoryLinear', 'accessoryLinearCapacity', 'accessoryCircular', 'accessoryCircularCapacity']).optional(),
      label: z.string().optional(),
      currentValueLabel: z.string().optional(),
      minimumValueLabel: z.string().optional(),
      maximumValueLabel: z.string().optional(),
      tint: color.optional(),
    },
    'Gauge (linear or circular) showing value within min…max.',
    { example: { value: 0.6, gaugeStyle: 'accessoryCircularCapacity', currentValueLabel: '60%' } },
  ),
  TextField: def(
    {
      value: z.string().optional(),
      placeholder: z.string().optional(),
      label: z.string().optional(),
      variant: z.enum(['roundedRect', 'plain']).optional(),
      keyboard: keyboard.optional(),
      clearButton: z.boolean().optional(),
      disabled: z.boolean().optional(),
      checks: checks.optional(),
      validateOn: validateOn.optional(),
    },
    'Single-line text input; bind value. checks validate it (errors show under the field).',
    { events: ['change', 'submit'], example: { value: { $bindState: '/query' }, placeholder: 'Name' } },
  ),
  SearchField: def(
    { value: z.string().optional(), placeholder: z.string().optional(), disabled: z.boolean().optional() },
    'Search field with magnifying glass; bind value; emits submit on Enter.',
    { events: ['change', 'submit'] },
  ),

  // picker ------------------------------------------------------------------------------------------------------------
  Picker: def(
    {
      options,
      selection: z.union([z.string(), z.number()]).optional(),
      label: z.string().optional(),
      pickerStyle: z.enum(['menu', 'inline', 'segmented', 'wheel']).optional(),
      disabled: z.boolean().optional(),
      footer: z.string().optional(),
      width: z.number().optional(),
    },
    'Picker over options [{value,label,icon?}] as menu, inline list, segmented or wheel; bind selection.',
    { events: ['change'], example: { label: 'Sort', options: [{ value: 'name', label: 'Name' }], selection: { $bindState: '/sort' } } },
  ),
  PickerRow: def(
    { label: z.string(), icon: icon.optional(), options, selection: z.union([z.string(), z.number()]).optional(), disabled: z.boolean().optional() },
    'List row with a title and a trailing pop-up menu picker; bind selection. Use inside a List Section or Form.',
    { events: ['change'] },
  ),
  WheelPicker: def(
    {
      columns: z.array(
        z.object({
          options,
          selection: z.union([z.string(), z.number()]).optional(),
          statePath: z.string().optional(),
          width: z.number().optional(),
          align: z.enum(['center', 'left', 'right']).optional(),
        }),
      ),
      disabled: z.boolean().optional(),
      width: length.optional(),
    },
    'Multi-column wheel picker; each column writes its selection to its own statePath.',
    { events: ['change'] },
  ),

  // inputs ------------------------------------------------------------------------------------------------------------
  TextEditor: def(
    {
      value: z.string().optional(),
      placeholder: z.string().optional(),
      variant: z.enum(['plain', 'roundedRect']).optional(),
      minLines: z.number().optional(),
      maxLines: z.number().optional(),
      showCount: z.boolean().optional(),
      maxLength: z.number().optional(),
      disabled: z.boolean().optional(),
      checks: checks.optional(),
      validateOn: validateOn.optional(),
    },
    'Multi-line text editor that grows with its content; bind value.',
    { events: ['change'] },
  ),
  ColorPicker: def(
    { value: z.string().optional(), label: z.string().optional(), swatches: z.array(z.string()).optional(), hideCustom: z.boolean().optional(), disabled: z.boolean().optional() },
    'Colour well row with a swatch grid; value is "#RRGGBB"; bind value.',
    { events: ['change'] },
  ),
  Toggle: def(
    { isOn: z.boolean().optional(), label: z.string().optional(), icon: icon.optional(), variant: z.enum(['plain', 'gray', 'tinted', 'glass']).optional(), size: buttonSize.optional(), tint: color.optional(), disabled: z.boolean().optional() },
    'Toggle button (pressed / unpressed, like a bold/italic button); bind isOn.',
    { events: ['change'] },
  ),
  ToggleGroup: def(
    {
      type: z.enum(['single', 'multiple']),
      items: z.array(z.object({ value: z.string(), label: z.string().optional(), icon: icon.optional(), disabled: z.boolean().optional() })),
      value: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
      variant: z.enum(['plain', 'gray', 'tinted', 'glass']).optional(),
      size: buttonSize.optional(),
      orientation: z.enum(['horizontal', 'vertical']).optional(),
      allowEmpty: z.boolean().optional(),
      disabled: z.boolean().optional(),
    },
    'Row of toggle buttons; single (value: string|null) or multiple (value: string[]); bind value.',
    { events: ['change'] },
  ),
  CheckmarkToggle: def(
    { isOn: z.boolean().optional(), label: z.string().optional(), tint: color.optional(), disabled: z.boolean().optional() },
    'Round checkmark toggle (Reminders-style) with a label; bind isOn.',
    { events: ['change'] },
  ),
  Rating: def(
    { value: z.number().optional(), max: z.number().optional(), allowHalf: z.boolean().optional(), readOnly: z.boolean().optional(), size: z.number().optional(), tint: color.optional() },
    'Star rating; bind value (0…max).',
    { events: ['change'] },
  ),
  Tooltip: def({ text: z.string(), placement: z.enum(['top', 'bottom']).optional() }, 'Tooltip shown on hover / long-press of its children.', { slots: DEFAULT }),
  OneTimeCodeField: def(
    { value: z.string().optional(), length: z.number().optional(), numeric: z.boolean().optional(), secure: z.boolean().optional(), groupSize: z.number().optional(), disabled: z.boolean().optional() },
    'One-time-code boxes (e.g. 6 digits); bind value; emits complete when filled.',
    { events: ['change', 'complete'] },
  ),

  // form --------------------------------------------------------------------------------------------------------------
  Form: def(
    { values: z.record(z.string(), z.unknown()).optional(), mode: z.enum(['submit', 'blur', 'change']).optional(), submitOnEnter: z.boolean().optional() },
    'Grouped form; bind values to a state object ({ "$bindState": "/signup" }); fields write values[name]. Emits submit when all checks pass, invalid otherwise.',
    { slots: DEFAULT, events: ['submit', 'invalid'], example: { values: { $bindState: '/signup' } } },
  ),
  FormSection: def({ header: z.string().optional(), footer: z.string().optional() }, 'Inset grouped section of a Form.', { slots: DEFAULT }),
  Field: def(
    { ...fieldBase, hideLabel: z.boolean().optional() },
    'Form row that binds any child control (Rating, Picker, ColorPicker, Toggle…) to values[name] with checks.',
    { slots: DEFAULT },
  ),
  TextFieldRow: def(
    { ...fieldBase, placeholder: z.string().optional(), labelStyle: z.enum(['inline', 'placeholder']).optional(), align: z.enum(['leading', 'trailing']).optional(), keyboard: keyboard.optional(), defaultValue: z.string().optional() },
    'Form text row bound to values[name]; checks like required, email, minLength.',
    { example: { name: 'email', label: 'Email', keyboard: 'email', checks: [{ type: 'required' }, { type: 'email' }] } },
  ),
  SecureFieldRow: def(
    { ...fieldBase, placeholder: z.string().optional(), labelStyle: z.enum(['inline', 'placeholder']).optional(), align: z.enum(['leading', 'trailing']).optional() },
    'Form password row (masked); use a matches check on a confirm field.',
  ),
  ToggleRow: def({ ...fieldBase, tint: color.optional(), defaultValue: z.boolean().optional() }, 'Form row with a trailing switch bound to values[name].'),
  StepperRow: def(
    { ...fieldBase, min: z.number().optional(), max: z.number().optional(), step: z.number().optional(), format: z.string().optional(), defaultValue: z.number().optional() },
    'Form row "label: value" with a stepper; format like "{value} guests".',
  ),
  SliderRow: def(
    {
      ...fieldBase,
      min: z.number().optional(),
      max: z.number().optional(),
      step: z.number().optional(),
      tint: color.optional(),
      minimumIcon: icon.optional(),
      maximumIcon: icon.optional(),
      showLabel: z.boolean().optional(),
      format: z.string().optional(),
      defaultValue: z.number().optional(),
    },
    'Form row with a slider bound to values[name].',
  ),
  SubmitButton: def(
    { label: z.string().optional(), appearance: z.enum(['prominent', 'row']).optional(), variant: buttonVariant.optional(), size: buttonSize.optional(), disabled: z.boolean().optional() },
    'Submits the enclosing Form (validates every field first).',
    { example: { label: 'Create Account' } },
  ),

  // list --------------------------------------------------------------------------------------------------------------
  List: def({}, 'Inset grouped list (Settings style); children are Sections.', { slots: DEFAULT }),
  Section: def({ header: z.string().optional(), footer: z.string().optional() }, 'List section card with optional header and footer; children are rows.', { slots: DEFAULT }),
  Row: def(
    {
      title: z.string().optional(),
      subtitle: z.string().optional(),
      detail: z.string().optional(),
      icon: icon.optional(),
      iconBackground: color.optional(),
      accessory: z.enum(['disclosure', 'checkmark', 'none']).optional(),
      selected: z.boolean().optional(),
      trailingActions: z.array(swipeActionSchema).optional(),
      leadingActions: z.array(swipeActionSchema).optional(),
    },
    'List row: icon, title, subtitle, trailing detail, accessory; swipe actions emit their event. Slot "trailing" for custom trailing content (e.g. a Switch).',
    { slots: ['default', 'trailing'], events: ['press'], example: { title: 'Notifications', icon: 'bell.fill', iconBackground: 'red', accessory: 'disclosure' } },
  ),
  LabeledContent: def({ label: z.string(), value: z.string().optional() }, 'Row with a leading label and trailing value (or custom children).', { slots: DEFAULT }),
  DisclosureGroup: def(
    { label: z.string(), isExpanded: z.boolean().optional(), defaultExpanded: z.boolean().optional() },
    'Expandable row that reveals its children; bind isExpanded optionally.',
    { slots: DEFAULT, events: ['change'] },
  ),
  GroupBox: def({ label: z.string().optional() }, 'Rounded grouped box with an optional label.', { slots: DEFAULT }),
  Divider: def({ vertical: z.boolean().optional() }, 'Thin separator line (vertical inside an HStack).'),
  Label: def({ title: z.string(), icon: icon.optional(), labelStyle: z.enum(['titleAndIcon', 'iconOnly', 'titleOnly']).optional() }, 'Icon + title label.', {
    events: ['press'],
  }),
  Link: def({ href: z.string(), label: z.string().optional(), inline: z.boolean().optional(), target: z.string().optional() }, 'Hyperlink in the tint colour.'),
  ContentUnavailableView: def(
    { title: z.string(), systemImage: icon.optional(), description: z.string().optional() },
    'Empty state: large symbol, title, description; slot "actions" for buttons.',
    { slots: ['actions'] },
  ),

  // navigation --------------------------------------------------------------------------------------------------------
  NavigationStack: def(
    { destinations: z.record(z.string(), z.string()).optional(), path: z.array(z.string()).optional() },
    'Push navigation. Child = root Screen. destinations maps a value to the element id of the Screen pushed by NavigationLink { value }.',
    { slots: DEFAULT, example: { destinations: { wifi: 'wifi-screen' } } },
  ),
  NavigationLink: def(
    {
      value: z.string(),
      title: z.string().optional(),
      subtitle: z.string().optional(),
      detail: z.string().optional(),
      icon: icon.optional(),
      variant: buttonVariant.optional(),
      disabled: z.boolean().optional(),
      as: z.enum(['row', 'button']).optional(),
    },
    'Row (inside a List) or button that pushes the NavigationStack destination named by value.',
    { events: ['press'], example: { value: 'wifi', title: 'Wi-Fi', icon: 'wifi', detail: 'Home' } },
  ),
  Screen: def(
    {
      title: z.string().optional(),
      largeTitle: z.boolean().optional(),
      hideNavBar: z.boolean().optional(),
      background: z.string().optional(),
      backButton: z.boolean().optional(),
      scrollEdge: z.enum(['automatic', 'hard', 'none']).optional(),
      scroll: z.boolean().optional(),
    },
    'Screen with a navigation bar title, large or inline; content scrolls under the bar (scroll: false for a fixed layout). Slots: "leading"/"trailing" for BarButtons, "toolbar" for a Toolbar.',
    { slots: ['default', 'leading', 'trailing', 'toolbar'], example: { title: 'Settings', largeTitle: true } },
  ),
  NavBar: def(
    { title: z.string().optional(), large: z.boolean().optional(), backButton: z.boolean().optional(), scrollEdge: z.enum(['automatic', 'hard', 'none']).optional() },
    'Standalone navigation bar (Screen already includes one). Slots "leading"/"trailing".',
    { slots: ['leading', 'trailing'] },
  ),
  Toolbar: def({}, 'Bottom glass toolbar; children are BarButtons (and Spacers).', { slots: DEFAULT }),
  BarButton: def(
    { icon: icon.optional(), label: z.string().optional(), prominent: z.boolean().optional(), tint: color.optional(), disabled: z.boolean().optional() },
    'Glass bar button for nav bars and toolbars (icon name or label); emits press.',
    { events: ['press'], example: { icon: 'plus' } },
  ),

  // overlays ----------------------------------------------------------------------------------------------------------
  Sheet: def(
    { openPath, title: z.string().optional(), detents: z.array(z.enum(['medium', 'large'])).optional(), initialDetent: z.enum(['medium', 'large']).optional(), dismissible: z.boolean().optional(), grabber: z.boolean().optional() },
    'Bottom sheet shown while the boolean at openPath is true; children are its content.',
    { slots: DEFAULT, events: ['dismiss'], example: { openPath: '/ui/sheetOpen', detents: ['medium', 'large'] } },
  ),
  Alert: def(
    { openPath, title: z.string().optional(), message: z.string().optional(), actions: z.array(alertActionSchema).optional() },
    'Centered alert shown while openPath is true; each action emits its event and closes it.',
    { slots: DEFAULT, events: ['dismiss'], example: { openPath: '/ui/alert', title: 'Delete?', actions: [{ title: 'Cancel', role: 'cancel' }, { title: 'Delete', role: 'destructive', event: 'delete' }] } },
  ),
  ConfirmationDialog: def(
    { openPath, title: z.string().optional(), message: z.string().optional(), actions: z.array(alertActionSchema).optional() },
    'Action sheet (stacked buttons) shown while openPath is true; each action emits its event.',
    { events: ['dismiss'] },
  ),
  Toast: def(
    { openPath, message: z.string(), icon: icon.optional(), duration: z.number().optional(), placement: z.enum(['top', 'bottom']).optional() },
    'Transient glass toast shown while openPath is true; auto-dismisses after duration seconds.',
    { events: ['dismiss'] },
  ),
  Popover: def(
    { openPath, anchor: domId.optional(), width: z.number().optional(), arrowEdge: z.enum(['top', 'bottom', 'any']).optional() },
    'Popover with an arrow pointing at the element whose id prop equals anchor (else at its own position); children are its content.',
    { slots: DEFAULT, events: ['dismiss'] },
  ),
  Menu: def(
    {
      items: menuItems,
      label: z.string().optional(),
      icon: icon.optional(),
      variant: buttonVariant.optional(),
      size: buttonSize.optional(),
      tint: color.optional(),
      disabled: z.boolean().optional(),
      value: z.string().optional(),
    },
    'Button that opens a glass menu. items: [{id,title,icon?,destructive?,checked?,event?}] or groups [[…],[…]]; selecting emits the item event (default its id) and select, and writes the id to a bound value.',
    { events: ['select'], example: { label: 'Sort', icon: 'arrow.up.arrow.down', items: [{ id: 'name', title: 'Name' }, { id: 'date', title: 'Date' }] } },
  ),
  ContextMenu: def(
    { items: menuItems, disabled: z.boolean().optional(), value: z.string().optional() },
    'Long-press / right-click menu over its children; items as in Menu.',
    { slots: DEFAULT, events: ['select'] },
  ),

  // charts ------------------------------------------------------------------------------------------------------------
  BarChart: def(
    { ...chartBase, orientation: z.enum(['vertical', 'horizontal']).optional(), stacking: z.enum(['stacked', 'grouped']).optional(), cornerRadius: z.number().optional() },
    'Bar chart (Swift Charts BarMark) over data rows; x = category key, y = value key, series = grouping key.',
    { events: ['select'], example: { data: [{ day: 'Mon', steps: 4200 }], x: 'day', y: 'steps' } },
  ),
  LineChart: def(
    { ...chartBase, interpolation: interpolation.optional(), showPoints: z.boolean().optional(), lineWidth: z.number().optional() },
    'Line chart over data rows; series splits lines.',
    { events: ['select'] },
  ),
  AreaChart: def(
    { ...chartBase, stacked: z.boolean().optional(), interpolation: interpolation.optional(), showLine: z.boolean().optional(), opacity: z.number().optional() },
    'Area chart over data rows; stacked by series.',
    { events: ['select'] },
  ),
  PieChart: def(
    {
      data: z.array(datum),
      x: z.string(),
      y: z.string(),
      height: z.number().optional(),
      innerRadius: z.number().optional(),
      angularInset: z.number().optional(),
      colors: z.array(color).optional(),
      showLegend: z.boolean().optional(),
      format: axisFormat.optional(),
      currency: z.string().optional(),
      center: z.enum(['total', 'selection', 'none']).optional(),
      centerLabel: z.string().optional(),
      title: z.string().optional(),
      selectable: z.boolean().optional(),
      selection: z.string().nullable().optional(),
      animate: z.boolean().optional(),
    },
    'Pie or donut (innerRadius 0.6) chart; x = sector name key, y = value key.',
    { events: ['select'] },
  ),
  Metric: def(
    {
      label: z.string(),
      value: z.union([z.number(), z.string()]),
      format: axisFormat.optional(),
      currency: z.string().optional(),
      delta: z.number().optional(),
      deltaFormat: axisFormat.optional(),
      deltaLabel: z.string().optional(),
      invertDelta: z.boolean().optional(),
      sparkline: z.union([z.array(z.number()), z.array(datum)]).optional(),
      sparklineKey: z.string().optional(),
      tint: color.optional(),
      icon: icon.optional(),
      size: z.enum(['regular', 'large']).optional(),
      card: z.boolean().optional(),
    },
    'KPI tile: label, big value, delta (0.12 = +12%) and optional sparkline.',
    { example: { label: 'Revenue', value: 48200, format: 'currency', delta: 0.12 } },
  ),
  Sparkline: def(
    {
      data: z.union([z.array(z.number()), z.array(datum)]),
      y: z.string().optional(),
      height: z.number().optional(),
      width: z.number().optional(),
      color: color.optional(),
      interpolation: interpolation.optional(),
      lineWidth: z.number().optional(),
      fill: z.boolean().optional(),
      showEndPoint: z.boolean().optional(),
    },
    'Tiny trend line without axes.',
  ),

  // pages & tabs ------------------------------------------------------------------------------------------------------
  PageView: def(
    { page: z.number().optional(), indexDisplayMode: z.enum(['automatic', 'always', 'never']).optional(), backgroundDisplayMode: z.enum(['automatic', 'interactive', 'always', 'never']).optional(), height: z.number().optional() },
    'Horizontally paging carousel; each child is a page; bind page optionally.',
    { slots: DEFAULT, events: ['change'] },
  ),
  PageControl: def(
    { numberOfPages: z.number(), currentPage: z.number().optional(), backgroundStyle: z.enum(['automatic', 'prominent', 'minimal']).optional(), hidesForSinglePage: z.boolean().optional() },
    'Page dots; bind currentPage.',
    { events: ['change'] },
  ),
  TabView: def(
    { selection: z.string().optional(), minimizeBehavior: z.enum(['never', 'onScrollDown']).optional(), height: z.number().optional() },
    'Tab bar app container; children are Tab elements; bind selection to the Tab id.',
    { slots: DEFAULT, events: ['change'] },
  ),
  Tab: def(
    { id: z.string(), label: z.string().optional(), icon: icon.optional(), badge: z.union([z.string(), z.number()]).optional(), role: z.enum(['search', 'prominent']).optional() },
    'One tab of a TabView (id, label, icon); children are its content (usually a NavigationStack or Screen).',
    { slots: DEFAULT },
  ),
} satisfies Record<string, ComponentDefinition>;

export type LiquidComponentName = keyof typeof liquidComponents;
export type LiquidProps<K extends LiquidComponentName> = z.infer<(typeof liquidComponents)[K]['props']>;
