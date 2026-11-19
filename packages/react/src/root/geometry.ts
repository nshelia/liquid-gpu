/**
 * Geometry helpers: element position inside its layer (layout only, transform-independent), and the mapping of
 * layer-local rects to canvas coordinates through a layer's 2D affine transform.
 */
import type { Rect } from '@liquid-gpu/gpu';

export interface Affine {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

/** Bounding box of `r` mapped by `m` (exact for translate/scale, conservative for rotation). */
export function transformRect(m: Affine, r: Rect): Rect {
  const xs = [r.x, r.x + r.width];
  const ys = [r.y, r.y + r.height];
  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity;
  for (const x of xs)
    for (const y of ys) {
      const px = m.a * x + m.c * y + m.e;
      const py = m.b * x + m.d * y + m.f;
      x0 = Math.min(x0, px);
      y0 = Math.min(y0, py);
      x1 = Math.max(x1, px);
      y1 = Math.max(y1, py);
    }
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

/** Uniform-ish scale of `m` (geometric mean of the axis scales), for radii. */
export function affineScale(m: Affine): number {
  const sx = Math.hypot(m.a, m.b);
  const sy = Math.hypot(m.c, m.d);
  return Math.sqrt(sx * sy);
}

export function multiply(m: Affine, n: Affine): Affine {
  return {
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  };
}

export function translation(x: number, y: number): Affine {
  return { a: 1, b: 0, c: 0, d: 1, e: x, f: y };
}

export function toDOMMatrix(m: Affine): DOMMatrix {
  return new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
}

export function rectsEqual(a: Rect | undefined, b: Rect | undefined, eps = 0.01): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.x - b.x) < eps &&
    Math.abs(a.y - b.y) < eps &&
    Math.abs(a.width - b.width) < eps &&
    Math.abs(a.height - b.height) < eps
  );
}

export function intersectRects(a: Rect, b: Rect): Rect {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return { x: x0, y: y0, width: Math.max(0, x1 - x0), height: Math.max(0, y1 - y0) };
}

/**
 * Extra translations applied by components to elements inside a layer (e.g. the rubber band of a ScrollView's
 * content). `measureInLayer` adds them, because offsetLeft/offsetTop ignore transforms.
 */
export const extraTranslation = new WeakMap<Element, { x: number; y: number }>();

/**
 * Position and size of `el` in the coordinate space of `layerEl` (the layer's own box), from layout:
 * offsetLeft/Top chain, minus the scroll offsets of scrolling ancestors, plus registered extra translations.
 * Independent of the layer's GPU/CSS transform, so it can be cached while the layer moves.
 */
export function measureInLayer(el: HTMLElement, layerEl: HTMLElement | null): Rect {
  const width = el.offsetWidth;
  const height = el.offsetHeight;
  if (!layerEl || el === layerEl) return { x: 0, y: 0, width, height };
  let x = 0;
  let y = 0;
  // Offsets up the offsetParent chain until the layer (layers are position:absolute, so they are offset parents).
  let n: HTMLElement | null = el;
  while (n && n !== layerEl) {
    x += n.offsetLeft;
    y += n.offsetTop;
    const p: Element | null = n.offsetParent;
    if (!p || !layerEl.contains(p)) {
      if (p !== layerEl) {
        // offsetParent left the layer (e.g. a fixed element): fall back to client rects.
        const a = el.getBoundingClientRect();
        const b = layerEl.getBoundingClientRect();
        return { x: a.left - b.left, y: a.top - b.top, width, height };
      }
    }
    n = p as HTMLElement | null;
  }
  // Scroll offsets and extra translations of every ancestor between el and the layer.
  let q: Element | null = el.parentElement;
  while (q && q !== layerEl) {
    const h = q as HTMLElement;
    if (h.scrollTop) y -= h.scrollTop;
    if (h.scrollLeft) x -= h.scrollLeft;
    const t = extraTranslation.get(q);
    if (t) {
      x += t.x;
      y += t.y;
    }
    q = q.parentElement;
  }
  return { x, y, width, height };
}
