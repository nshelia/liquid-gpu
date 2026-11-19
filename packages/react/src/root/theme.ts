/**
 * Theme CSS generated from @liquid-gpu/core tokens.
 *
 * - Colours: every token in `colors.light` / `colors.dark` becomes `--lq-<kebab-name>` on `.lq-root`, switched by
 *   `data-appearance`. Source: core tokens.ts (reference-page.html `SEM` / `TINT`, components/*.md).
 * - Type: every text style becomes `--lq-<style>-size|weight|line|tracking` and a `.lq-<style>` class.
 * - Font: the SF system face where available, then Inter, then the platform UI font. Georgian falls through to the
 *   system's Georgian face (Noto Sans Georgian / the OS default).
 */
import { colors, textStyles, componentType, type Appearance } from '@liquid-gpu/core';

export const fontStack =
  '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro", system-ui, "Inter", "Inter Variable", "Segoe UI", Roboto, "Noto Sans Georgian", "Helvetica Neue", sans-serif';

const kebab = (s: string) => s.replace(/[A-Z0-9]+/g, (m) => '-' + m.toLowerCase());

/** CSS variable name for a colour token, e.g. `cssVar('secondaryLabel')` → `var(--lq-secondary-label)`. */
export function cssVar(token: string): string {
  return `var(${cssVarName(token)})`;
}

/** Variable name without `var()`. */
export function cssVarName(token: string): string {
  return `--lq-${kebab(token).replace(/^-/, '')}`;
}

function colorBlock(a: Appearance): string {
  return Object.entries(colors[a])
    .map(([k, v]) => `${cssVarName(k)}:${v};`)
    .join('');
}

function typeBlock(): string {
  let vars = '';
  let classes = '';
  for (const [name, t] of Object.entries(textStyles)) {
    const n = kebab(name).replace(/^-/, '');
    vars += `--lq-${n}-size:${t.size}px;--lq-${n}-weight:${t.weight};--lq-${n}-line:${t.lineHeight}px;--lq-${n}-tracking:${t.tracking}px;`;
    classes += `.lq-${n}{font-size:${t.size}px;font-weight:${t.weight};line-height:${t.lineHeight}px;letter-spacing:calc(var(--lq-tracking-on) * ${t.tracking}px);}`;
    // Emphasized variant (semibold), used by headers and headline-like labels.
    classes += `.lq-${n}-em{font-size:${t.size}px;font-weight:590;line-height:${t.lineHeight}px;letter-spacing:calc(var(--lq-tracking-on) * ${t.tracking}px);}`;
  }
  return `.lq-root{${vars}}` + classes;
}

