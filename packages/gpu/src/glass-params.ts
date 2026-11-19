/**
 * Liquid Glass parameters, transcribed from the UIKit/QuartzCore extraction.
 *
 * Sources (all paths under ~/Documents/uikit-internals/):
 * - [GR]  deep/glass-render/findings.md   (shader formulas: §2 union, §3 glassBackground, rim, aberration, §4 tint)
 * - [LG]  findings/liquid-glass.md        (§2 70 inputs, §3 size fits, §4 tint, §5 rim + vibrant matrix, §9 interactive, §10 tab lens)
 * - [GD]  deep/glass-drag/findings.md      (§2 variant interpolation, §3 lift, §4 stretch, §7 glow)
 *
 * The size-dependent values are evaluated per pixel in the shader (glass.wgsl.ts mirrors `sizeParams`);
 * this module builds everything that depends only on style and appearance.
 */
import type { Appearance, GlassStyle, RGBA } from './types.js';

/** 3×4 colour matrix: rows R, G, B; columns r, g, b, offset. */
export type ColorMatrix3x4 = [number, number, number, number, number, number, number, number, number, number, number, number];

/**
 * `CA::ColorMatrix::set_ycc_composite(a, b, sat, fill)` [GR §3 "How face_cm is built"]:
 * 1. RGB → full-range Rec.709 YCbCr
 * 2. Y′ = (a − b)·Y + b, C′ = sat·(C − 0.5) + 0.5
 * 3. back to RGB
 * 4. scale by (1 − fill.a), add fill.rgb·fill.a to the offsets (premultiplied fill).
 *
 * `white` = a, `black` = b. [GR] notes "that b is the black point is inferred"; the worked example
 * (light: Y_out = 0.52 + 0.504·Y) is reproduced exactly with this assignment.
 */
type V3 = [number, number, number];

export function setYccComposite(black: number, white: number, sat: number, fill: RGBA = { r: 0, g: 0, b: 0, a: 0 }): ColorMatrix3x4 {
  // RGB → YCbCr (rows: Y, Cb, Cr; offsets handled separately). [GR §3 step 1]
  const toY: V3 = [0.2126, 0.7152, 0.0722];
  const toCb: V3 = [-0.1146, -0.3854, 0.5];
  const toCr: V3 = [0.5, -0.4542, -0.0458];
  // YCbCr → RGB [GR §3 step 3]: R = Y + 1.5748·Cr; G = Y − 0.1873·Cb − 0.4681·Cr; B = Y + 1.8556·Cb
  const fromY: V3 = [1, 1, 1];
  const fromCb: V3 = [0, -0.1873, 1.8556];
  const fromCr: V3 = [1.5748, -0.4681, 0];
  const a = white - black;
  const m: number[] = [];
  const keep = 1 - fill.a;
  const fillRgb: V3 = [fill.r * fill.a, fill.g * fill.a, fill.b * fill.a];
  for (const row of [0, 1, 2] as const) {
    // out_row = fromY·(a·Y + b) + fromCb·sat·Cb + fromCr·sat·Cr   (Cb/Cr centred, so the 0.5 offsets cancel)
    for (const col of [0, 1, 2] as const) {
      const v = fromY[row] * a * toY[col] + fromCb[row] * sat * toCb[col] + fromCr[row] * sat * toCr[col];
      m.push(v * keep);
    }
    const offset = fromY[row] * black;
    m.push(offset * keep + fillRgb[row]);
  }
  return m as ColorMatrix3x4;
}

const WHITE = (a: number): RGBA => ({ r: 1, g: 1, b: 1, a });
const BLACK = (a: number): RGBA => ({ r: 0, g: 0, b: 0, a });

/** Everything that depends on style and appearance only (not on shape size). */
export interface GlassRecipe {
  styleCode: number; // 0 regular, 1 clear, 2 lens
  schemeCode: number; // 0 light, 1 dark
  blurRadius: number;
  blurFillRadius: number;
  blurFillNormal: number;
  blurFillLighten: number;
  blurFillDarken: number;
  refractionOpacity: number;
  clampLimit: number;
  bleedDarken: number;
  face: ColorMatrix3x4;
  faceOpacity: number;
  bleed: ColorMatrix3x4;
  /** shadow_cm reduces to `(1 − fill.a)·c` (black 0 / white 1 / sat 1); we store fill.a. */
  shadowFillA: number;
  ringOpacity: number;
  ringBlur: number;
  ringStroke: number;
  ringOffset: number;
  ringMask: number;
  /** In-glassBackground key/fill highlight band [GR §3 "Rim highlight"]. */
  hlAmount: number;
  hlHeight: number;
  hlOffset: number;
  hlBias: number;
  hlSpread: number;
  hlAngle: number;
  /** Separate CASDFKeyFillHighlightEffect rim [GR §3, LG §5]. */
  rimSpread: number;
  rimAmount: number;
  rimHeight: number;
  rimCurvature: number;
  rimKeyAngle: number;
  rimFillAngle: number;
  /** vibrantColorMatrix on the rim ("SDF") layer [LG §5]. */
  vibrant: ColorMatrix3x4;
  /** Tab-lens resting colour matrix [LG §10]. Identity for other styles. */
  lensRest: ColorMatrix3x4;
  lensRestBlur: number;
}

