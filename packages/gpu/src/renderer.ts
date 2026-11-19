/**
 * LiquidRenderer: WebGPU compositor for HTML-in-Canvas layers plus the Liquid Glass renderer.
 *
 * Frame structure (ARCHITECTURE.md "Rendering model"):
 *   - Each layer (a drawable child of the canvas) is captured into its own texture in `onpaint`, only when its
 *     snapshot changed (`CanvasPaintEvent.changedElements`, plus our own dirty flags for new/resized layers).
 *   - `frame()` draws layers and glass groups in ascending z straight into the canvas texture. Before each glass
 *     group, the composite so far is downsampled into a half-resolution backdrop with a full mip chain
 *     ([LG §2] backdrop `scale = 0.5`), which the glass shader samples.
 *   - Hit testing follows every layer's transform through `canvas.updateElementGeometry` (Chrome 157), or a CSS
 *     transform on the element when that API is missing (WICG jelly demo approach).
 *
 * [LG] = uikit-internals/findings/liquid-glass.md, [GR] = uikit-internals/deep/glass-render/findings.md,
 * [GD] = uikit-internals/deep/glass-drag/findings.md.
 */
import type { Appearance, Flex, GlassGroup, GlassShape, GlassStyle, Layer, LayerLens, Pt, Rect, Renderer, RGBA } from './types.js';
import { asHtmlInCanvas, drawElementToTexture, supportsHtmlInCanvas, type CanvasPaintEventLike, type HtmlInCanvas } from './html-in-canvas.js';
import { glassRecipe, glowParams, sizeParams, type ColorMatrix3x4, type GlassRecipe } from './glass-params.js';
import { LAYER_WGSL, DOWNSAMPLE_WGSL, COPY_WGSL } from './shaders/composite.wgsl.js';
import { GLASS_WGSL, MAX_SHAPES } from './shaders/glass.wgsl.js';

export interface LiquidRendererOptions {
  /** Clear colour of the canvas (premultiplied by the renderer). Default transparent. */
  clearColor?: RGBA;
  /** Initial appearance. Default: from `prefers-color-scheme`. */
  appearance?: Appearance;
  /** Request a paint + frame automatically after captures (default true). */
  autoFrameOnPaint?: boolean;
  /** Called after every rendered frame with the CPU time spent in ms (for profiling). */
  onFrameStats?: (s: FrameStats) => void;
}

export interface FrameStats {
  cpuMs: number;
  layers: number;
  glassGroups: number;
  backdropUpdates: number;
  captures: number;
}

type Bounds = [number, number, number, number];

const LAYER_UBO_SIZE = 176; // 11 vec4
const GROUP_UBO_FLOATS = 22 * 4; // 22 vec4 in GroupU
const SHAPE_FLOATS = 28; // 7 vec4 per Shape
const BACKDROP_SCALE = 0.5; // [LG §2] CABackdropLayer scale = 0.5

/** `GlassShape.opacity` clamped to 0…1 (undefined / NaN → 1). */
const shapeOpacity = (s: GlassShape): number => {
  const o = s.opacity;
  return o === undefined || Number.isNaN(o) ? 1 : Math.min(1, Math.max(0, o));
};
const shapeDrawn = (s: GlassShape): boolean => s.visible && shapeOpacity(s) > 0;

const sameMatrix = (a: Float64Array | null, m: DOMMatrix) =>
  !!a && a[0] === m.a && a[1] === m.b && a[2] === m.c && a[3] === m.d && a[4] === m.e && a[5] === m.f;

class LayerImpl implements Layer {
  private _z: number;
  get z(): number {
    return this._z;
  }
  set z(v: number) {
    if (v === this._z) return;
    this._z = v;
    // Reordered: re-send hit geometry on the next frame even if the transform is unchanged (Chrome 157 hit-tests
    // overlapping drawables by the order of their latest geometry update).
    this.syncedMatrix = null;
  }
  transform = new DOMMatrix();
  opacity = 1;
  cornerRadius = 0;
  clip?: Rect;
  dim?: number;
  visible = true;
  lens?: LayerLens;
  cutout?: Rect;
  texture: GPUTexture | null = null;
  texW = 0;
  texH = 0;
  cssW = 0;
  cssH = 0;
  dirty = true;
  captured = false;
  bindGroup: GPUBindGroup | null = null;
  ubo: GPUBuffer;
  syncedMatrix: Float64Array | null = null;
  syncedVisible = true;
  readonly uboData = new Float32Array(LAYER_UBO_SIZE / 4);
  order = 0;

