/**
 * @liquid-gpu/react foundation (STEP 1). Stable API, documented in ./README.md.
 */
export { LiquidRoot, type LiquidRootProps, type AppearanceSetting } from './LiquidRoot';
export {
  useLiquid,
  useLiquidOptional,
  useLayerContext,
  LiquidContext,
  LayerContext,
  ScrollContext,
  LayoutShiftContext,
  ZBaseContext,
  type LiquidContextValue,
  type LayerContextValue,
  type ScrollContextValue,
  type LayoutShiftContextValue,
  type SafeAreaInsets,
  type RendererMode,
} from './context';
export { useLayer, LayerView, type UseLayerOptions, type LayerProps } from './Layer';
export { useGlass, useGlassCore, useLocalRect, toRGBA, GlassAppearanceContext, type GlassOptions, type GlassGeometry } from './useGlass';
export { Glass, type GlassProps, type GlassHandle } from './Glass';
export { useSpring, createSpring, resolvePreset, type SpringHandle, type SpringSetOptions } from './useSpring';
export { useFlex, createFlexController, type FlexController, type FlexState, type UseFlexOptions } from './useFlex';
export { GestureArena, type GestureRecognizer, type GestureSample, type GestureDecision } from './gestures';
export { zBands } from './zBands';
export { themeCss, injectTheme, cssVar, cssVarName, fontStack } from './theme';
export {
  measureInLayer,
  transformRect,
  multiply,
  translation,
  toDOMMatrix,
  affineScale,
  intersectRects,
  rectsEqual,
  extraTranslation,
  IDENTITY,
  type Affine,
} from './geometry';
export { OverlayPortal, useIsPageOverlay, type OverlayPortalProps } from './OverlayPortal';
export { useTheme } from './useTheme';
export {
  themeVars,
  resolveTheme,
  resolveThemeColor,
  type ThemeOverrides,
  type ThemeColor,
  type SemanticColorName,
  type ResolvedTheme,
} from './theme';
export { SceneRegistry, type RegistryRenderer, type RegistryStats } from './registry';
export type { LiquidRootMode, OverlayPlacement } from './context';
