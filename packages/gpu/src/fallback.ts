/**
 * CssRenderer: the same surface as LiquidRenderer, drawn with plain DOM + CSS (Safari, Firefox, older Chrome).
 *
 * - Layers are absolutely positioned elements with a CSS matrix transform, opacity, border-radius
 *   (`corner-shape: squircle` where supported), clip-path and a brightness filter for dimming.
 * - Glass is a `<div>` with `backdrop-filter`, whose numbers are derived from the same recipe as the shader:
 *   the face matrix luma line (light: Y_out = 0.52 + 0.504·Y, [GR §3 worked example]) is reproduced with
 *   `contrast()` + a white overlay, saturation 1.2 / 1.3 [LG §2], a key/fill rim as inset box-shadows
 *   (0°/180°, [LG §5]), and the drop shadow offset (0, 8), radius 4 + 20t, black 0.3·opacity [LG §2/§3]
 *   plus the 0.06 ring shadow.
 * - Group merging (smooth union) is not reproduced; shapes render separately.
 *
 * [GR] = uikit-internals/deep/glass-render/findings.md, [LG] = uikit-internals/findings/liquid-glass.md.
 */
import type { Appearance, Flex, GlassGroup, GlassShape, GlassStyle, Layer, LayerLens, Pt, Rect, Renderer, RGBA } from './types.js';
import { glassRecipe, glowParams, sizeParams } from './glass-params.js';

/**
 * Style writes that skip unchanged values.
 *
 * `frame()` runs on every animation frame while anything moves (a scroll, a sheet, a press) and re-applies every
 * layer and glass. Re-writing an unchanged inline property still costs a CSS parse, and on WebKit a write of
 * `backdrop-filter`, `clip-path`, `mask-*` or `filter` can re-commit the platform layer's filters / mask (render-server
 * work on iOS) even when the value is identical. Only real changes reach the CSSOM. The cache keeps the browser's
 * read-back too, so a property that other code changed meanwhile (e.g. `Layer.tsx` writing `z-index`) is rewritten.
 */
class StyleCache {
  private readonly written = new Map<string, { v: string; back: string }>();
  constructor(private readonly el: HTMLElement) {}
  set(prop: string, value: string): void {
    const s = this.el.style;
    const prev = this.written.get(prop);
    if (prev && prev.v === value && s.getPropertyValue(prop) === prev.back) return;
    if (value) s.setProperty(prop, value);
    else s.removeProperty(prop);
    this.written.set(prop, { v: value, back: s.getPropertyValue(prop) });
  }
}

const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString();
const fmt6 = (v: number) => (Math.round(v * 1e6) / 1e6).toString();

