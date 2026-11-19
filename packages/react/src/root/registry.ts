/**
 * Scene registry: the root's single path for adding and removing layers and glass shapes.
 *
 * Streaming UI (a JSON tree arriving token by token, nodes re-keyed or replaced several times per second) mounts and
 * unmounts components faster than frames are drawn. Releases are therefore batched per frame:
 * - `releaseLayer` / `releaseGlass` hide the item at once (it is never drawn again) and queue the renderer removal;
 *   `flush()` (run by the root right before each draw) performs the queued removals in one batch.
 * - Re-acquiring the same element before the flush (unmount + remount of one DOM node, e.g. React StrictMode effects
 *   or a keyed re-parent) revives the pending layer instead of re-allocating its texture.
 * - Every acquire/release pair is balanced: after a flush the renderer holds exactly the live items (`stats()`).
 *
 * Framework-free (no DOM access beyond the handles), so the churn behaviour is unit-tested with a fake renderer.
 */
import type { GlassGroup, GlassShape, Layer } from '@liquid-gpu/gpu';

/** The renderer surface the registry needs. */
export interface RegistryRenderer {
  addLayer(el: HTMLElement, z: number): Layer;
  addGlass(init: GlassGroup): GlassShape;
}

export interface RegistryStats {
  liveLayers: number;
  liveGlass: number;
  pendingLayers: number;
  pendingGlass: number;
}

export class SceneRegistry {
  private readonly live = new Set<Layer>();
  private readonly liveGlass = new Set<GlassShape>();
  private readonly pending = new Map<HTMLElement, Layer>();
  private readonly pendingGlass = new Set<GlassShape>();
  private destroyed = false;

  /**
   * @param renderer target renderer
   * @param schedule called when removals are queued (the root requests a frame, whose draw calls `flush`)
   */
  constructor(
    private readonly renderer: RegistryRenderer,
    private readonly schedule: () => void = () => {},
  ) {}

  acquireLayer(el: HTMLElement, z: number): Layer {
    const ghost = this.pending.get(el);
    if (ghost) {
      this.pending.delete(el);
      ghost.z = z;
      ghost.visible = true;
      this.live.add(ghost);
      return ghost;
    }
    const l = this.renderer.addLayer(el, z);
    this.live.add(l);
    return l;
  }

  releaseLayer(l: Layer): void {
    if (!this.live.delete(l)) return;
    l.visible = false;
    if (this.destroyed) {
      l.remove();
      return;
    }
    const prev = this.pending.get(l.element);
    if (prev && prev !== l) prev.remove();
    this.pending.set(l.element, l);
    this.schedule();
  }

  acquireGlass(init: GlassGroup): GlassShape {
    const s = this.renderer.addGlass(init);
    this.liveGlass.add(s);
    return s;
  }

  releaseGlass(s: GlassShape): void {
    if (!this.liveGlass.delete(s)) return;
    s.visible = false;
    if (this.destroyed) {
      s.remove();
      return;
    }
    this.pendingGlass.add(s);
    this.schedule();
  }

  /** True when removals are queued. */
  get dirty(): boolean {
    return this.pending.size > 0 || this.pendingGlass.size > 0;
  }

  /** Perform the queued removals (one batch per frame). */
  flush(): void {
    if (this.pending.size) {
      const ls = [...this.pending.values()];
      this.pending.clear();
      for (const l of ls) l.remove();
    }
    if (this.pendingGlass.size) {
      const gs = [...this.pendingGlass];
      this.pendingGlass.clear();
      for (const s of gs) s.remove();
    }
  }

  stats(): RegistryStats {
    return {
      liveLayers: this.live.size,
      liveGlass: this.liveGlass.size,
      pendingLayers: this.pending.size,
      pendingGlass: this.pendingGlass.size,
    };
  }

  /** Flush and switch to immediate removal (the renderer is about to be destroyed). */
  destroy(): void {
    this.destroyed = true;
    this.flush();
  }
}