const IDENTITY: ColorMatrix3x4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

export function glassRecipe(style: GlassStyle, appearance: Appearance): GlassRecipe {
  const dark = appearance === 'dark';
  const clear = style === 'clear';
  const lens = style === 'lens';

  // [LG §2] table: regular light values, with the dark / clear columns.
  const blurRadius = clear ? 0.75 : lens ? 0 : 5; // inputBlurRadius 5 (clear 0.75); lens pressed: BlurRadius 0 [LG §10]
  const blurFillRadius = clear || lens ? 0 : 8; // inputBlurFillBlurRadius 8 (clear 0)
  const blurFillNormal = clear || lens ? 0 : 0.5; // inputBlurFillNormalOpacity 0.5 (clear 0)
  const blurFillLighten = clear || lens || dark ? 0 : 0.9; // Lighten/Darken 0.9/0 (dark 0/0.9; clear 0/0)
  const blurFillDarken = clear || lens || !dark ? 0 : 0.9;
  const refractionOpacity = clear || lens ? 0 : 0.6; // inputRefractionOpacity 0.6 (clear 0; lens 0 [LG §10])

  // inputFaceColorMatrixBlack / White / Saturation / FillColor [LG §2]
  let face: ColorMatrix3x4;
  if (clear) face = setYccComposite(0.125, 1.08, 1.06, WHITE(0)); // clear 0.125 / 1.08 / 1.06, fill rgba(1,1,1,0)
  else if (lens)
    // Not listed in [LG §10]; fitted as a mix toward white, c' = (1 − t)·c + t, from the native lifted-lens captures
    // (uikit-internals/deep/demo-audit/tabbar/shots, 3x):
    // - light t 0.117: the Browse badge under the held lens, press_light_holdBrowse.png, #FF383C → #FF4F53 (G and B
    //   both give 0.116–0.118; R stays 255). Over the white platter the lens reads 255 inside and out (no other point).
    // - dark t 0.07: press_dark_holdSelectedHome.png, lens interior ≈ 61 (58…64) over the platter at 43.5; in this
    //   renderer t 0.07 gives 62 over 43 (identity gave 48). One luminance point only, so the slope is assumed.
    face = dark ? [0.93, 0, 0, 0.07, 0, 0.93, 0, 0.07, 0, 0, 0.93, 0.07] : [0.883, 0, 0, 0.117, 0, 0.883, 0, 0.117, 0, 0, 0.883, 0.117];
  else if (dark) face = setYccComposite(0.125, 1.125, 1.3, BLACK(0)); // dark 0.125 / 1.125 / 1.3, fill rgba(0,0,0,0)
  else face = setYccComposite(0.4, 1.03, 1.2, WHITE(0.2)); // light 0.4 / 1.03 / 1.2, fill rgba(1,1,1,0.2)

  // inputBleedColorMatrixBlack / White / Saturation [LG §2]: 0.9/1/1.2 (dark 0.125/0.5/1.0; clear 0.75/1/1.2)
  const bleed = clear
    ? setYccComposite(0.75, 1, 1.2)
    : dark
      ? setYccComposite(0.125, 0.5, 1.0)
      : setYccComposite(0.9, 1, 1.2);

  // inputClamp 1.06961 (dark 1.30831; clear 1.19167) [LG §2]
  const clampLimit = clear ? 1.19167 : dark ? 1.30831 : 1.06961;

  // Highlight band inside glassBackground [LG §2]: Angle π/2, Amount 0.4, Height 0.5333, EffectOffset −0.5333,
  // ColorBias −0.3, SpreadSDR 1.85 (106°) light regular; dark and clear 1.3090 (75°).
  // We render SDR, so `spread = cos(mix(SpreadSDR, Spread, edr_t))` [GR §3 "Highlight packing"] uses SpreadSDR.
  // Lens pressed [LG §10]: Amount 0.5, Height 1, SpreadSDR 2.0944, EffectOffset −0.6667.
  const hlSpread = lens ? 2.0944 : clear || dark ? 1.309 : 1.85;

  // vibrantColorMatrix on the rim layer [LG §5] (regular and clear rows).
  const vibrant: ColorMatrix3x4 = clear
    ? [1.3192, -0.0478, -0.0047, 0.2, -0.0142, 1.2856, -0.0048, 0.2, -0.0142, -0.0476, 1.3285, 0.2]
    : [1.1202, -0.1894, -0.019, 0.1471, -0.0563, 0.9871, -0.0191, 0.1471, -0.0563, -0.1893, 1.1574, 0.1471];

  // Lens at rest [LG §10]: gaussianBlur radius 2 and this colorMatrix.
  // Dark matrix from _UITabSelectionView (demo-audit/tabbar §3): #202020 → #0A0A0A.
  const lensRest: ColorMatrix3x4 = !lens
    ? IDENTITY
    : dark
      ? [1.1298, -0.2361, -0.0237, -0.07, -0.0701, 0.964, -0.0238, -0.07, -0.0702, -0.236, 1.1762, -0.07]
      : [1.1851, -0.0502, -0.005, -0.2, -0.0149, 1.1499, -0.0051, -0.2, -0.0149, -0.05, 1.1949, -0.2];

  return {
    styleCode: clear ? 1 : lens ? 2 : 0,
    schemeCode: dark ? 1 : 0,
    blurRadius,
    blurFillRadius,
    blurFillNormal,
    blurFillLighten,
    blurFillDarken,
    refractionOpacity,
    clampLimit,
    bleedDarken: dark ? 0 : 1, // inputBleedDarkenBlend true (dark false) [LG §2]
    face,
    faceOpacity: 1, // inputFaceOpacity 1 [LG §2]
    bleed,
    shadowFillA: clear ? 0.1 : 0.3, // inputShadowColorMatrixFillColor rgba(0,0,0,0.3) (clear 0.1) [LG §2]
    // Ring shadow [LG §2]: opacity 0.06 (clear 0), blur 5, stroke 4, offset 8, mask 1. Lens pressed: 0.1 / 3 / mask 0 [LG §10].
    ringOpacity: clear ? 0 : lens ? 0.1 : 0.06,
    ringBlur: lens ? 3 : 5,
    ringStroke: 4,
    ringOffset: lens ? 7 : 8,
    ringMask: lens ? 0 : 1,
    hlAmount: lens ? 0.5 : 0.4,
    hlHeight: lens ? 1 : 0.5333,
    hlOffset: lens ? -0.6667 : -0.5333,
    hlBias: -0.3,
    hlSpread,
    hlAngle: Math.PI / 2,
    // CASDFKeyFillHighlightEffect, identical for every case [LG §5; GR §3 "Separate rim layer"]:
    // key 0°, fill 180°, spread 80° (1.396263 rad), amount 0.5, height 1, curvature 0.75.
    rimSpread: 1.396263,
    rimAmount: 0.5,
    rimHeight: 1,
    rimCurvature: 0.75,
    rimKeyAngle: 0,
    rimFillAngle: Math.PI,
    vibrant,
    lensRest,
    lensRestBlur: 2,
  };
}