class CssLayer implements Layer {
  z: number;
  transform = new DOMMatrix();
  opacity = 1;
  cornerRadius = 0;
  clip?: Rect;
  dim?: number;
  visible = true;
  lens?: LayerLens;
  cutout?: Rect;
  constructor(
    readonly element: HTMLElement,
    z: number,
    private owner: CssRenderer,
  ) {
    this.z = z;
    const s = element.style;
    s.position = 'absolute';
    s.left = '0';
    s.top = '0';
    s.transformOrigin = '0 0';
    s.margin = '0';
    // Layers move by transform every frame (scroll-tracked glass content, push/pop, sheets). A 2D matrix on a
    // non-composited element repaints it (and what it covers) each frame; its own compositing layer makes the move,
    // opacity, brightness dim and inset clip compositor-only (WebKit: CA transform / filter / shape mask).
    s.willChange = 'transform';
    this.css = new StyleCache(element);
  }
  private readonly css: StyleCache;
  invalidate(): void {}
  remove(): void {
    this.owner.removeLayer(this);
  }
  apply(): void {
    const c = this.css;
    const m = this.transform;
    c.set('z-index', String(Math.round(this.z)));
    c.set('transform', m.is2D ? `matrix(${fmt6(m.a)},${fmt6(m.b)},${fmt6(m.c)},${fmt6(m.d)},${fmt(m.e)},${fmt(m.f)})` : m.toString());
    c.set('opacity', this.opacity >= 1 ? '' : fmt(this.opacity));
    c.set('visibility', this.visible ? '' : 'hidden');
    c.set('border-radius', this.cornerRadius ? `${fmt(this.cornerRadius)}px` : '');
    c.set('corner-shape', this.cornerRadius ? 'squircle' : '');
    c.set('filter', this.dim ? `brightness(${fmt(1 - this.dim)})` : '');
    if (this.lens || this.cutout) {
      // No warp in CSS: the lens only clips (translate/scale transforms).
      const inv = this.transform.inverse();
      const capsule = (r: Rect) => {
        const a = inv.transformPoint(new DOMPoint(r.x, r.y));
        const b = inv.transformPoint(new DOMPoint(r.x + r.width, r.y + r.height));
        const w = b.x - a.x;
        const h = b.y - a.y;
        const k = Math.min(w, h) / 2;
        return `M${a.x + k} ${a.y}H${b.x - k}A${k} ${k} 0 0 1 ${b.x - k} ${b.y}H${a.x + k}A${k} ${k} 0 0 1 ${a.x + k} ${a.y}Z`;
      };
      const l = this.lens;
      if (l) {
        const f = l.flex ?? { sx: 1, sy: 1, tx: 0, ty: 0 };
        const w = l.rect.width * f.sx;
        const h = l.rect.height * f.sy;
        const cx = l.rect.x + l.rect.width / 2 + f.tx;
        const cy = l.rect.y + l.rect.height / 2 + f.ty;
        c.set('clip-path', `path("${capsule({ x: cx - w / 2, y: cy - h / 2, width: w, height: h })}")`);
        this.clearMask();
      } else {
        // A mask, not a clip-path, so the hole stays hit-testable. Built from gradients, not an SVG data URL: on iOS
        // Safari (device, not the simulator) a data-URL mask image swapped every frame stops rendering and the layer
        // vanishes for good. Capsule hole = rect ∪ two end discs; full layer `subtract`s their union.
        const cut = this.cutout!;
        const a = inv.transformPoint(new DOMPoint(cut.x, cut.y));
        const b = inv.transformPoint(new DOMPoint(cut.x + cut.width, cut.y + cut.height));
        const x0 = Math.min(a.x, b.x);
        const y0 = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        const k = Math.min(w, h) / 2;
        const cy = y0 + h / 2;
        const solid = 'linear-gradient(#000,#000)';
        const disc = (cx: number) =>
          `radial-gradient(circle ${k.toFixed(2)}px at ${cx.toFixed(2)}px ${cy.toFixed(2)}px,#000 ${Math.max(0, k - 0.5).toFixed(2)}px,transparent ${(k + 0.5).toFixed(2)}px)`;
        const px = (v: number) => `${v.toFixed(2)}px`;
        c.set('clip-path', '');
        // Top → bottom: full (subtract), left disc, right disc, middle rect (add).
        c.set('mask-image', `${solid},${disc(x0 + k)},${disc(x0 + w - k)},${solid}`);
        c.set('mask-position', `0 0,0 0,0 0,${px(x0 + k)} ${px(y0)}`);
        c.set('mask-size', `100% 100%,100% 100%,100% 100%,${px(Math.max(0, w - 2 * k))} ${px(h)}`);
        c.set('mask-repeat', 'no-repeat');
        c.set('mask-composite', 'subtract,add,add,add');
      }
    } else if (this.clip) {
      this.clearMask();
      // Clip is in canvas coordinates; map it into the element for translate/scale transforms.
      const inv = this.transform.inverse();
      const a = inv.transformPoint(new DOMPoint(this.clip.x, this.clip.y));
      const b = inv.transformPoint(new DOMPoint(this.clip.x + this.clip.width, this.clip.y + this.clip.height));
      // The right/bottom insets come from the element's own size through `calc(100% − …)`: reading offsetWidth /
      // offsetHeight here forced a synchronous layout per clipped layer per frame (right after the style writes).
      const far = (v: number) => `max(0px, calc(100% - ${fmt(v)}px))`;
      c.set('clip-path', `inset(${fmt(Math.max(0, a.y))}px ${far(b.x)} ${far(b.y)} ${fmt(Math.max(0, a.x))}px)`);
    } else {
      c.set('clip-path', '');
      this.clearMask();
    }
  }
  private clearMask(): void {
    const c = this.css;
    c.set('mask-image', '');
    c.set('mask-position', '');
    c.set('mask-size', '');
    c.set('mask-repeat', '');
    c.set('mask-composite', '');
  }
}

