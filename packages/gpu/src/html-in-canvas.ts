/**
 * Typed access to the HTML-in-Canvas API (WICG html-in-canvas) as shipped in Chrome 157.
 *
 * Verified in Chrome 157 stable (this package's probes, see test/README notes in the report):
 * - `HTMLCanvasElement.prototype` has `requestPaint`, `onpaint`, `captureElementImage`,
 *   `updateElementGeometry`, `getElementTransform`, `clearElementGeometry`,
 *   `getElementImageDefaultSize`, `onelementgeometryupdate`, `content`.
 * - The paint event is a `CanvasPaintEvent` with `changedElements` (an array of drawable children).
 *   The first paint and paints forced by `requestPaint()` report an empty list.
 * - `GPUQueue.prototype.drawElementImageToTexture` exists; `copyElementImageToTexture` does not (older builds only).
 * - Drawable children are laid out at the canvas origin for hit testing; `updateElementGeometry(el,
 *   {canvasTransform})` maps the element's box (CSS px) into canvas CSS px and moves hit testing,
 *   `getBoundingClientRect()` and `elementFromPoint` with it.
 */

export interface CanvasPaintEventLike extends Event {
  readonly changedElements?: ReadonlyArray<Element>;
}

export interface HtmlInCanvas extends HTMLCanvasElement {
  requestPaint(): void;
  onpaint: ((ev: CanvasPaintEventLike) => void) | null;
  updateElementGeometry?(el: Element, opts: { canvasTransform: DOMMatrix }): void;
  getElementTransform?(el: Element): DOMMatrix | null;
  getElementImageDefaultSize?(el: Element): { width: number; height: number };
  captureElementImage?(el: Element): unknown;
  clearElementGeometry?(el: Element): void;
}

interface QueueWithElementImage extends GPUQueue {
  drawElementImageToTexture?(
    source: { source: Element },
    dest: { texture: GPUTexture; size: { width: number; height: number } },
  ): void;
  copyElementImageToTexture?(...args: unknown[]): void;
}

export function asHtmlInCanvas(c: HTMLCanvasElement): HtmlInCanvas {
  return c as HtmlInCanvas;
}

let warnedLegacy = false;

/**
 * Copy an element's current rendering into `texture` (device pixels).
 * Tries `drawElementImageToTexture` (current shape), then the two legacy `copyElementImageToTexture` shapes.
 */
export function drawElementToTexture(
  queue: GPUQueue,
  el: Element,
  texture: GPUTexture,
  width: number,
  height: number,
): boolean {
  const q = queue as QueueWithElementImage;
  if (typeof q.drawElementImageToTexture === 'function') {
    q.drawElementImageToTexture({ source: el }, { texture, size: { width, height } });
    return true;
  }
  if (typeof q.copyElementImageToTexture === 'function') {
    if (!warnedLegacy) {
      warnedLegacy = true;
      console.info('[liquid-gpu] using legacy copyElementImageToTexture');
    }
    try {
      q.copyElementImageToTexture({ source: el }, { destination: { texture }, width, height });
    } catch {
      // Oldest shape: (element, width, height, {texture}).
      q.copyElementImageToTexture(el, width, height, { texture });
    }
    return true;
  }
  return false;
}

/** Feature detection: HTML-in-Canvas (drawable content + paint event) and WebGPU with an element-image upload. */
export function supportsHtmlInCanvas(): boolean {
  if (typeof window === 'undefined' || typeof HTMLCanvasElement === 'undefined') return false;
  const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
  if (typeof proto.requestPaint !== 'function' || !('onpaint' in proto)) return false;
  if (typeof navigator === 'undefined' || !('gpu' in navigator) || !navigator.gpu) return false;
  if (typeof GPUQueue === 'undefined') return false;
  const qp = GPUQueue.prototype as unknown as Record<string, unknown>;
  return typeof qp.drawElementImageToTexture === 'function' || typeof qp.copyElementImageToTexture === 'function';
}
