/** jsdom helpers: browser APIs LiquidRoot needs, and a tiny act()-based render. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
const g = globalThis as Record<string, unknown>;
g.ResizeObserver ??= NoopObserver;
g.IntersectionObserver ??= NoopObserver;
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}
/** 2D-only DOMMatrix (jsdom has none). */
class Matrix2D {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  constructor(init?: number[]) {
    if (init && init.length >= 6) [this.a, this.b, this.c, this.d, this.e, this.f] = init as [number, number, number, number, number, number];
  }
  get m11() { return this.a; }
  get m12() { return this.b; }
  get m21() { return this.c; }
  get m22() { return this.d; }
  get m41() { return this.e; }
  get m42() { return this.f; }
  get is2D() { return true; }
  get isIdentity() { return this.a === 1 && this.b === 0 && this.c === 0 && this.d === 1 && this.e === 0 && this.f === 0; }
  multiply(o: Matrix2D) {
    return new Matrix2D([
      this.a * o.a + this.c * o.b,
      this.b * o.a + this.d * o.b,
      this.a * o.c + this.c * o.d,
      this.b * o.c + this.d * o.d,
      this.a * o.e + this.c * o.f + this.e,
      this.b * o.e + this.d * o.f + this.f,
    ]);
  }
  translate(x = 0, y = 0) { return this.multiply(new Matrix2D([1, 0, 0, 1, x, y])); }
  scale(sx = 1, sy = sx) { return this.multiply(new Matrix2D([sx, 0, 0, sy, 0, 0])); }
  inverse() {
    const det = this.a * this.d - this.b * this.c || 1;
    return new Matrix2D([this.d / det, -this.b / det, -this.c / det, this.a / det, (this.c * this.f - this.d * this.e) / det, (this.b * this.e - this.a * this.f) / det]);
  }
  transformPoint(p: { x?: number; y?: number }) {
    const x = p.x ?? 0, y = p.y ?? 0;
    return { x: this.a * x + this.c * y + this.e, y: this.b * x + this.d * y + this.f, z: 0, w: 1 };
  }
  toString() { return `matrix(${this.a}, ${this.b}, ${this.c}, ${this.d}, ${this.e}, ${this.f})`; }
}
g.DOMMatrix ??= Matrix2D;
g.DOMPoint ??= class {
  constructor(public x = 0, public y = 0, public z = 0, public w = 1) {}
  matrixTransform(m: Matrix2D) {
    return m.transformPoint(this);
  }
};
g.DOMMatrixReadOnly ??= Matrix2D;

if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as unknown as HTMLCanvasElement['getContext'];
}

export interface Rendered {
  container: HTMLElement;
  root: Root;
  rerender(node: ReactNode): Promise<void>;
  unmount(): void;
}

export async function render(node: ReactNode): Promise<Rendered> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    root,
    rerender: async (n) => {
      await act(async () => {
        root.render(n);
      });
    },
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export async function click(el: Element | null | undefined) {
  if (!el) throw new Error('click: element not found');
  await act(async () => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

export async function flush() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}