class CssGlass implements GlassShape {
  rect: Rect;
  appearance?: Appearance;
  radius: number;
  bottomRadius?: number;
  flex: Flex = { sx: 1, sy: 1, tx: 0, ty: 0 };
  pressed = false;
  pressAmount?: number;
  glow?: Pt;
  glowOpacity?: number;
  glowScale?: number;
  opacity = 1;
  tint: RGBA | null;
  interactive: boolean;
  visible = true;
  readonly el: HTMLDivElement;
  readonly glowEl: HTMLDivElement;
  constructor(
    readonly group: string,
    init: GlassGroup,
    private owner: CssRenderer,
  ) {
    this.rect = { ...init.rect };
    this.radius = init.radius ?? Math.min(init.rect.width, init.rect.height) / 2;
    this.tint = init.tint ?? null;
    this.interactive = init.interactive ?? false;
    if (init.opacity !== undefined) this.opacity = init.opacity;
    this.el = document.createElement('div');
    this.el.setAttribute('aria-hidden', 'true');
    this.el.dataset.liquidGlass = group;
    const s = this.el.style;
    s.position = 'absolute';
    s.left = '0';
    s.top = '0';
    s.pointerEvents = 'none';
    s.overflow = 'hidden';
    s.transformOrigin = '50% 50%';
    this.glowEl = document.createElement('div');
    const g = this.glowEl.style;
    g.position = 'absolute';
    g.inset = '0';
    g.pointerEvents = 'none';
    // Off until a touch glows: an idle `plus-lighter` child still makes WebKit composite a blend group inside every
    // glass (one more layer and a blend pass per glass shape, all the time).
    g.display = 'none';
    this.el.appendChild(this.glowEl);
    this.css = new StyleCache(this.el);
    this.glowCss = new StyleCache(this.glowEl);
  }
  private readonly css: StyleCache;
  private readonly glowCss: StyleCache;
  remove(): void {
    this.owner.removeGlass(this);
  }
  apply(style: GlassStyle, z: number, appearance: Appearance): void {
    const c = this.css;
    const r = this.rect;
    const dmin = Math.min(r.width, r.height);
    const R = glassRecipe(style, appearance);
    const sp = sizeParams(dmin, style, appearance);
    const op = Number.isNaN(this.opacity) ? 1 : Math.min(1, Math.max(0, this.opacity ?? 1));
    const shown = this.visible && op > 0;
    c.set('display', shown ? '' : 'none');
    // Hidden glass keeps its last styles: nothing below is drawn, so skip the work (and the style churn).
    if (!shown) return;
    // Shape opacity fades the whole glass: backdrop, rim, shadows and glow.
    c.set('opacity', op < 1 ? fmt(op) : '');
    c.set('z-index', String(Math.round(z)));
    c.set('width', `${fmt(r.width)}px`);
    c.set('height', `${fmt(r.height)}px`);
    const rt = fmt(Math.min(this.radius, dmin / 2));
    const rb = fmt(Math.min(this.bottomRadius ?? this.radius, dmin / 2));
    c.set('border-radius', `${rt}px ${rt}px ${rb}px ${rb}px`);
    c.set('corner-shape', this.radius >= dmin / 2 ? '' : 'squircle');
    const f = this.flex;
    c.set('transform', `translate(${fmt(r.x + f.tx)}px, ${fmt(r.y + f.ty)}px) scale(${fmt6(f.sx)}, ${fmt6(f.sy)})`);

    // Face line Y' = slope·Y + intercept from the face matrix (rows are Rec.709-weighted, so row-sum = slope).
    const m = R.face;
    const slope = m[0] + m[1] + m[2] - (m[3] - 0) * 0; // offsets separate
    const intercept = m[3];
    // contrast(k)·(1 − α) + white·α:  α = 2i − 1 + s, k = s/(1 − α)   (see module doc)
    let alpha = Math.min(0.9, Math.max(0, 2 * intercept - 1 + slope));
    let k = slope / Math.max(0.1, 1 - alpha);
    if (style === 'lens') {
      alpha = 0;
      k = 1.2;
    }
    const sat = style === 'clear' ? 1.06 : appearance === 'dark' ? 1.3 : 1.2;
    // Blur: the blur fill (radius 8) dominates the visible frost [GR §3]; CSS blur takes σ ≈ radius/2.
    const blur = style === 'clear' ? 1 : style === 'lens' ? 1 : Math.max(R.blurRadius, R.blurFillRadius) / 2 + 2;
    const bf = `blur(${blur}px) saturate(${sat}) contrast(${k.toFixed(3)})`;
    c.set('backdrop-filter', bf);
    c.set('-webkit-backdrop-filter', bf);
    const press = this.pressAmount ?? (this.pressed ? 1 : 0);
    let bg = `rgba(255,255,255,${alpha.toFixed(3)})`;
    if (this.tint) {
      const t = this.tint;
      bg = `rgba(${Math.round(t.r * 255)},${Math.round(t.g * 255)},${Math.round(t.b * 255)},${(0.8 * t.a).toFixed(3)})`;
    }
    // Lens at rest darkens the platter: light 1.13x − 0.2, dark 0.87x − 0.07.
    if (style === 'lens') bg = appearance === 'dark' ? 'rgba(0,0,0,0.69)' : 'rgba(0,0,0,0.075)';
    c.set('background-color', bg);
    // Rim: key 0° / fill 180° lobes (spread 80°), height 1 pt [LG §5]; on device they light the top and bottom edges
    // (demo-audit/chat raw/seeded-dark.png) → top/bottom inset highlights + faint ring.
    const rimA = appearance === 'dark' ? 0.35 : 0.6;
    const shadowA = R.shadowFillA * sp.shadowOpacity;
    // Edge ring (light): on device the glass outline reads as a thin dark line with a white highlight just inside it,
    // so a white shape on a white page keeps its silhouette. Measured on the Messages entry field / "+" circle
    // (uikit-internals/deep/demo-audit/chat/raw/seeded-light.png, 3x): a 2 px (0.67 pt) ring, ≈30 % black at the
    // capsule ends and ≈10 % at the top/bottom, then 1–2 px of white. CSS cannot vary a ring with curvature: one
    // uniform 0.67 pt ring (14 %), the white line inside it and the faint inner shade (interior 249–253 near the edge). The dark-appearance rim is light already.
    const edge =
      appearance === 'light' && style !== 'lens'
        ? ['inset 0 0 0 0.67px rgba(0,0,0,0.14)', 'inset 0 0 0 1.33px rgba(255,255,255,0.9)', 'inset 0 0 8px rgba(0,0,0,0.03)']
        : [];
    const shadows = [
      ...edge,
      `inset 0 1px 0.5px rgba(255,255,255,${rimA})`,
      `inset 0 -1px 0.5px rgba(255,255,255,${rimA})`,
      `inset 0 0 0 0.5px rgba(255,255,255,${(rimA * 0.4).toFixed(2)})`,
      // Drop shadow: offset (0, 8), blur = ShadowRadius, black 0.3·opacity.
      `0 8px ${sp.shadowRadius}px rgba(0,0,0,${shadowA.toFixed(4)})`,
    ].filter(Boolean);
    c.set('box-shadow', shadows.join(', '));
    // Pressed: no chromatic aberration in CSS; brighten slightly instead.
    c.set('filter', press > 0.001 ? `brightness(${fmt(1 + 0.05 * press)})` : '');

    // Glow [LG §9]: LittleGlow disc min(1.5h, 160) at the touch, BigGlow wash.
    const o = this.glowOpacity ?? 1;
    const g = this.glowCss;
    if (this.interactive && this.glow && o > 0.001) {
      const gp = glowParams(r.width, r.height);
      const size = gp.littleSize * (this.glowScale ?? 1);
      const lx = this.glow.x - r.x;
      const ly = this.glow.y - r.y;
      g.set('display', '');
      g.set('mix-blend-mode', 'plus-lighter');
      g.set(
        'background',
        `radial-gradient(circle ${fmt(size / 2 + size / 4)}px at ${fmt(lx)}px ${fmt(ly)}px, rgba(255,255,255,${(0.35 * gp.little * o).toFixed(3)}), rgba(255,255,255,0) 100%),` +
          ` rgba(255,255,255,${(0.06 * gp.big * o).toFixed(3)})`,
      );
    } else {
      g.set('display', 'none');
      g.set('mix-blend-mode', '');
      g.set('background', '');
    }
  }
}