  constructor(
    readonly element: HTMLElement,
    z: number,
    private owner: LiquidRenderer,
    device: GPUDevice,
  ) {
    this._z = z;
    this.ubo = device.createBuffer({ size: LAYER_UBO_SIZE, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }
  invalidate(): void {
    this.dirty = true;
    this.owner.requestPaint();
  }
  remove(): void {
    this.owner.removeLayer(this);
  }
}

class GlassShapeImpl implements GlassShape {
  rect: Rect;
  appearance?: Appearance;
  radius: number;
  bottomRadius?: number;
  aberration?: number;
  innerRefraction?: number;
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
  constructor(
    readonly group: string,
    init: GlassGroup,
    private owner: LiquidRenderer,
  ) {
    this.rect = { ...init.rect };
    this.radius = init.radius ?? Math.min(init.rect.width, init.rect.height) / 2;
    this.tint = init.tint ?? null;
    this.interactive = init.interactive ?? false;
    if (init.opacity !== undefined) this.opacity = init.opacity;
  }
  remove(): void {
    this.owner.removeGlass(this);
  }
}

class GroupState {
  shapes: GlassShapeImpl[] = [];
  ubo: GPUBuffer;
  shapeUbo: GPUBuffer;
  readonly data = new Float32Array(GROUP_UBO_FLOATS);
  readonly shapeData = new Float32Array(SHAPE_FLOATS * MAX_SHAPES);
  recipe: GlassRecipe | null = null;
  recipeKey = '';
  order = 0;
  constructor(
    readonly key: string,
    public style: GlassStyle,
    public spacing: number,
    public z: number,
    device: GPUDevice,
  ) {
    this.ubo = device.createBuffer({ size: GROUP_UBO_FLOATS * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.shapeUbo = device.createBuffer({ size: SHAPE_FLOATS * 4 * MAX_SHAPES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
  }
}

let groupAutoId = 0;
let layerOrder = 0;

// ------------------------------------------------------------------------------------------------ shared device
/**
 * One GPUDevice per page, shared by every LiquidRenderer (several inline roots on one page). The device is created
 * on first use and kept for the page's lifetime; renderers never destroy it. A lost device is dropped from the cache
 * so the next renderer requests a new one.
 */
let devicePromise: Promise<GPUDevice | null> | null = null;
let liveGpuRenderers = 0;

/** The page-wide shared GPUDevice (null when WebGPU is unavailable). */
export function acquireSharedDevice(): Promise<GPUDevice | null> {
  if (!devicePromise) {
    devicePromise = (async () => {
      if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) return null;
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      device.lost.then(() => {
        devicePromise = null;
      });
      return device;
    })().catch((e) => {
      devicePromise = null;
      throw e;
    });
  }
  return devicePromise;
}

/** Number of live WebGPU renderers (canvases) on the page. */
export function gpuRendererCount(): number {
  return liveGpuRenderers;
}

interface Pipelines {
  sampler: GPUSampler;
  layer: GPURenderPipeline;
  glass: GPURenderPipeline;
  down: GPURenderPipeline;
  copy: GPURenderPipeline;
}
/** Pipelines are per (device, canvas format): compiled once, shared by every renderer on the device. */
const pipelineCache = new WeakMap<GPUDevice, Map<GPUTextureFormat, Pipelines>>();

function getPipelines(device: GPUDevice, format: GPUTextureFormat): Pipelines {
  let byFormat = pipelineCache.get(device);
  if (!byFormat) pipelineCache.set(device, (byFormat = new Map()));
  const hit = byFormat.get(format);
  if (hit) return hit;
  const sampler = device.createSampler({
    magFilter: 'linear',
    minFilter: 'linear',
    mipmapFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });
  const blend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  };
  const layerModule = device.createShaderModule({ code: LAYER_WGSL, label: 'liquid-layer' });
  const layer = device.createRenderPipeline({
    label: 'liquid-layer',
    layout: 'auto',
    vertex: { module: layerModule, entryPoint: 'vs' },
    fragment: { module: layerModule, entryPoint: 'fs', targets: [{ format, blend }] },
    primitive: { topology: 'triangle-strip' },
  });
  const glassModule = device.createShaderModule({ code: GLASS_WGSL, label: 'liquid-glass' });
  const glass = device.createRenderPipeline({
    label: 'liquid-glass',
    layout: 'auto',
    vertex: { module: glassModule, entryPoint: 'vs' },
    fragment: { module: glassModule, entryPoint: 'fs', targets: [{ format, blend }] },
    primitive: { topology: 'triangle-strip' },
  });
  const downModule = device.createShaderModule({ code: DOWNSAMPLE_WGSL, label: 'liquid-downsample' });
  const down = device.createRenderPipeline({
    label: 'liquid-downsample',
    layout: 'auto',
    vertex: { module: downModule, entryPoint: 'vs' },
    fragment: { module: downModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
  });
  const copyModule = device.createShaderModule({ code: COPY_WGSL, label: 'liquid-copy' });
  const copy = device.createRenderPipeline({
    label: 'liquid-copy',
    layout: 'auto',
    vertex: { module: copyModule, entryPoint: 'vs' },
    fragment: { module: copyModule, entryPoint: 'fs', targets: [{ format: 'rgba8unorm' }] },
  });
  for (const m of [layerModule, glassModule, downModule, copyModule]) {
    m.getCompilationInfo?.().then((info) => {
      for (const msg of info.messages) if (msg.type === 'error') console.error('[liquid-gpu] WGSL', msg.lineNum, msg.message);
    });
  }
  const p: Pipelines = { sampler, layer, glass, down, copy };
  byFormat.set(format, p);
  return p;
}

export class LiquidRenderer implements Renderer {
  readonly kind = 'webgpu' as const;
  private canvas: HtmlInCanvas;
  private context: GPUCanvasContext;
  private format: GPUTextureFormat;
  private sampler: GPUSampler;
  private layerPipeline: GPURenderPipeline;
  private glassPipeline: GPURenderPipeline;
  private downPipelineBackdrop: GPURenderPipeline;
  private copyPipeline: GPURenderPipeline;
  private layers: LayerImpl[] = [];
  private byElement = new Map<Element, LayerImpl>();
  private groups = new Map<string, GroupState>();
  private backdrop: GPUTexture | null = null;
  private backdropViews: GPUTextureView[] = [];
  private backdropSampleView: GPUTextureView | null = null;
  private sharp: GPUTexture | null = null;
  private sharpView: GPUTextureView | null = null;
  private downBindGroups: GPUBindGroup[] = []; // level i-1 → i, index i (i ≥ 1)
  private cssW = 1;
  private cssH = 1;
  private dpr = 1;
  private resizeObs: ResizeObserver;
  private layerResizeObs: ResizeObserver;
  private _appearance: Appearance;
  private clearColor: RGBA;
  private destroyed = false;
  private paintRequested = false;
  private captureCount = 0;
  private hasUEG: boolean;
  /** Paint events seen; exposed for diagnostics. */
  paintEvents = 0;
  lastChangedElements = -1;
  private opts: LiquidRendererOptions;

  /** Returns null when HTML-in-Canvas or WebGPU is unavailable (use the CSS fallback). */
  static async create(canvas: HTMLCanvasElement, opts: LiquidRendererOptions = {}): Promise<LiquidRenderer | null> {
    if (!supportsHtmlInCanvas()) return null;
    try {
      const device = await acquireSharedDevice();
      if (!device) return null;
      const context = canvas.getContext('webgpu');
      if (!context) return null;
      return new LiquidRenderer(canvas, device, context, opts);
    } catch (e) {
      console.warn('[liquid-gpu] WebGPU init failed, falling back to CSS', e);
      return null;
    }
  }

  private constructor(
    canvasEl: HTMLCanvasElement,
    readonly device: GPUDevice,
    context: GPUCanvasContext,
    opts: LiquidRendererOptions,
  ) {
    this.opts = opts;
    this.canvas = asHtmlInCanvas(canvasEl);
    // Chrome 157 uses content="drawable"; older builds used the layoutsubtree attribute.
    if (!canvasEl.hasAttribute('content')) canvasEl.setAttribute('content', 'drawable');
    if (!canvasEl.hasAttribute('layoutsubtree')) canvasEl.setAttribute('layoutsubtree', '');
    this.context = context;
    this.format = navigator.gpu.getPreferredCanvasFormat();
    this.hasUEG = typeof this.canvas.updateElementGeometry === 'function';
    this._appearance =
      opts.appearance ?? (typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.clearColor = opts.clearColor ?? { r: 0, g: 0, b: 0, a: 0 };

    const pipes = getPipelines(device, this.format);
    this.sampler = pipes.sampler;
    this.layerPipeline = pipes.layer;
    this.glassPipeline = pipes.glass;
    this.downPipelineBackdrop = pipes.down;
    this.copyPipeline = pipes.copy;
    liveGpuRenderers++;
    device.lost.then((info) => {
      if (!this.destroyed) console.error('[liquid-gpu] device lost', info.message);
    });

    this.canvas.onpaint = (ev) => this.onPaint(ev);

    this.resizeObs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const dp = e.devicePixelContentBoxSize?.[0];
        const cb = e.contentBoxSize?.[0];
        const cssW = cb ? cb.inlineSize : this.canvas.clientWidth;
        const cssH = cb ? cb.blockSize : this.canvas.clientHeight;
        // Chrome 157 quirk: on a content="drawable" canvas devicePixelContentBoxSize reports CSS px, not device
        // px. Trust it only when it agrees with contentBox × devicePixelRatio (to within rounding).
        const dpr = devicePixelRatio;
        const dpOk = !!dp && Math.abs(dp.inlineSize - cssW * dpr) <= 1.5 && Math.abs(dp.blockSize - cssH * dpr) <= 1.5;
        const w = dpOk ? dp!.inlineSize : Math.round(cssW * dpr);
        const h = dpOk ? dp!.blockSize : Math.round(cssH * dpr);
        this.resize(cssW, cssH, w, h);
      }
    });
    try {
      this.resizeObs.observe(this.canvas, { box: 'device-pixel-content-box' });
    } catch {
      this.resizeObs.observe(this.canvas);
    }
    this.layerResizeObs = new ResizeObserver((entries) => {
      for (const e of entries) {
        const layer = this.byElement.get(e.target);
        if (!layer) continue;
        const bb = e.borderBoxSize?.[0];
        const w = bb ? bb.inlineSize : (e.target as HTMLElement).offsetWidth;
        const h = bb ? bb.blockSize : (e.target as HTMLElement).offsetHeight;
        if (w !== layer.cssW || h !== layer.cssH) {
          layer.cssW = w;
          layer.cssH = h;
          layer.dirty = true;
        }
      }
      this.requestPaint();
    });
    // DPR-only changes (zoom, moving to another display) don't resize the CSS box; watch the resolution query.
    this.watchDpr();
    // Initial size (ResizeObserver delivers asynchronously).
    const r = this.canvas.getBoundingClientRect();
    this.resize(r.width || 1, r.height || 1, Math.round((r.width || 1) * devicePixelRatio), Math.round((r.height || 1) * devicePixelRatio));
  }

  get appearance(): Appearance {
    return this._appearance;
  }

  private dprQuery: MediaQueryList | null = null;
  private watchDpr(): void {
    if (typeof matchMedia === 'undefined') return;
    const onChange = () => {
      this.dprQuery?.removeEventListener('change', onChange);
      if (this.destroyed) return;
      const r = this.canvas.getBoundingClientRect();
      this.resize(r.width, r.height, Math.round(r.width * devicePixelRatio), Math.round(r.height * devicePixelRatio));
      this.watchDpr();
    };
    this.dprQuery = matchMedia(`(resolution: ${devicePixelRatio}dppx)`);
    this.dprQuery.addEventListener('change', onChange);
  }

  /** Canvas size in CSS px and device-pixel ratio actually used. */
  get size(): { width: number; height: number; dpr: number } {
    return { width: this.cssW, height: this.cssH, dpr: this.dpr };
  }

  setAppearance(a: Appearance): void {
    if (a === this._appearance) return;
    this._appearance = a;
    for (const g of this.groups.values()) g.recipeKey = '';
    this.frame();
  }

  setClearColor(c: RGBA): void {
    this.clearColor = c;
  }

  requestPaint(): void {
    if (this.paintRequested || this.destroyed) return;
    this.paintRequested = true;
    this.canvas.requestPaint();
  }

  // ---------------------------------------------------------------------------------------------- layers
  addLayer(el: HTMLElement, z: number): Layer {
    if (el.parentElement !== (this.canvas as HTMLElement)) {
      throw new Error('[liquid-gpu] addLayer: element must be a direct child of the canvas');
    }
    if (!el.hasAttribute('drawable')) el.setAttribute('drawable', '');
    const existing = this.byElement.get(el);
    if (existing) {
      existing.z = z;
      return existing;
    }
    // Removed earlier in this frame (unmount + remount of the same element, e.g. React StrictMode or a streamed
    // tree re-keying): revive it with its texture instead of re-allocating.
    const ghost = this.graveyard.find((g) => g.element === el);
    if (ghost) {
      this.graveyard.splice(this.graveyard.indexOf(ghost), 1);
      ghost.z = z;
      ghost.visible = true;
      ghost.syncedMatrix = null;
      ghost.dirty = true;
      this.layers.push(ghost);
      this.byElement.set(el, ghost);
      this.layerResizeObs.observe(el);
      this.requestPaint();
      return ghost;
    }
    const layer = new LayerImpl(el, z, this, this.device);
    layer.order = layerOrder++;
    layer.cssW = el.offsetWidth;
    layer.cssH = el.offsetHeight;
    this.layers.push(layer);
    this.byElement.set(el, layer);
    this.layerResizeObs.observe(el);
    this.requestPaint();
    return layer;
  }

  removeLayer(layer: Layer): void {
    const l = layer as LayerImpl;
    const i = this.layers.indexOf(l);
    if (i < 0) return;
    this.layers.splice(i, 1);
    this.byElement.delete(l.element);
    this.layerResizeObs.unobserve(l.element);
    try {
      this.canvas.clearElementGeometry?.(l.element);
    } catch {
      // The element may already be detached.
    }
    // GPU resources are released after the next submitted frame (never while a paint/capture may still reference
    // the texture), so rapid mount/unmount churn neither destroys in-flight textures nor thrashes allocations.
    this.graveyard.push(l);
    if (this.graveyard.length > 256) this.releaseGraveyard();
  }

  private graveyard: LayerImpl[] = [];
  private releaseGraveyard(): void {
    for (const l of this.graveyard) {
      l.texture?.destroy();
      l.texture = null;
      l.bindGroup = null;
      l.ubo.destroy();
    }
    this.graveyard = [];
  }

  // ---------------------------------------------------------------------------------------------- glass
  addGlass(init: GlassGroup): GlassShape {
    const key = init.group ?? `__glass${groupAutoId++}`;
    let g = this.groups.get(key);
    if (!g) {
      g = new GroupState(key, init.style ?? 'regular', init.spacing ?? 0, init.z ?? 100, this.device);
      g.order = layerOrder++;
      this.groups.set(key, g);
    } else {
      if (init.spacing !== undefined) g.spacing = init.spacing;
    }
    if (g.shapes.length >= MAX_SHAPES) throw new Error(`[liquid-gpu] a glass group holds at most ${MAX_SHAPES} shapes`);
    const s = new GlassShapeImpl(key, init, this);
    g.shapes.push(s);
    return s;
  }

  configureGroup(group: string, opts: { spacing?: number; style?: GlassStyle; z?: number }): void {
    const g = this.groups.get(group);
    if (!g) return;
    if (opts.spacing !== undefined) g.spacing = opts.spacing;
    if (opts.style !== undefined && opts.style !== g.style) {
      g.style = opts.style;
      g.recipeKey = '';
    }
    if (opts.z !== undefined) g.z = opts.z;
  }

  removeGlass(shape: GlassShape): void {
    const g = this.groups.get(shape.group);
    if (!g) return;
    const i = g.shapes.indexOf(shape as GlassShapeImpl);
    if (i >= 0) g.shapes.splice(i, 1);
    if (g.shapes.length === 0) {
      g.ubo.destroy();
      g.shapeUbo.destroy();
      this.groups.delete(shape.group);
    }
  }

  // ---------------------------------------------------------------------------------------------- sizing
  private resize(cssW: number, cssH: number, w: number, h: number): void {
    if (cssW <= 0 || cssH <= 0) return;
    const max = this.device.limits.maxTextureDimension2D;
    w = Math.max(1, Math.min(max, w));
    h = Math.max(1, Math.min(max, h));
    const changed = this.canvas.width !== w || this.canvas.height !== h || !this.backdrop;
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = w / cssW;
    if (!changed) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'premultiplied',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.allocBackdrop(w, h);
    // Layer textures follow element size × the canvas scale; re-check every layer on the next paint.
    for (const l of this.layers) l.dirty = true;
    this.requestPaint();
  }

  private allocBackdrop(w: number, h: number): void {
    this.backdrop?.destroy();
    const bw = Math.max(1, Math.ceil(w * BACKDROP_SCALE));
    const bh = Math.max(1, Math.ceil(h * BACKDROP_SCALE));
    const levels = Math.min(9, Math.floor(Math.log2(Math.max(bw, bh))) + 1);
    this.backdrop = this.device.createTexture({
      label: 'liquid-backdrop',
      size: [bw, bh],
      mipLevelCount: levels,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.backdropViews = [];
    for (let i = 0; i < levels; i++) this.backdropViews.push(this.backdrop.createView({ baseMipLevel: i, mipLevelCount: 1 }));
    this.backdropSampleView = this.backdrop.createView();
    this.sharp?.destroy();
    this.sharp = this.device.createTexture({
      label: 'liquid-sharp',
      size: [w, h],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.sharpView = this.sharp.createView();
    this.downBindGroups = [];
    for (let i = 1; i < levels; i++) {
      this.downBindGroups[i] = this.device.createBindGroup({
        layout: this.downPipelineBackdrop.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: this.backdropViews[i - 1]! },
          { binding: 1, resource: this.sampler },
        ],
      });
    }
  }

  // ---------------------------------------------------------------------------------------------- capture
  private onPaint(ev: CanvasPaintEventLike): void {
    this.paintRequested = false;
    this.paintEvents++;
    const changed = ev.changedElements;
    this.lastChangedElements = changed ? changed.length : -1;
    if (!changed) {
      // No change list: capture everything.
      for (const l of this.layers) l.dirty = true;
    } else {
      for (const el of changed) {
        let n: Element | null = el;
        while (n && n !== this.canvas) {
          const l = this.byElement.get(n);
          if (l) {
            l.dirty = true;
            break;
          }
          n = n.parentElement;
        }
      }
    }
    let captured = 0;
    for (const l of this.layers) {
      if (!l.dirty) continue;
      if (this.captureLayer(l)) captured++;
    }
    this.captureCount = captured;
    if (captured > 0 && this.opts.autoFrameOnPaint !== false) this.frame();
  }

  private desiredTextureSize(l: LayerImpl): { w: number; h: number } {
    const max = this.device.limits.maxTextureDimension2D;
    let w = 0;
    let h = 0;
    const def = this.canvas.getElementImageDefaultSize?.(l.element);
    if (def && def.width > 0 && def.height > 0) {
      w = def.width;
      h = def.height;
    } else {
      const scale = this.canvas.width / Math.max(1, this.cssW);
      w = Math.round(l.cssW * scale);
      h = Math.round(l.cssH * scale);
    }
    return { w: Math.max(1, Math.min(max, Math.round(w))), h: Math.max(1, Math.min(max, Math.round(h))) };
  }

  private captureLayer(l: LayerImpl): boolean {
    // A layer whose element left the canvas (unmounted, removal pending) has nothing to capture.
    if (!l.element.isConnected) return false;
    if (l.cssW <= 0 || l.cssH <= 0) {
      l.cssW = l.element.offsetWidth;
      l.cssH = l.element.offsetHeight;
      if (l.cssW <= 0 || l.cssH <= 0) return false;
    }
    const { w, h } = this.desiredTextureSize(l);
    if (!l.texture || l.texW !== w || l.texH !== h) {
      l.texture?.destroy();
      l.texture = this.device.createTexture({
        label: 'liquid-layer',
        size: [w, h],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      l.texW = w;
      l.texH = h;
      l.bindGroup = this.device.createBindGroup({
        layout: this.layerPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: l.ubo } },
          { binding: 1, resource: l.texture.createView() },
          { binding: 2, resource: this.sampler },
        ],
      });
    }
    try {
      if (!drawElementToTexture(this.device.queue, l.element, l.texture, w, h)) return false;
    } catch (e) {
      // The element may not have a snapshot yet (e.g. added this frame); retry on the next paint.
      console.warn('[liquid-gpu] capture failed', e);
      this.requestPaint();
      return false;
    }
    l.dirty = false;
    if (!l.captured) {
      // First capture: Chrome 157 may drop an `updateElementGeometry` sent before the drawable's first paint, so
      // re-send it on the next frame even when the transform (e.g. identity) did not change.
      l.syncedMatrix = null;
    }
    l.captured = true;
    return true;
  }

  // ---------------------------------------------------------------------------------------------- hit testing
  private syncGeometry(l: LayerImpl): void {
    const m = l.transform;
    if (l.visible === l.syncedVisible && sameMatrix(l.syncedMatrix, m)) return;
    if (!l.element.isConnected) return;
    const target = l.visible ? m : new DOMMatrix().translate(-1e5, -1e5);
    if (this.hasUEG) {
      this.canvas.updateElementGeometry!(l.element, { canvasTransform: target });
    } else {
      // Fallback (WICG jelly demo): move the DOM box with a CSS transform so hit testing matches the GPU.
      const el = l.element;
      el.style.transformOrigin = '0 0';
      el.style.transform = `translate(${-el.offsetLeft}px, ${-el.offsetTop}px) ${target.toString()}`;
    }
    l.syncedMatrix = Float64Array.of(m.a, m.b, m.c, m.d, m.e, m.f);
    l.syncedVisible = l.visible;
  }

  // ---------------------------------------------------------------------------------------------- frame
  frame(): void {
    if (this.destroyed || !this.backdrop) return;
    const t0 = performance.now();
    const device = this.device;
    for (const l of this.layers) this.syncGeometry(l);

    type Item = { z: number; order: number; layer?: LayerImpl; group?: GroupState };
    const items: Item[] = [];
    for (const l of this.layers) if (l.visible && l.captured && l.bindGroup && l.opacity > 0) items.push({ z: l.z, order: l.order, layer: l });
    for (const g of this.groups.values()) if (g.shapes.some(shapeDrawn)) items.push({ z: g.z, order: g.order, group: g });
    items.sort((a, b) => a.z - b.z || (a.layer ? 0 : 1) - (b.layer ? 0 : 1) || a.order - b.order);

    const target = this.context.getCurrentTexture();
    const targetView = target.createView();
    const enc = device.createCommandEncoder({ label: 'liquid-frame' });
    const cc = this.clearColor;
    let first = true;
    let pass: GPURenderPassEncoder | null = null;
    const openPass = () => {
      if (pass) return pass;
      pass = enc.beginRenderPass({
        colorAttachments: [
          {
            view: targetView,
            loadOp: first ? 'clear' : 'load',
            storeOp: 'store',
            clearValue: { r: cc.r * cc.a, g: cc.g * cc.a, b: cc.b * cc.a, a: cc.a },
          },
        ],
      });
      first = false;
      return pass;
    };
    const closePass = () => {
      if (pass) {
        pass.end();
        pass = null;
      }
    };

    let sceneChanged = true; // scene modified since the last backdrop update
    let sharpStale = true; // full-res copy older than the scene
    let glassBoundsSince: Bounds[] = [];
    let backdropUpdates = 0;
    let layerCount = 0;
    let groupCount = 0;

    for (const it of items) {
      if (it.layer) {
        const l = it.layer;
        this.writeLayerUniforms(l);
        const p = openPass();
        p.setPipeline(this.layerPipeline);
        p.setBindGroup(0, l.bindGroup!);
        p.draw(4);
        sceneChanged = true;
        sharpStale = true;
        glassBoundsSince = [];
        layerCount++;
      } else if (it.group) {
        const g = it.group;
        const bounds = this.writeGroupUniforms(g);
        if (!bounds) continue;
        const [bx0, by0, bx1, by1] = bounds;
        // The glass reads the composite below it: refresh the backdrop unless nothing it covers changed.
        const overlapsPrevGlass = glassBoundsSince.some(([ax0, ay0, ax1, ay1]) => !(ax1 < bx0 || ax0 > bx1 || ay1 < by0 || ay0 > by1));
        if (sceneChanged || overlapsPrevGlass) {
          closePass();
          if (first) {
            // Nothing drawn yet: clear so the backdrop reads the clear colour.
            openPass();
            closePass();
          }
          this.updateBackdrop(enc, targetView);
          backdropUpdates++;
          sceneChanged = false;
          sharpStale = true;
          glassBoundsSince = [];
        }
        // Lifted lenses read a full-resolution copy of the scene below them.
        if (sharpStale && g.style === 'lens' && g.shapes.some((s) => shapeDrawn(s) && (s.pressAmount ?? (s.pressed ? 1 : 0)) > 0)) {
          closePass();
          if (first) {
            openPass();
            closePass();
          }
          this.blit(enc, targetView, this.sharpView!);
          sharpStale = false;
        }
        const bg = device.createBindGroup({
          layout: this.glassPipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: g.ubo } },
            { binding: 1, resource: { buffer: g.shapeUbo } },
            { binding: 2, resource: this.backdropSampleView! },
            { binding: 3, resource: this.sampler },
            { binding: 4, resource: this.sharpView! },
          ],
        });
        const p = openPass();
        p.setPipeline(this.glassPipeline);
        p.setBindGroup(0, bg);
        // Scissor to the glass quad (device px) to keep the fragment cost local.
        const sx = Math.max(0, Math.floor(bx0 * this.dpr));
        const sy = Math.max(0, Math.floor(by0 * this.dpr));
        const ex = Math.min(this.canvas.width, Math.ceil(bx1 * this.dpr));
        const ey = Math.min(this.canvas.height, Math.ceil(by1 * this.dpr));
        if (ex > sx && ey > sy) {
          p.setScissorRect(sx, sy, ex - sx, ey - sy);
          p.draw(4);
          p.setScissorRect(0, 0, this.canvas.width, this.canvas.height);
        }
        glassBoundsSince.push(bounds);
        groupCount++;
      }
    }
    if (first) openPass();
    closePass();
    device.queue.submit([enc.finish()]);
    if (this.graveyard.length) this.releaseGraveyard();
    this.opts.onFrameStats?.({
      cpuMs: performance.now() - t0,
      layers: layerCount,
      glassGroups: groupCount,
      backdropUpdates,
      captures: this.captureCount,
    });
    this.captureCount = 0;
  }

  private blit(enc: GPUCommandEncoder, src: GPUTextureView, dst: GPUTextureView): void {
    const bg = this.device.createBindGroup({ layout: this.copyPipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: src }] });
    const p = enc.beginRenderPass({ colorAttachments: [{ view: dst, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }] });
    p.setPipeline(this.copyPipeline);
    p.setBindGroup(0, bg);
    p.draw(3);
    p.end();
  }

  private updateBackdrop(enc: GPUCommandEncoder, sceneView: GPUTextureView): void {
    const levels = this.backdropViews.length;
    const bg0 = this.device.createBindGroup({
      layout: this.downPipelineBackdrop.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: sceneView },
        { binding: 1, resource: this.sampler },
      ],
    });
    for (let i = 0; i < levels; i++) {
      const p = enc.beginRenderPass({
        colorAttachments: [{ view: this.backdropViews[i]!, loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      });
      p.setPipeline(this.downPipelineBackdrop);
      p.setBindGroup(0, i === 0 ? bg0 : this.downBindGroups[i]!);
      p.draw(3);
      p.end();
    }
  }

  private writeLayerUniforms(l: LayerImpl): void {
    const d = l.uboData;
    const m = l.transform;
    d[0] = m.a;
    d[1] = m.b;
    d[2] = m.c;
    d[3] = m.d;
    d[4] = m.e;
    d[5] = m.f;
    d[6] = l.cssW;
    d[7] = l.cssH;
    d[8] = l.opacity;
    d[9] = l.cornerRadius;
    d[10] = l.dim ?? 0;
    d[11] = l.clip ? 1 : 0;
    if (l.clip) {
      d[12] = l.clip.x;
      d[13] = l.clip.y;
      d[14] = l.clip.x + l.clip.width;
      d[15] = l.clip.y + l.clip.height;
    }
    d[16] = this.cssW;
    d[17] = this.cssH;
    d[18] = this.dpr;
    d[19] = 0; // element images arrive straight (non-premultiplied) alpha — see report "quirks"
    const lens = l.lens;
    if (lens) {
      const i = m.inverse();
      d.set([i.a, i.b, i.c, i.d, i.e, i.f], 20);
      const f = lens.flex ?? { sx: 1, sy: 1, tx: 0, ty: 0 };
      const r = lens.rect;
      d.set([r.x + r.width / 2 + f.tx, r.y + r.height / 2 + f.ty, r.width / 2, r.height / 2, f.sx, f.sy, lens.amount, lens.height, lens.rimHeight], 28);
    }
    d[26] = lens ? 1 : 0;
    const c = l.cutout;
    d[27] = c ? 1 : 0;
    if (c) d.set([c.x, c.y, c.x + c.width, c.y + c.height], 40);
    this.device.queue.writeBuffer(l.ubo, 0, d);
  }

  /** Writes group + shape uniforms; returns the quad bounds [x0,y0,x1,y1] in CSS px, or null if empty. */
  private writeGroupUniforms(g: GroupState): Bounds | null {
    const ap = g.shapes.find((s) => s.appearance)?.appearance ?? this._appearance;
    const key = `${g.style}|${ap}`;
    if (g.recipeKey !== key) {
      g.recipe = glassRecipe(g.style, ap);
      g.recipeKey = key;
    }
    const R = g.recipe!;
    const shapes = g.shapes.filter(shapeDrawn);
    if (!shapes.length) return null;
    const d = g.data;
    let o = 0;
    const v4 = (a: number, b: number, c: number, e: number) => {
      d[o++] = a;
      d[o++] = b;
      d[o++] = c;
      d[o++] = e;
    };
    const m3 = (m: ColorMatrix3x4) => {
      v4(m[0], m[1], m[2], m[3]);
      v4(m[4], m[5], m[6], m[7]);
      v4(m[8], m[9], m[10], m[11]);
    };
    v4(this.cssW, this.cssH, this.dpr, BACKDROP_SCALE);
    v4(R.styleCode, R.schemeCode, g.spacing, shapes.length);
    v4(R.blurRadius, R.blurFillRadius, R.blurFillNormal, R.blurFillLighten);
    v4(R.blurFillDarken, R.refractionOpacity, R.clampLimit, R.bleedDarken);
    m3(R.face);
    m3(R.bleed);
    v4(R.shadowFillA, R.ringOpacity, R.ringBlur, R.ringStroke);
    v4(R.ringOffset, R.ringMask, R.hlAmount, R.hlHeight);
    v4(R.hlOffset, R.hlBias, Math.cos(R.hlSpread), R.faceOpacity);
    v4(Math.cos(R.rimSpread), R.rimAmount, R.rimHeight, R.rimCurvature);
    m3(R.vibrant);
    const bd = this.backdrop!;
    v4(bd.width, bd.height, bd.mipLevelCount, -1 /* refraction sign K, see glass.wgsl.ts disp() */);
    m3(R.lensRest);

    // Shapes + bounds.
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    const sd = g.shapeData;
    sd.fill(0);
    shapes.forEach((s, i) => {
      const b = i * SHAPE_FLOATS;
      const r = s.rect;
      const f = s.flex;
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      const dmin = Math.min(r.width, r.height);
      const sp = sizeParams(dmin, g.style, ap);
      const glow = glowParams(r.width, r.height);
      const press = s.pressAmount ?? (s.pressed ? 1 : 0);
      sd[b + 0] = cx;
      sd[b + 1] = cy;
      sd[b + 2] = r.width / 2;
      sd[b + 3] = r.height / 2;
      sd[b + 4] = Math.min(s.radius, dmin / 2);
      sd[b + 5] = f.sx;
      sd[b + 6] = f.sy;
      sd[b + 7] = press;
      sd[b + 8] = f.tx;
      sd[b + 9] = f.ty;
      sd[b + 10] = s.glow?.x ?? -1e5;
      sd[b + 11] = s.glow?.y ?? -1e5;
      sd[b + 12] = s.glow ? (s.glowOpacity ?? 1) : 0;
      sd[b + 13] = s.glowScale ?? 1;
      sd[b + 14] = s.interactive ? 1 : 0;
      sd[b + 15] = dmin;
      if (s.tint) {
        sd[b + 16] = s.tint.r;
        sd[b + 17] = s.tint.g;
        sd[b + 18] = s.tint.b;
        sd[b + 19] = s.tint.a;
      }
      sd[b + 20] = glow.big;
      sd[b + 21] = glow.little;
      sd[b + 22] = glow.littleSize;
      sd[b + 23] = ap === 'dark' ? 1.0 : 0.6; // tint shadow factor o/tint, see tintShadowColor()
      sd[b + 24] = shapeOpacity(s);
      sd[b + 25] = s.bottomRadius !== undefined ? Math.min(s.bottomRadius, dmin / 2) : -1;
      sd[b + 26] = s.aberration ?? 1;
      sd[b + 27] = s.innerRefraction ?? -1;
      // Bounds: flexed rect + shadow reach (offset 8 + 3σ) + ring + aberration/glow slack.
      const hw = (r.width / 2) * f.sx;
      const hh = (r.height / 2) * f.sy;
      const reach = 8 + 3 * Math.max(sp.shadowRadius, R.ringBlur) + R.ringStroke + 4;
      x0 = Math.min(x0, cx + f.tx - hw - reach);
      y0 = Math.min(y0, cy + f.ty - hh - reach);
      x1 = Math.max(x1, cx + f.tx + hw + reach);
      y1 = Math.max(y1, cy + f.ty + hh + reach + 8);
    });
    // Smooth union can bulge by up to k/4 between shapes.
    const pad = g.spacing * 0.25;
    const bounds: Bounds = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    v4(bounds[0], bounds[1], bounds[2], bounds[3]);
    this.device.queue.writeBuffer(g.ubo, 0, d);
    this.device.queue.writeBuffer(g.shapeUbo, 0, sd);
    return bounds;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    liveGpuRenderers = Math.max(0, liveGpuRenderers - 1);
    this.releaseGraveyard();
    this.dprQuery = null;
    this.resizeObs.disconnect();
    this.layerResizeObs.disconnect();
    this.canvas.onpaint = null;
    for (const l of this.layers) {
      l.texture?.destroy();
      l.ubo.destroy();
    }
    for (const g of this.groups.values()) {
      g.ubo.destroy();
      g.shapeUbo.destroy();
    }
    this.backdrop?.destroy();
    this.sharp?.destroy();
    this.layers = [];
    this.groups.clear();
    // The device is shared by every renderer on the page (acquireSharedDevice): never destroy it here.
  }
}