/**
 * Size-dependent glassBackground inputs [LG §3]. d = min(width, height), t = clamp((d − 64)/96, 0, 1).
 * The shader evaluates the same formulas per pixel (`size_params` in glass.wgsl.ts); this TS copy is used by
 * the CSS fallback and kept in sync.
 */
export interface SizeParams {
  t: number;
  innerAmount: number;
  innerHeight: number;
  outerAmount: number;
  outerHeight: number;
  bleedAmount: number;
  bleedBlurRadius: number;
  bleedOpacity: number;
  blurDistance0: number;
  blurOpacity0: number;
  blurOpacity1: number;
  shadowRadius: number;
  shadowOpacity: number;
  maxLuma: number;
}

export function sizeParams(d: number, style: GlassStyle, appearance: Appearance): SizeParams {
  const t = Math.min(1, Math.max(0, (d - 64) / 96));
  const dark = appearance === 'dark';
  if (style === 'clear') {
    return {
      t,
      innerAmount: -Math.min(0.65 * d, 60),
      innerHeight: Math.min(0.36 * d, 20),
      outerAmount: d / 5,
      outerHeight: d / 8,
      bleedAmount: 0,
      bleedBlurRadius: 0,
      bleedOpacity: 0,
      blurDistance0: -d / 2,
      blurOpacity0: 1,
      blurOpacity1: 0.5,
      shadowRadius: 0,
      shadowOpacity: 0,
      maxLuma: 1,
    };
  }
  if (style === 'lens') {
    // Lens pressed [LG §10]: inner −10.5 / 7, outer 0, BlurDistance0 −10, ShadowRadius 8, ShadowOpacity 0.001.
    return {
      t,
      innerAmount: (-10.5 * d) / 70,
      innerHeight: (7 * d) / 70,
      outerAmount: 0,
      outerHeight: 1,
      bleedAmount: 0,
      bleedBlurRadius: 0,
      bleedOpacity: 0,
      blurDistance0: -10,
      blurOpacity0: 0,
      blurOpacity1: 0,
      shadowRadius: 8,
      shadowOpacity: 0.001,
      maxLuma: 1,
    };
  }
  return {
    t,
    innerAmount: -Math.min(d / 2, 60),
    innerHeight: Math.min(d / 4, 20),
    outerAmount: Math.max(16, d / 4),
    outerHeight: Math.max(16, d / 5),
    bleedAmount: 0.35 * d,
    bleedBlurRadius: t > 0 ? 0.35 * d : 0,
    bleedOpacity: (dark ? 0.8 : 0.5) * t,
    blurDistance0: -d / 2,
    blurOpacity0: 0.8 * t,
    blurOpacity1: 0.4 * t,
    shadowRadius: 4 + 20 * t,
    shadowOpacity: dark ? 0.04 + 0.56 * t : 0.04 + 0.36 * t,
    // FaceColorMatrixMaxLuma: light 1 (SDR 0.94), dark max(0.35, 0.6 − 0.6t) [LG §3]
    maxLuma: dark ? Math.max(0.35, 0.6 - 0.6 * t) : 0.94,
  };
}