interface CssGroup {
  style: GlassStyle;
  spacing: number;
  z: number;
  shapes: CssGlass[];
}

let autoId = 0;

export class CssRenderer implements Renderer {
  readonly kind = 'css' as const;
  private layers: CssLayer[] = [];
  private groups = new Map<string, CssGroup>();
  private _appearance: Appearance;

  /** `root` is the positioned container that replaces the canvas. */
  static create(root: HTMLElement, opts: { appearance?: Appearance } = {}): CssRenderer {
    return new CssRenderer(root, opts);
  }

  private constructor(
    readonly root: HTMLElement,
    opts: { appearance?: Appearance },
  ) {
    if (getComputedStyle(root).position === 'static') root.style.position = 'relative';
    root.style.overflow = 'hidden';
    this._appearance =
      opts.appearance ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }

  get appearance(): Appearance {
    return this._appearance;
  }

  setAppearance(a: Appearance): void {
    this._appearance = a;
    this.frame();
  }

  addLayer(el: HTMLElement, z: number): Layer {
    if (el.parentElement !== this.root) this.root.appendChild(el);
    el.removeAttribute('drawable');
    const l = new CssLayer(el, z, this);
    this.layers.push(l);
    return l;
  }

  removeLayer(layer: Layer): void {
    const i = this.layers.indexOf(layer as CssLayer);
    if (i >= 0) this.layers.splice(i, 1);
  }

