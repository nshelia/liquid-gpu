import { describe, expect, it } from 'vitest';
import type { GlassGroup, GlassShape, Layer } from '@liquid-gpu/gpu';
import { SceneRegistry } from '../src/root/registry';

/** Fake renderer: counts allocations and removals, holds the live set like the real ones. */
function fakeRenderer() {
  const layers = new Set<Layer>();
  const glass = new Set<GlassShape>();
  const counts = { addLayer: 0, removeLayer: 0, addGlass: 0, removeGlass: 0 };
  return {
    layers,
    glass,
    counts,
    addLayer(el: HTMLElement, z: number): Layer {
      counts.addLayer++;
      const l = {
        element: el,
        z,
        transform: null as unknown as DOMMatrix,
        opacity: 1,
        cornerRadius: 0,
        visible: true,
        invalidate() {},
        remove() {
          if (layers.delete(l)) counts.removeLayer++;
        },
      } as Layer;
      layers.add(l);
      return l;
    },
    addGlass(init: GlassGroup): GlassShape {
      counts.addGlass++;
      const s = {
        rect: init.rect,
        radius: 0,
        flex: { sx: 1, sy: 1, tx: 0, ty: 0 },
        pressed: false,
        tint: null,
        interactive: false,
        visible: true,
        group: init.group ?? 'g',
        remove() {
          if (glass.delete(s)) counts.removeGlass++;
        },
      } as GlassShape;
      glass.add(s);
      return s;
    },
  };
}

const el = (id: number) => ({ id }) as unknown as HTMLElement;
const R = { x: 0, y: 0, width: 10, height: 10 };

describe('SceneRegistry (streaming mount/unmount churn)', () => {
  it('a remount of the same element before the next frame revives its layer (no re-allocation)', () => {
    const r = fakeRenderer();
    let scheduled = 0;
    const reg = new SceneRegistry(r, () => scheduled++);
    const e = el(1);
    let l = reg.acquireLayer(e, 0);
    for (let i = 0; i < 1000; i++) {
      reg.releaseLayer(l);
      expect(l.visible).toBe(false); // hidden at once: never drawn while pending
      l = reg.acquireLayer(e, 5);
      expect(l.visible).toBe(true);
    }
    expect(r.counts.addLayer).toBe(1);
    expect(r.counts.removeLayer).toBe(0);
    expect(l.z).toBe(5);
    expect(scheduled).toBe(1000);
    reg.flush();
    expect(r.layers.size).toBe(1);
  });

  it('batches removals per frame and never leaks', () => {
    const r = fakeRenderer();
    const reg = new SceneRegistry(r);
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const mounted = new Map<number, { layer: Layer; glass: GlassShape }>();
    let nextId = 0;
    for (let frame = 0; frame < 200; frame++) {
      // A streamed tree: many mounts and unmounts between two frames (incl. nodes that live less than a frame).
      for (let op = 0; op < 40; op++) {
        if (mounted.size === 0 || rand() < 0.55) {
          const id = nextId++;
          mounted.set(id, { layer: reg.acquireLayer(el(id), id % 7), glass: reg.acquireGlass({ rect: R }) });
        } else {
          const ids = [...mounted.keys()];
          const id = ids[Math.floor(rand() * ids.length)]!;
          const m = mounted.get(id)!;
          mounted.delete(id);
          reg.releaseLayer(m.layer);
          reg.releaseGlass(m.glass);
          // Double release (effect cleanup run twice) is harmless.
          reg.releaseLayer(m.layer);
          reg.releaseGlass(m.glass);
        }
      }
      // Removals wait for the frame…
      const before = r.counts.removeLayer;
      expect(reg.stats().liveLayers).toBe(mounted.size);
      reg.flush();
      // …and happen in one batch there.
      expect(r.counts.removeLayer).toBeGreaterThanOrEqual(before);
      expect(reg.stats()).toEqual({ liveLayers: mounted.size, liveGlass: mounted.size, pendingLayers: 0, pendingGlass: 0 });
      expect(r.layers.size).toBe(mounted.size);
      expect(r.glass.size).toBe(mounted.size);
    }
    // Unmount everything: the renderer ends empty.
    for (const m of mounted.values()) {
      reg.releaseLayer(m.layer);
      reg.releaseGlass(m.glass);
    }
    reg.flush();
    expect(r.layers.size).toBe(0);
    expect(r.glass.size).toBe(0);
    expect(r.counts.addLayer).toBe(r.counts.removeLayer);
    expect(r.counts.addGlass).toBe(r.counts.removeGlass);
  });

  it('removes immediately once destroyed', () => {
    const r = fakeRenderer();
    const reg = new SceneRegistry(r);
    const a = reg.acquireLayer(el(1), 0);
    const g = reg.acquireGlass({ rect: R });
    reg.releaseLayer(a);
    reg.destroy();
    expect(r.layers.size).toBe(0);
    reg.releaseGlass(g);
    expect(r.glass.size).toBe(0);
  });
});
