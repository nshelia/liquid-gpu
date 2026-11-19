/**
 * Design tokens: semantic colours per appearance, type scale, radii, metrics, haptics.
 *
 * Sources (under ~/Documents/uikit-internals/):
 *   RP  = reference-page.html (Color: `const SEM`, `const TINT`; Type: `const DT` + "Style detail";
 *         Layout: "Layout metrics" table). Re-checked by findings/token-verification.md.
 *   TV  = findings/token-verification.md (§c tracking / line metrics, wght 590)
 *   BA  = components/bars-appearances.md
 *   BR  = components/bars.md
 *   CT  = components/controls.md
 *   LS  = components/lists.md
 *   TO  = components/text_overlays.md
 *   TR  = findings/transitions.md
 *   SMG = findings/scroll-motion-gestures.md
 *   MO  = deep/motion/findings.md
 *   HF  = deep/haptics-framerate/findings.md
 */

export type Appearance = 'light' | 'dark';
export type AppearanceVariant = 'light' | 'dark' | 'darkElevated' | 'lightHC' | 'darkHC' | 'darkElevatedHC';

/** "#RRGGBB" or "#RRGGBB@alpha" (the extraction's notation) → CSS colour string. */
export function cssColor(token: string): string {
  const [hex, alphaText] = token.split('@') as [string, string | undefined];
  if (alphaText === undefined) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${Number(alphaText)})`;
}

// Row order: light, dark, darkElevated, lightHC, darkHC, darkElevatedHC (RP `V6`).
type Row6 = readonly [string, string, string, string, string, string];

/** RP `const SEM` (108/108 cells verified in TV §b). */
const SEMANTIC: Record<string, Row6> = {
  label: ['#000000', '#FFFFFF', '#FFFFFF', '#000000', '#FFFFFF', '#FFFFFF'],
  secondaryLabel: ['#3C3C43@0.60', '#EBEBF5@0.60', '#EBEBF5@0.60', '#3C3C43@0.80', '#EBEBF5@0.70', '#EBEBF5@0.70'],
  tertiaryLabel: ['#3C3C43@0.30', '#EBEBF5@0.30', '#EBEBF5@0.30', '#3C3C43@0.70', '#EBEBF5@0.55', '#EBEBF5@0.55'],
  quaternaryLabel: ['#3C3C43@0.18', '#EBEBF5@0.16', '#EBEBF5@0.16', '#3C3C43@0.55', '#EBEBF5@0.40', '#EBEBF5@0.40'],
  placeholderText: ['#3C3C43@0.30', '#EBEBF5@0.30', '#EBEBF5@0.30', '#3C3C43@0.70', '#EBEBF5@0.55', '#EBEBF5@0.55'],
  link: ['#007AFF', '#0984FF', '#0984FF', '#007AFF', '#0984FF', '#0984FF'],
  systemBackground: ['#FFFFFF', '#000000', '#1C1C1E', '#FFFFFF', '#000000', '#242426'],
  secondarySystemBackground: ['#F2F2F7', '#1C1C1E', '#2C2C2E', '#EBEBF0', '#242426', '#363638'],
  tertiarySystemBackground: ['#FFFFFF', '#2C2C2E', '#3A3A3C', '#FFFFFF', '#363638', '#444446'],
  systemGroupedBackground: ['#F2F2F7', '#000000', '#1C1C1E', '#EBEBF0', '#000000', '#242426'],
  secondarySystemGroupedBackground: ['#FFFFFF', '#1C1C1E', '#2C2C2E', '#FFFFFF', '#242426', '#363638'],
  tertiarySystemGroupedBackground: ['#F2F2F7', '#2C2C2E', '#3A3A3C', '#EBEBF0', '#363638', '#444446'],
  systemFill: ['#787880@0.20', '#787880@0.36', '#787880@0.36', '#787880@0.28', '#787880@0.44', '#787880@0.44'],
  secondarySystemFill: ['#787880@0.16', '#787880@0.32', '#787880@0.32', '#787880@0.24', '#787880@0.40', '#787880@0.40'],
  tertiarySystemFill: ['#767680@0.12', '#767680@0.24', '#767680@0.24', '#767680@0.20', '#767680@0.32', '#767680@0.32'],
  quaternarySystemFill: ['#747480@0.08', '#767680@0.18', '#767680@0.18', '#747480@0.16', '#767680@0.26', '#767680@0.26'],
  separator: ['#3C3C43@0.12', '#545458@0.50', '#545458@0.50', '#3C3C43@0.12', '#545458@0.50', '#545458@0.50'],
  // _UIGrabber: backdrop −0.228 (light) / +0.275 (dark).
  sheetGrabber: ['#000000@0.24', '#FFFFFF@0.30', '#FFFFFF@0.30', '#000000@0.24', '#FFFFFF@0.30', '#FFFFFF@0.30'],
  opaqueSeparator: ['#E7E7E8', '#2A2A2C', '#2A2A2C', '#E7E7E8', '#2A2A2C', '#2A2A2C'],
};

// Tints: light, dark, lightHC, darkHC (RP `const TINT`; elevated = base, RP "Elevated values match").
type Row4 = readonly [string, string, string, string];

/** RP `const TINT` (systemGray corrected per TV §a #1–3, already reflected in RP). */
const TINTS: Record<string, Row4> = {
  systemRed: ['#FF383C', '#FF4245', '#E9152D', '#FF6165'],
  systemOrange: ['#FF8D28', '#FF9230', '#C55300', '#FFA056'],
  systemYellow: ['#FFCC00', '#FFD600', '#A16A00', '#FEDF43'],
  systemGreen: ['#34C759', '#30D158', '#008932', '#4AD968'],
  systemMint: ['#00C8B3', '#00DAC3', '#008575', '#54DFCB'],
  systemTeal: ['#00C3D0', '#00D2E0', '#008198', '#3BDDEC'],
  systemCyan: ['#00C0E8', '#3CD3FE', '#007EAE', '#6DD9FF'],
  systemBlue: ['#0088FF', '#0091FF', '#1E6EF4', '#5CB8FF'],
  systemIndigo: ['#6155F5', '#6D7CFF', '#564ADE', '#A7AAFF'],
  systemPurple: ['#CB30E0', '#DB34F2', '#B02FC2', '#EA8DFF'],
  systemPink: ['#FF2D55', '#FF375F', '#E7124D', '#FF8AC4'],
  systemBrown: ['#AC7F5E', '#B78A66', '#956D51', '#DBA679'],
  systemGray: ['#8E8E93', '#8E8E93', '#6C6C70', '#AEAEB2'],
  systemGray2: ['#AEAEB2', '#636366', '#8E8E93', '#7C7C80'],
  systemGray3: ['#C7C7CC', '#48484A', '#AEAEB2', '#545456'],
  systemGray4: ['#D1D1D6', '#3A3A3C', '#BCBCC0', '#444446'],
  systemGray5: ['#E5E5EA', '#2C2C2E', '#D8D8DC', '#363638'],
  systemGray6: ['#F2F2F7', '#1C1C1E', '#EBEBF0', '#242426'],
};

/**
 * Component colours: light, dark, lightHC, darkHC. Elevated variants reuse dark / darkHC
 * unless noted. Where a source gives only light/dark, HC repeats the base value (noted).
 */
const COMPONENT: Record<string, Row4> = {
  tint: ['#0088FF', '#0091FF', '#1E6EF4', '#5CB8FF'], // BR §0 / BA: system tint = systemBlue
  barBadge: ['#FF383C', '#FF4245', '#E9152D', '#FF6165'], // BA bar item badge fill
  barItemDisabled: ['#3C3C43@0.298', '#3C3C43@0.298', '#3C3C43@0.298', '#3C3C43@0.298'], // BR §0 (light only measured) TODO(unknown) dark/HC
  barProminentText: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#000000'], // BA prominent/.done text
  tabUnselected: ['#000000', '#FFFFFF', '#000000', '#FFFFFF'], // BA tab unselected tint
  searchPlaceholder: ['#3C3C43@0.600', '#EBEBF5@0.600', '#3C3C43@0.800', '#EBEBF5@0.698'], // BA
  scrollIndicator: ['#000000@0.350', '#FFFFFF@0.500', '#000000@0.350', '#FFFFFF@0.500'], // BA
  tableBackground: ['#FFFFFF', '#000000', '#FFFFFF', '#000000'], // LS §0 plain table background
  groupedBackground: ['#F2F2F7', '#000000', '#EBEBF0', '#000000'], // LS §0 grouped background
  cellPlain: ['#FFFFFF', '#000000', '#FFFFFF', '#000000'], // LS §0
  cellGrouped: ['#FFFFFF', '#1C1C1E', '#FFFFFF', '#242426'], // LS §0
  cellSelected: ['#D1D1D6', '#3A3A3C', '#BCBCC0', '#444446'], // LS §0 systemGray4
  listHeaderText: ['#3C3C43@0.60', '#EBEBF5@0.60', '#3C3C43@0.60', '#EBEBF5@0.698'], // LS §0
  chevron: ['#3C3C43@0.298', '#EBEBF5@0.298', '#3C3C43@0.698', '#EBEBF5@0.549'], // LS §0 accessory tint
  switchTrackOff: ['#3C3C43@0.298', '#EBEBF5@0.298', '#3C3C43@0.698', '#EBEBF5@0.549'], // CT §2.2
  switchTrackOn: ['#34C759', '#30D158', '#008932', '#4AD968'], // CT §2.2
  switchThumb: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'], // CT §2.2 lists #EBEBF5@0.30 (dark) for the lens fill; the iOS 27 renders (deep/swiftui-components/out/raw/png) show an opaque white knob
  switchOffGlyph: ['#B3B3B3', '#B3B3B3', '#FFFFFF', '#FFFFFF'], // CT §2.2
  sliderTrack: ['#000000@0.10', '#FFFFFF@0.10', '#000000@0.10', '#FFFFFF@0.10'], // CT §3.1 (HC not measured) TODO(unknown) HC
  sliderThumb: ['#FFFFFF', '#FFFFFF', '#FFFFFF', '#FFFFFF'], // CT §3.1 lists #EBEBF5@0.30 dark (lens fill); iOS 27 renders show opaque white
  sliderTick: ['#C6C6C8', '#38383A', '#C6C6C8', '#38383A'], // CT §3.1 (HC not measured) TODO(unknown) HC
  segmentedBackground: ['#767680@0.12', '#767680@0.24', '#767680@0.12', '#767680@0.24'], // CT §5.1 (≈ values; HC not measured) TODO(unknown) HC
  segmentedThumb: ['#FFFFFF', '#EBEBF5@0.30', '#FFFFFF', '#EBEBF5@0.30'], // CT §5.1; dark from segmented.3.traits JSON
  stepperFill: ['#3C3C43@0.086', '#E6E6F2@0.078', '#3C3C43@0.086', '#E6E6F2@0.078'], // CT §4.1 (HC not measured) TODO(unknown) HC
  stepperDivider: ['#3C3C43@0.298', '#EBEBF5@0.298', '#3C3C43@0.698', '#EBEBF5@0.549'], // CT §4.1
  stepperPressed: ['#000000@0.08', '#000000@0.08', '#000000@0.08', '#000000@0.08'], // CT §4.1 (light only) TODO(unknown) dark
  menuSeparator: ['#000000@0.08', '#000000@0.08', '#000000@0.08', '#000000@0.08'], // TO §10.1 (light only) TODO(unknown) dark
  alertMessage: ['#3C3C43@0.60', '#EBEBF5@0.60', '#3C3C43@0.80', '#EBEBF5@0.698'], // TO §9.1
  sheetDimming: ['#000000@0.20', '#000000@0.48', '#000000@0.20', '#000000@0.48'], // TR §3a 0.20 light / 0.48 dark
  alertDimming: ['#000000@0.20', '#000000@0.48', '#000000@0.20', '#000000@0.48'], // TR §7
  navDimming: ['#000000@0.10', '#000000@0.10', '#000000@0.10', '#000000@0.10'], // TR §1 _UIParallaxDimmingView α 0.10
  zoomDimming: ['#000000@0.15', '#000000@0.15', '#000000@0.15', '#000000@0.15'], // TR §4 dimmingOpacity 0.15
  contextMenuDimming: ['#000000@0.20', '#000000@0.20', '#000000@0.20', '#000000@0.20'], // photos-transition §1 black @0.20
};

function buildVariant(variant: AppearanceVariant): Record<string, string> {
  const i6 = { light: 0, dark: 1, darkElevated: 2, lightHC: 3, darkHC: 4, darkElevatedHC: 5 }[variant];
  // Tints and component rows have no elevated column: elevated = base (RP).
  const i4 = { light: 0, dark: 1, darkElevated: 1, lightHC: 2, darkHC: 3, darkElevatedHC: 3 }[variant];
  const out: Record<string, string> = {};
  for (const [name, row] of Object.entries(SEMANTIC)) out[name] = cssColor(row[i6]!);
  for (const [name, row] of Object.entries(TINTS)) out[name] = cssColor(row[i4]!);
  for (const [name, row] of Object.entries(COMPONENT)) out[name] = cssColor(row[i4]!);
  // LS §0 dark elevated plain/grouped backgrounds.
  if (variant === 'darkElevated' || variant === 'darkElevatedHC') {
    out.tableBackground = cssColor('#1C1C1E');
    out.groupedBackground = cssColor('#1C1C1E');
    out.cellPlain = cssColor('#1C1C1E');
    out.cellGrouped = cssColor('#2C2C2E');
  }
  return out;
}

/** Every appearance variant. */
export const colorVariants: Record<AppearanceVariant, Record<string, string>> = {
  light: buildVariant('light'),
  dark: buildVariant('dark'),
  darkElevated: buildVariant('darkElevated'),
  lightHC: buildVariant('lightHC'),
  darkHC: buildVariant('darkHC'),
  darkElevatedHC: buildVariant('darkElevatedHC'),
};

/** Light and dark (the ARCHITECTURE contract). High contrast: `colorsHighContrast`; elevated: `colorVariants`. */
export const colors: Record<Appearance, Record<string, string>> = {
  light: colorVariants.light,
  dark: colorVariants.dark,
};

export const colorsHighContrast: Record<Appearance, Record<string, string>> = {
  light: colorVariants.lightHC,
  dark: colorVariants.darkHC,
};

// ---------------------------------------------------------------------------
// Typography
// ---------------------------------------------------------------------------

/**
 * CSS font weights. Semibold = wght 590 (TV §c headline "wght 590").
 * TODO(unknown): wght axis values for Regular, Medium (trait 0.23) and Bold (trait 0.4) were not read.
 */
export const fontWeights = {
  regular: 400,
  medium: 510,
  semibold: 590,
  bold: 700,
} as const;

/** The system font is one variable face `.SFUI` with an optical-size axis (RP Type). */
export const fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro", "Helvetica Neue", sans-serif';

export interface TextStyle {
  size: number;
  weight: number;
  lineHeight: number;
  /** Tracking in points at this size (TV §c; built into Apple's glyph advances). */
  tracking: number;
  /** Optical size: equals the point size above 17, held at 17 below (RP Type). */
  opticalSize: number;
}

/** RP "Style detail at the default size (Large)", line heights and tracking from TV §c. */
export const textStyles = {
  largeTitle: { size: 34, weight: fontWeights.regular, lineHeight: 40.574, tracking: 0.39, opticalSize: 34 },
  title1: { size: 28, weight: fontWeights.regular, lineHeight: 33.414, tracking: 0.383, opticalSize: 28 },
  title2: { size: 22, weight: fontWeights.regular, lineHeight: 26.254, tracking: -0.258, opticalSize: 22 },
  title3: { size: 20, weight: fontWeights.regular, lineHeight: 23.867, tracking: -0.449, opticalSize: 20 },
  headline: { size: 17, weight: fontWeights.semibold, lineHeight: 20.287, tracking: -0.432, opticalSize: 17 },
  body: { size: 17, weight: fontWeights.regular, lineHeight: 20.287, tracking: -0.432, opticalSize: 17 },
  callout: { size: 16, weight: fontWeights.regular, lineHeight: 19.094, tracking: -0.313, opticalSize: 17 },
  subheadline: { size: 15, weight: fontWeights.regular, lineHeight: 17.9, tracking: -0.234, opticalSize: 17 },
  footnote: { size: 13, weight: fontWeights.regular, lineHeight: 15.514, tracking: -0.076, opticalSize: 17 },
  caption1: { size: 12, weight: fontWeights.regular, lineHeight: 14.32, tracking: 0, opticalSize: 17 },
  caption2: { size: 11, weight: fontWeights.regular, lineHeight: 13.127, tracking: 0.064, opticalSize: 17 },
} satisfies Record<string, TextStyle>;

export type TextStyleName = keyof typeof textStyles;

export const contentSizeCategories = ['xS', 'S', 'M', 'L', 'xL', 'xxL', 'xxxL', 'AX1', 'AX2', 'AX3', 'AX4', 'AX5'] as const;
export type ContentSizeCategory = (typeof contentSizeCategories)[number];

/** RP `const DT`: point size per style per content size category (132/132 verified, TV §b). */
export const dynamicTypeSizes: Record<TextStyleName, readonly number[]> = {
  largeTitle: [31, 32, 33, 34, 36, 38, 40, 44, 48, 52, 56, 60],
  title1: [25, 26, 27, 28, 30, 32, 34, 38, 43, 48, 53, 58],
  title2: [19, 20, 21, 22, 24, 26, 28, 34, 39, 44, 50, 56],
  title3: [17, 18, 19, 20, 22, 24, 26, 31, 37, 43, 49, 55],
  headline: [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53],
  body: [14, 15, 16, 17, 19, 21, 23, 28, 33, 40, 47, 53],
  callout: [13, 14, 15, 16, 18, 20, 22, 26, 32, 38, 44, 51],
  subheadline: [12, 13, 14, 15, 17, 19, 21, 25, 30, 36, 42, 49],
  footnote: [12, 12, 12, 13, 15, 17, 19, 23, 27, 33, 38, 44],
  caption1: [11, 11, 11, 12, 14, 16, 18, 22, 26, 32, 37, 43],
  caption2: [11, 11, 11, 11, 13, 15, 17, 20, 24, 29, 34, 40],
};

export function dynamicTypeSize(style: TextStyleName, category: ContentSizeCategory = 'L'): number {
  return dynamicTypeSizes[style][contentSizeCategories.indexOf(category)]!;
}

/** Component type that differs from the text styles. */
export const componentType = {
  navTitle: { size: 17, weight: fontWeights.semibold, lineHeight: 20.2871, maxSize: 21 }, // BR §1.2 (21 at AX3)
  navLargeTitle: { size: 34, weight: fontWeights.bold, lineHeight: 40.5742 }, // BR §1.3
  barItemText: { size: 17, weight: fontWeights.medium, maxSize: 21 }, // BA plain text item
  tabLabel: { size: 10, weight: fontWeights.medium, selectedWeight: fontWeights.semibold }, // BR §3.2
  segmentLabel: { size: 13, weight: fontWeights.regular, selectedWeight: fontWeights.medium }, // CT §5.1
  listHeader: { size: 17, weight: fontWeights.semibold, lineHeight: 20.29 }, // LS typography
  listFooter: { size: 13, weight: fontWeights.regular, lineHeight: 15.51 }, // LS typography
  swipeButton: { size: 13, weight: fontWeights.regular }, // LS typography
  alertTitle: { size: 17, weight: fontWeights.semibold }, // TO §9.1
  alertMessage: { size: 15, weight: fontWeights.regular }, // TO §9.1
  alertAction: { size: 17, weight: fontWeights.medium, preferredWeight: fontWeights.semibold }, // TO §9.1
  buttonTitle: { size: 17, weight: fontWeights.regular }, // CT §1.3 (medium size)
} as const;

// ---------------------------------------------------------------------------
// Radii (all continuous corners)
// ---------------------------------------------------------------------------

export const radii = {
  display: 62, // SMG §8 UIScreen._displayCornerRadius
  insetGrouped: 26, // LS §1.1 section corner radius
  swipedCell: 26, // LS §1.1 defaultCellCornerRadius swiped
  // Visible top corners are 38 at both detents; the bottom is 54 at medium.
  sheetMediumTop: 38,
  sheetLargeTop: 38,
  sheetMediumBottom: 54,
  sheetBottom: 38, // TR §3a
  alert: 34, // TO §9.1 contentCornerRadius
  alertAction: 24, // TO §9.1 action pill radius
  alertTextField: 24, // TO §9.1
  menu: 32, // MO §2 menuCornerRadius
  menuLargeItem: 22, // MO §2 largeItemContentShape cornerRadius
  tabPlatter: 31, // BR §3.1 platter r 31
  tabLens: 27, // BR §3.1 lens r 27
  barItem: 22, // BR §0 nav item glass cornerRadius 22 (44 pt capsule)
  switchTrack: 14, // CT §2.1
  segmented: 16, // CT §5.1
  segmentedThumb: 14, // CT §5.1
  sliderTrack: 3, // CT §3.1
  buttonSmall: 14, // CT §1.4 dynamic cornerStyle
  buttonMedium: 17, // CT §1.4
  buttonLarge: 25, // CT §1.4
  scrollIndicator: 1.5, // SMG §5
} as const;

/** RP Corners: concentric rule, inner radius = outer radius − inset. */
export function concentricRadius(outer: number, inset: number): number {
  return Math.max(0, outer - inset);
}

// ---------------------------------------------------------------------------
// Metrics (iPhone 18 Pro Max, 440 × 956 pt @3x)
// ---------------------------------------------------------------------------

export const metrics = {
  screenWidth: 440, // RP Layout
  screenHeight: 956, // RP Layout
  pixelRatio: 3, // RP Layout
  safeAreaTop: 62, // RP Layout
  safeAreaBottom: 34, // RP Layout
  sideMargin: 20, // RP Layout systemMinimumLayoutMargins on 440 pt
  readableWidth: 400, // RP Layout
  minHitTarget: 44, // RP Layout
  navBarHeight: 54, // BR §1.1 inline
  navBarLargeHeight: 106, // BR §1.1 54 + 52 band
  largeTitleBand: 52, // BR §1.1 / TR §6 collapse distance
  navTitleHiddenOffset: 15, // TR §6 hiddenYOffset
  navBarPromptHeight: 34, // BR §1.1 prompt band
  barButton: 44, // BR §0 44 pt items
  toolbarItem: 48, // BR §0 48 pt toolbar items
  barGlassSmoothness: 12, // BR §0 nav/toolbar SDF smoothness
  tabBarHeight: 83, // RP Layout 49 + 34
  tabPlatterHeight: 62, // BR §3.2
  tabPlatterBottomGap: 21, // BR §3.2 platter bottom 21 above screen edge
  tabPlatterMaxInset: 21, // BR §3.2 capped at 440 − 2·21
  tabButtonWidth: 94, // BR §3.2 (n ≤ 3)
  tabButtonHeight: 54, // BR §3.2
  tabButtonPitch: 86, // BR §3.2 platter width = 86·n + 16
  tabGlassSmoothness: 6, // BR §0 tab platter group smoothness
  tabLensPressedGrowth: 8, // LG §10 +8 pt per side when pressed
  tabMinimizedSize: 48, // MO §3 minimized platter 48×48
  rowHeight: 52, // LS §1.1 default row height
  rowHeightSubtitle: 62, // LS §1.1
  insetGroupedRadius: 26, // LS §1.1
  insetGroupedSideInset: 20, // LS §1.1 _sectionContentInset
  cellLayoutMargins: [15, 20, 15, 20] as const, // LS §1.1
  separatorInsetLeading: 20, // LS §1.1
  separatorInsetWithImage: 59, // LS §1.1
  separatorThickness: 1 / 3, // LS separator: 1 device pixel
  sectionHeaderPaddingPlain: 22, // LS §1.1
  sheetMediumInset: 8, // TR §3a mediumSheetInset
  sheetMediumScale: 0.96364, // TR §3a 424/440
  sheetDetentLarge: 62, // TR §3a detent top (container coords)
  sheetDetentMedium: 440.4, // TR §3a
  sheetDetentDismissed: 956, // TR §3a
  sheetPressScale: 1.0077, // deep/sheets §3 touch-down lift
  alertWidth: 320, // TO §9.1 maximumWidth
  alertLabelInset: 30, // TO §9.1 labelHorizontalInsets
  alertActionInsets: 16, // TO §9.1 actionSequenceEdgeInsets
  alertActionHeight: 48, // TO §9.1 minimumActionContentSize
  alertActionSpacing: 8, // TO §9.1
  alertPresentScale: 1.2, // TR §7 scale 1.2 → 1.0
  buttonHeightSmall: 28, // CT §1.3
  buttonHeightMedium: 34.33, // CT §1.3
  buttonHeightLarge: 50.33, // CT §1.3
  buttonInsetsMedium: [7, 12] as const, // CT §1.3 T/L
  switchWidth: 63, // CT §2.1
  switchHeight: 28, // CT §2.1
  switchKnobWidth: 37, // CT §2.1
  switchKnobHeight: 24, // CT §2.1
  switchKnobPressedWidth: 58, // CT §2.1
  switchKnobPressedHeight: 38.333, // CT §2.1
  switchKnobCentreOff: 20.5, // CT §2.1
  switchKnobCentreOn: 42.5, // CT §2.1
  sliderHeight: 34, // CT §3.1
  sliderTrackHeight: 6, // CT §3.1
  sliderThumbWidth: 37, // CT §3.1
  sliderThumbHeight: 24, // CT §3.1
  stepperWidth: 94, // CT §4.1
  stepperHeight: 32, // CT §4.1
  segmentedHeight: 32, // CT §5.1
  segmentWidth: 65, // CT §5.1 (3 segments)
  segmentedThumbInset: 2, // CT §5.1
  menuWidth: 250, // TO §10.1 / MO §2 defaultMenuWidth
  menuMaxHeight: 520, // MO §2 menuMaximumHeight
  menuRowHeight: 42, // TO §10.1
  menuRowHeightSubtitle: 60, // TO §10.1
  menuPadding: 10, // TO §10.1
  menuSeparatorInset: 24, // TO §10.1
  menuContainerInset: 8, // MO §2 minimumContainerInsets
  contextMenuGap: 20, // MO §2 menu sits 20 pt below the preview
  contextMenuMaxLiftScale: 1.15, // MO §2 maxLiftScale
  contextMenuLiftPoints: 26, // MO §2 maxLiftScaleUpPoints
  scrollIndicatorThickness: 3, // SMG §5
  scrollIndicatorInset: 3, // SMG §5
  refreshControlHeight: 60, // SMG §5
  navParallax: 0.3, // TR §1 outgoing view ends at −0.3·width
} as const;

/** Shadows (TR §1, §4; deep/glass-render §3). */
export const shadows = {
  navCard: { opacity: 0.04, radius: 12 }, // TR §1 _UIParallaxTransitionCardView
  zoomPlatter: { opacity: 0.4, radius: 40, offsetY: 10 }, // TR §4 platterShadow
  sliderThumb: { opacity: 0.14, radius: 5, offsetY: 1 }, // CT §3.1
} as const;

// ---------------------------------------------------------------------------
// Haptics (HF §3–4)
// ---------------------------------------------------------------------------

/** One CoreHaptics transient: time (s), intensity and sharpness (0…1). */
export interface HapticEvent {
  t: number;
  intensity: number;
  sharpness: number;
}

const ev = (intensity: number, sharpness: number, t = 0): HapticEvent => ({ t, intensity, sharpness });

/** The patterns UIKit builds (HF §3 dump, §4 per-component). */
export const hapticEvents = {
  impactLight: [ev(0.7, 0.1304)], // HF §3 UIImpactFeedbackGenerator(.light)
  impactMedium: [ev(0.7, 0.4783)], // HF §3 .medium
  impactHeavy: [ev(0.8, 0.8696)], // HF §3 .heavy
  impactSoft: [ev(0.79, 0.3478)], // HF §3 .soft
  impactRigid: [ev(0.825, 0.3043)], // HF §3 .rigid
  selection: [ev(0.4, 0.2609)], // HF §3 UISelectionFeedbackGenerator (min interval 0.04 s)
  success: [ev(0.7, 0.8696), ev(1.0, 0.6522, 0.185)], // HF §3 notification .success
  warning: [ev(0.9, 1.0), ev(0.9, 0.9565, 0.215)], // HF §3 .warning
  error: [ev(0.85, 0.6522), ev(0.75, 0.6522, 0.1), ev(0.65, 0.8696, 0.2), ev(0.75, 0.8261, 0.3)], // HF §3 .error
  switchToggle: [ev(0.7, 0.1304)], // HF §4 UISwitch: impact light
  sliderEdge: [ev(0.6, 0.1304)], // HF §4 fluid slider end stop
  sliderTick: [ev(0.4, 0.2609)], // HF §4 slider tick
  menuSelection: [ev(0.4, 0.2609)], // HF §4 menu highlight change
  contextMenuPreview: [ev(1.0, 0.5652)], // HF §3 context menu "previewed"
  contextMenuPop: [ev(0.47, 0.6957)], // HF §3 context menu dragged/popped
  swipeConfirm: [ev(0.7, 0.6087)], // HF §3 swipe actions any→confirm
  swipeUnconfirm: [ev(0.55, 0.2609)], // HF §3 confirm→any
  refresh: [ev(0.6046, 0.1304)], // HF §4 pull to refresh (light × impactIntensity 0.864)
  buttonDown: [ev(0.525, 0.6522)], // HF §3 button default interaction start
  buttonUp: [ev(0.2625, 0.6522)], // HF §3 button default interaction end
  dragStart: [ev(1.0, 0.6087)], // HF §3 drag/reorder start
  dragSnap: [ev(0.6, 0.2609)], // HF §3 snapped
  dragEnd: [ev(0.6, 0.6087)], // HF §3 end
  previewCommit: [ev(0.825, 0.8696)], // HF §3 preview states commit
} satisfies Record<string, HapticEvent[]>;

export type HapticName = keyof typeof hapticEvents;

/** HF §1: selection-type generators throttle to one event per 0.04 s. */
export const HAPTIC_SELECTION_MIN_INTERVAL = 0.04;

/**
 * `navigator.vibrate` pattern for a list of transients.
 * Web approximation (not an iOS constant): vibrate has only on/off durations, so each transient
 * becomes a pulse of `intensity × lerp(20, 8, sharpness)` ms (sharper = shorter), and the gaps keep
 * the extracted time offsets.
 */
export function toVibratePattern(events: readonly HapticEvent[]): number[] {
  const pattern: number[] = [];
  let cursorMs = 0;
  for (const e of events) {
    const startMs = Math.round(e.t * 1000);
    if (pattern.length > 0) pattern.push(Math.max(0, startMs - cursorMs));
    const pulse = Math.max(1, Math.round(e.intensity * (20 + (8 - 20) * e.sharpness)));
    pattern.push(pulse);
    cursorMs = startMs + pulse;
  }
  return pattern;
}

/** `navigator.vibrate` patterns approximating the extracted intensities. */
export const haptics = Object.fromEntries(
  Object.entries(hapticEvents).map(([name, events]) => [name, toVibratePattern(events)]),
) as Record<HapticName, number[]>;

/** Fire a named haptic if the platform supports `navigator.vibrate`. Returns whether it was sent. */
export function playHaptic(name: HapticName): boolean {
  const nav = (globalThis as { navigator?: { vibrate?: (p: number[]) => boolean } }).navigator;
  if (!nav?.vibrate) return false;
  return nav.vibrate(haptics[name]);
}
