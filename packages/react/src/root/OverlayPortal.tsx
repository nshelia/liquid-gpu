/**
 * `OverlayPortal`: where an overlay (Alert, Toast, Popover) of an inline root is drawn.
 *
 * - Fullscreen root, or inline root with `overlays="contained"`: renders its children in place (inside the root,
 *   clipped to it, canvas coordinates = the root's).
 * - Inline root with `overlays="page"` (default): renders its children into a transparent page-level root
 *   (`position: fixed`, full viewport, above the page) with the same appearance and theme. That root uses the CSS
 *   renderer, so its glass blurs the real page (including the inline root's canvas) with `backdrop-filter`; empty
 *   areas pass pointer events through. Inside it, canvas coordinates are client coordinates.
 *
 * React context from the inline root's tree (navigation, app providers) still reaches the children.
 */
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useLiquidOptional, type OverlayPlacement } from './context';
import { LiquidRootImpl } from './LiquidRoot';

export interface OverlayPortalProps {
  /** Override the root's `overlays` setting for this overlay. */
  placement?: OverlayPlacement;
  children?: ReactNode;
}

export function OverlayPortal({ placement, children }: OverlayPortalProps) {
  const ctx = useLiquidOptional();
  const where = placement ?? ctx?.overlays ?? 'page';
  if (!ctx || ctx.rootMode !== 'inline' || where !== 'page' || typeof document === 'undefined') return <>{children}</>;
  return createPortal(
    <LiquidRootImpl mode="overlay" appearance={ctx.appearance} theme={ctx.themeOverrides} baseLayer={false} fallbackFromQuery={false}>
      {children}
    </LiquidRootImpl>,
    document.body,
  );
}

/** True when the nearest root is a page-level overlay root (canvas coordinates = client coordinates). */
export function useIsPageOverlay(): boolean {
  return useLiquidOptional()?.rootMode === 'overlay';
}
