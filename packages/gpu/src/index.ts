export type { Appearance, Flex, GlassGroup, GlassShape, GlassShapeInit, GlassStyle, Layer, LayerLens, Pt, Rect, Renderer, RGBA } from './types.js';
export { supportsHtmlInCanvas, drawElementToTexture } from './html-in-canvas.js';
export { LiquidRenderer, acquireSharedDevice, gpuRendererCount, type LiquidRendererOptions, type FrameStats } from './renderer.js';
export { CssRenderer } from './fallback.js';
export {
  setYccComposite,
  glassRecipe,
  sizeParams,
  glowParams,
  tintShadowColor,
  parseColor,
  type ColorMatrix3x4,
  type GlassRecipe,
  type SizeParams,
} from './glass-params.js';

import type { Appearance, Renderer } from './types.js';
import { LiquidRenderer, gpuRendererCount, type LiquidRendererOptions } from './renderer.js';
import { CssRenderer } from './fallback.js';

/** WebGPU renderers being created (counted against `maxGpuRenderers` before they exist). */
let pendingGpu = 0;

/**
 * Create the best renderer for `canvas`: WebGPU + HTML-in-Canvas when available, otherwise replace the canvas with
 * a `<div>` (same id, class, style and children) and return a `CssRenderer` on it.
 *
 * Every WebGPU renderer shares one GPUDevice (`acquireSharedDevice`). `maxGpuRenderers` caps the number of live
 * WebGPU canvases on the page: once that many exist, further renderers use the CSS fallback.
 */
export async function createRenderer(
  canvas: HTMLCanvasElement,
  opts: LiquidRendererOptions & { appearance?: Appearance; forceFallback?: boolean; maxGpuRenderers?: number } = {},
): Promise<Renderer> {
  const capped = opts.maxGpuRenderers !== undefined && gpuRendererCount() + pendingGpu >= opts.maxGpuRenderers;
  if (!opts.forceFallback && !capped) {
    pendingGpu++;
    let gpu: LiquidRenderer | null;
    try {
      gpu = await LiquidRenderer.create(canvas, opts);
    } finally {
      pendingGpu--;
    }
    if (gpu) return gpu;
  }
  const div = document.createElement('div');
  if (canvas.id) div.id = canvas.id;
  div.className = canvas.className;
  div.setAttribute('style', canvas.getAttribute('style') ?? '');
  div.dataset.liquidFallback = '';
  while (canvas.firstChild) div.appendChild(canvas.firstChild);
  canvas.replaceWith(div);
  return CssRenderer.create(div, { appearance: opts.appearance });
}