/** The complete theme + base stylesheet. Injected once by LiquidRoot. */
export function themeCss(): string {
  const nt = componentType.navTitle;
  return [
    `.lq-root{${colorBlock('light')}color-scheme:light;--lq-font:${fontStack};--lq-tracking-on:0;}`,
    `.lq-root[data-appearance="dark"]{${colorBlock('dark')}color-scheme:dark;}`,
    typeBlock(),
    // Base: the root is the full viewport; the host (canvas or fallback div) fills it.
    `.lq-root{position:fixed;inset:0;overflow:hidden;font-family:var(--lq-font);font-size:17px;line-height:20.287px;letter-spacing:calc(var(--lq-tracking-on) * -0.432px);color:var(--lq-label);background:var(--lq-system-background);-webkit-font-smoothing:antialiased;-webkit-tap-highlight-color:transparent;font-synthesis:none;text-rendering:optimizeLegibility;}`,
    `.lq-host{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;user-select:none;-webkit-user-select:none;}`,
    `.lq-host input,.lq-host textarea,.lq-host [contenteditable]{user-select:text;-webkit-user-select:text;}`,
    // Layers: absolutely placed at the canvas origin; the renderer's transform positions them.
    `.lq-layer{position:absolute;left:0;top:0;margin:0;box-sizing:border-box;contain:layout style;pointer-events:none;}`,
    // Empty layer areas pass pointer events through (Chrome 157 drawable hit testing does not follow z order for overlapping layer boxes).
    `.lq-layer>*{pointer-events:auto;}.lq-layer.lq-screen,.lq-layer.lq-solid{pointer-events:auto;}`,
    // A layer that is itself the interactive element (the `<Glass>` content, a `LayerView as="button"`) is solid:
    // its box is exactly the visible control, so `.lq-layer>*` (which only reaches its children) must not be needed.
    `.lq-layer.lq-glass-content,.lq-layer:is(button,a[href],input,select,textarea,label,summary,[role=button],[role=link],[role=switch],[role=slider],[role=tab],[role=menuitem],[role=radio],[role=checkbox]){pointer-events:auto;}`,
    `.lq-glass-content{display:flex;align-items:center;justify-content:center;box-sizing:border-box;color:var(--lq-label);background:none;border:0;padding:0;margin:0;font:inherit;-webkit-appearance:none;appearance:none;cursor:default;}`,
    // Resets use :where() (no specificity) so an app's own button classes override them.
    `:where(.lq-root) :where(button){background:none;border:0;padding:0;margin:0;-webkit-appearance:none;appearance:none;cursor:default;}`,
    `.lq-placeholder{pointer-events:none;flex:none;}`,
    `.lq-root :focus{outline:none;}`,
    `.lq-root :focus-visible{outline:2px solid var(--lq-tint);outline-offset:2px;border-radius:inherit;}`,
    `.lq-nav-title{font-size:${nt.size}px;font-weight:${nt.weight};line-height:${nt.lineHeight}px;letter-spacing:calc(var(--lq-tracking-on) * -0.432px);}`,
    `:where(.lq-root) :where(button){font:inherit;color:inherit;}`,
    `.lq-row:last-child>.lq-row-sep{display:none;}.lq-row-lit>.lq-row-sep,.lq-row:has(+.lq-row-lit)>.lq-row-sep{opacity:0;}.lq-row-fg{font:inherit;border:0;margin:0;}`,
    `@keyframes lq-spin{to{transform:rotate(360deg)}}.lq-refreshing .lq-spinner{animation:lq-spin 0.8s steps(8) infinite;}`,
    `.lq-scroller::-webkit-scrollbar{display:none;}`,
    `@media (prefers-reduced-motion: reduce){.lq-root *{transition-duration:0.01s !important;}}`,
    // Inline roots (LiquidRoot mode="inline"): sized by their container, in normal flow.
    `.lq-root[data-mode="inline"]{position:relative;inset:auto;width:100%;height:100%;isolation:isolate;}`,
    // Page-level overlay roots (OverlayPortal): transparent, above the page, empty areas pass events through.
    `.lq-root[data-mode="overlay"]{background:transparent;pointer-events:none;z-index:2147483000;}`,
    `.lq-root[data-mode="overlay"]>.lq-host{pointer-events:none;}`,
    `.lq-root{--lq-radius-scale:1;}`,
  ].join('\n');
}

let injected: HTMLStyleElement | null = null;
let refs = 0;

/** Inject the theme stylesheet (ref-counted). */
export function injectTheme(): () => void {
  if (typeof document === 'undefined') return () => {};
  refs++;
  if (!injected) {
    injected = document.createElement('style');
    injected.id = 'lq-theme';
    injected.textContent = themeCss();
    document.head.appendChild(injected);
  }
  return () => {
    refs--;
    if (refs <= 0 && injected) {
      injected.remove();
      injected = null;
      refs = 0;
    }
  };
}

// ------------------------------------------------------------------------------------------------ scoped overrides

/** A colour, or one per appearance. */
export type ThemeColor = string | { light: string; dark: string };

