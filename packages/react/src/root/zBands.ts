/**
 * Draw-order bands. Layers and glass groups are drawn in ascending z; DOM order of the layer elements follows the
 * same order (z-index), so hit testing and focus match what is drawn.
 *
 * Inside a layer at z, nested glass uses z + 1 and the glass content z + 2 (see `<Glass>`). Leave gaps of ≥ 10
 * between independent surfaces.
 */
export const zBands = {
  /** LiquidRoot's default layer for plain children. */
  base: 0,
  /** NavigationStack screen i: screen(i) … screen(i) + 9 (shadow strip at screen(i) − 1). */
  screen: (i: number) => 100 + i * 10,
  /** Tab bar platter, lens and content. */
  tabBar: 5000,
  /** Toolbar floating above a screen. */
  toolbar: 4000,
  /**
   * Sheet i: dimming at sheet(i), glass + 1, backing + 2, content + 3 (nested glass + 4/5); screens inside the
   * sheet start at content + 10 (see `ZBaseContext`).
   */
  sheet: (i: number) => 6000 + i * 500,
  /** Menus, popovers, context menus (second agent). */
  menu: 8000,
  /** Alerts and action sheets. */
  alert: 9000,
  /** Toasts and HUDs. */
  toast: 9500,
} as const;