  addGlass(init: GlassGroup): GlassShape {
    const key = init.group ?? `__cssglass${autoId++}`;
    let g = this.groups.get(key);
    if (!g) {
      g = { style: init.style ?? 'regular', spacing: init.spacing ?? 0, z: init.z ?? 100, shapes: [] };
      this.groups.set(key, g);
    }
    const s = new CssGlass(key, init, this);
    g.shapes.push(s);
    this.root.appendChild(s.el);
    return s;
  }

  configureGroup(group: string, opts: { spacing?: number; style?: GlassStyle; z?: number }): void {
    const g = this.groups.get(group);
    if (!g) return;
    Object.assign(g, Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)));
  }

  removeGlass(shape: GlassShape): void {
    const g = this.groups.get(shape.group);
    if (!g) return;
    const s = shape as CssGlass;
    g.shapes = g.shapes.filter((x) => x !== s);
    s.el.remove();
    if (!g.shapes.length) this.groups.delete(shape.group);
  }

  frame(): void {
    for (const l of this.layers) l.apply();
    for (const g of this.groups.values()) {
      const appearance = g.shapes.find((x) => x.appearance)?.appearance ?? this._appearance;
      for (const s of g.shapes) s.apply(g.style, g.z, appearance);
    }
  }

  destroy(): void {
    for (const g of this.groups.values()) for (const s of g.shapes) s.el.remove();
    this.groups.clear();
    this.layers = [];
  }
}
