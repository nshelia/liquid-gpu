/**
 * Toolbar (BR §2): floating glass items, not a full-width bar. Capsules 48 tall (r 24), 28 pt from the sides and the
 * bottom, 12 apart; items 38 tall inset 5, 14 apart. Use `<ToolbarSpacer/>` for flexible space (a single item
 * between two spacers is centred), `<BarGroup>` to share one capsule.
 *
 * Place it in `<Screen toolbar={<Toolbar>…</Toolbar>}>` (the screen's scroll views get the 86 pt bottom inset), or
 * anywhere inside a layer.
 */
import { useContext, type ReactNode } from 'react';
import { metrics } from '@liquid-gpu/core';
import { TabBarPresentContext } from '../scroll/context';
import { useLiquid } from '../root/context';
import { TOOLBAR } from '../logic/nav';
import { BarMetricsContext, toolbarMetrics, useBarGroup } from './bars';

export function Toolbar({ children, 'aria-label': label = 'Toolbar' }: { children: ReactNode; 'aria-label'?: string }) {
  const { viewport } = useLiquid();
  const group = useBarGroup('toolbar');
  const inTab = useContext(TabBarPresentContext);
  // Above a tab bar the toolbar sits 12 pt over the platter. TODO(unknown): iOS usually hides the tab bar on push;
  // the stacked position is a visual choice.
  const top = inTab
    ? viewport.height - metrics.tabPlatterBottomGap - metrics.tabPlatterHeight - 12 - TOOLBAR.height
    : viewport.height - TOOLBAR.inset - TOOLBAR.height;
  return (
    <BarMetricsContext.Provider value={toolbarMetrics(group)}>
      <div
        role="toolbar"
        aria-label={label}
        className="lq-toolbar"
        style={{
          position: 'absolute',
          left: TOOLBAR.inset,
          width: viewport.width - 2 * TOOLBAR.inset,
          top,
          height: TOOLBAR.height,
          display: 'flex',
          alignItems: 'center',
          gap: TOOLBAR.capsuleGap,
          zIndex: 3,
        }}
      >
        {children}
      </div>
    </BarMetricsContext.Provider>
  );
}