/**
 * Flex-interaction glow opacities [GD §2, §7; LG §9].
 * Automatic variant: max(w,h) < 120 uses `ultraSmall` (littleGlow 1.0, bigGlow 1); otherwise lerp small→large by
 * u = clamp((min(w,h) − 44)/116, 0, 1): littleGlow 0.3 → 0.2, bigGlow 1 → 0.
 * LittleGlow size = min(1.5·h, 160) [LG §9].
 */
export function glowParams(w: number, h: number): { big: number; little: number; littleSize: number } {
  const littleSize = Math.min(1.5 * Math.min(w, h), 160);
  if (Math.max(w, h) < 120) return { big: 1, little: 1, littleSize };
  const u = Math.min(1, Math.max(0, (Math.min(w, h) - 44) / 116));
  return { big: 1 - u, little: 0.3 + (0.2 - 0.3) * u, littleSize };
}

/**
 * Approximate tint matrix: out = o·(1 − Y) + tint·Y [GR §4], with Y the Rec.709 luma of the glass below.
 * Measured for pure primaries in light mode: o = 0.6·tint (R = 0.4·Y + 0.6) [LG §4].
 * Dark mode primaries are nearly flat (red: R ≈ 1.0056 − 0.037·Y), so o ≈ tint there.
 * TODO(unknown): the general hue/chroma mapping for o is not derived [GR §6.1].
 */
export function tintShadowColor(tint: RGBA, appearance: Appearance): RGBA {
  const k = appearance === 'dark' ? 1.0 : 0.6;
  return { r: tint.r * k, g: tint.g * k, b: tint.b * k, a: tint.a };
}

/** Parse a CSS colour string like '#0a84ff', 'rgb(…)', 'rgba(…)'. */
export function parseColor(input: string): RGBA {
  const s = input.trim();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join('');
    const n = parseInt(hex, 16);
    if (hex.length === 8) return { r: ((n >>> 24) & 255) / 255, g: ((n >>> 16) & 255) / 255, b: ((n >>> 8) & 255) / 255, a: (n & 255) / 255 };
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
  }
  const m = s.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const p = (m[1] ?? '').split(/[ ,/]+/).filter(Boolean).map(Number);
    const at = (i: number, d: number) => p[i] ?? d;
    return { r: at(0, 255) / 255, g: at(1, 255) / 255, b: at(2, 255) / 255, a: at(3, 1) };
  }
  return { r: 1, g: 1, b: 1, a: 1 };
}