/** Semantic colour token names (core `colors`), e.g. `label`, `systemGroupedBackground`, `systemRed`. */
export type SemanticColorName =
  | 'tint'
  | 'label'
  | 'secondaryLabel'
  | 'tertiaryLabel'
  | 'quaternaryLabel'
  | 'placeholderText'
  | 'link'
  | 'separator'
  | 'opaqueSeparator'
  | 'systemBackground'
  | 'secondarySystemBackground'
  | 'tertiarySystemBackground'
  | 'systemGroupedBackground'
  | 'secondarySystemGroupedBackground'
  | 'tertiarySystemGroupedBackground'
  | 'systemFill'
  | 'secondarySystemFill'
  | 'tertiarySystemFill'
  | 'quaternarySystemFill'
  | 'systemRed'
  | 'systemOrange'
  | 'systemYellow'
  | 'systemGreen'
  | 'systemMint'
  | 'systemTeal'
  | 'systemCyan'
  | 'systemBlue'
  | 'systemIndigo'
  | 'systemPurple'
  | 'systemPink'
  | 'systemBrown'
  | 'systemGray'
  | 'cellGrouped'
  | 'cellPlain'
  | (string & {});

/**
 * Per-root theme overrides (`<LiquidRoot theme={…}>`). Applied as CSS variables on that root's element only, so two
 * roots on one page can differ. Page-level overlays opened from the root (OverlayPortal) inherit them.
 */
export interface ThemeOverrides {
  /** Accent colour (`--lq-tint`): controls, links, prominent buttons, focus ring. */
  tint?: ThemeColor;
  /** CSS font-family list (`--lq-font`). Set `--lq-tracking-on: 1` via `style` for non-SF faces if wanted. */
  fontFamily?: string;
  /** Multiplier exposed as `--lq-radius-scale` (default 1) for corner radii that opt into it. */
  radiusScale?: number;
  /** Any semantic colour token. */
  colors?: Partial<Record<SemanticColorName, ThemeColor>>;
}

/** Resolve one `ThemeColor` for an appearance. */
export function resolveThemeColor(c: ThemeColor | undefined, a: Appearance): string | undefined {
  if (c === undefined) return undefined;
  return typeof c === 'string' ? c : c[a];
}

/** The scoped CSS variables for `theme` in appearance `a` (empty for no overrides). */
export function themeVars(theme: ThemeOverrides | undefined, a: Appearance): Record<string, string> {
  const out: Record<string, string> = {};
  if (!theme) return out;
  if (theme.colors) {
    for (const [k, v] of Object.entries(theme.colors)) {
      const c = resolveThemeColor(v as ThemeColor | undefined, a);
      if (c) out[cssVarName(k)] = c;
    }
  }
  const tint = resolveThemeColor(theme.tint, a);
  if (tint) out[cssVarName('tint')] = tint;
  if (theme.fontFamily) out['--lq-font'] = theme.fontFamily;
  if (theme.radiusScale !== undefined && Number.isFinite(theme.radiusScale)) out['--lq-radius-scale'] = String(theme.radiusScale);
  return out;
}

/** Stable key for memoising a theme object passed inline. */
export function themeKey(theme: ThemeOverrides | undefined): string {
  return theme ? JSON.stringify(theme) : '';
}

/** The effective theme of the enclosing root (`useTheme()`). */
export interface ResolvedTheme {
  appearance: Appearance;
  /** Effective tint colour (override or the token). */
  tint: string;
  fontFamily: string;
  radiusScale: number;
  /** The overrides as passed to the root (undefined when none). */
  overrides: ThemeOverrides | undefined;
  /** Effective value of a semantic colour (override or token), e.g. `color('label')`. */
  color(name: SemanticColorName): string;
  /** `var(--lq-…)` reference for a semantic colour (resolves to the override inside the root). */
  cssVar(name: SemanticColorName): string;
}

export function resolveTheme(theme: ThemeOverrides | undefined, a: Appearance): ResolvedTheme {
  const color = (name: string): string =>
    (name === 'tint' ? resolveThemeColor(theme?.tint, a) : undefined) ??
    resolveThemeColor(theme?.colors?.[name], a) ??
    colors[a][name] ??
    '';
  return {
    appearance: a,
    tint: color('tint'),
    fontFamily: theme?.fontFamily ?? fontStack,
    radiusScale: theme?.radiusScale ?? 1,
    overrides: theme,
    color,
    cssVar,
  };
}
