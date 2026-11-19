export { Icon, resolveIcon, isIconElement, type IconProps, type ResolveIconOptions } from './Icon';
export {
  iconRegistry,
  iconNames,
  registerIcons,
  hasIcon,
  findIconName,
  normalizeIconName,
  getIconEntry,
  resetIconWarnings,
  resolveIconColor,
  iconStrokeWidth,
  ICON_WEIGHT_SCALE,
  DEFAULT_ICON_STROKE,
  PLACEHOLDER_ICON,
} from './registry';
export { builtinGlyphs, builtinAliases } from './glyphs';
export type { IconDefinition, IconEntry, IconLayer, IconNode, IconPaint, IconRenderer, IconRenderProps, IconWeight } from './types';
