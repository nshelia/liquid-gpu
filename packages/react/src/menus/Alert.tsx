/**
 * `Alert` and `ActionSheet` / `ConfirmationDialog` (UIAlertController, components/text_overlays.md §9, findings/transitions.md §7).
 *
 * Alert: 320 wide, regular glass radius 34, no separators, centred in the safe area. Header: title Semibold 17 at
 * y 22 (Regular when there is no message), message Regular 15 in alertMessage, labels 260 wide (insets 30); header 72
 * with a message, 46 without. Actions: pills 48 tall, radius 24, tertiarySystemFill, 16 pt insets, 8 pt spacing. Two
 * actions sit side by side (140 each, Cancel on the left) when both titles fit, otherwise they stack with Cancel last.
 * Action titles Medium 17 in labelColor; the preferred action Semibold; destructive in systemRed.
 * Present: scale 1.2 → 1 plus opacity on the alert spring (k 522.35, c 45.71: ζ 1, 0.2749 s); dismiss: opacity only.
 * Dimming black 0.20 light / 0.48 dark (alertDimming token).
 *
 * ActionSheet on iPhone (iOS 27, §9.3): rendered centred like an alert with stacked pills and Cancel last; title-only
 * header 46 in Regular, no header when there is no title.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { componentType, metrics, radii, springs } from '@liquid-gpu/core';
import type { GlassShape, Layer, Rect } from '@liquid-gpu/gpu';
import { cssVar, LayerView, OverlayPortal, useGlassCore, useLiquid, zBands, type GlassGeometry } from '../root';
import { useMotion } from '../controls/motion';
import { useFocusTrap, usePresence } from './overlay';
import { orderActions } from './logic';
export { orderActions };

export interface AlertAction {
  title: string;
  role?: 'cancel' | 'destructive';
  /** `preferredAction`: Semibold, focused first, triggered by Enter. */
  preferred?: boolean;
  disabled?: boolean;
  onPress?: () => void;
}

export interface AlertProps {
  isPresented: boolean;
  title?: string;
  message?: string;
  actions?: AlertAction[];
  /** Extra content between the header and the actions (e.g. a TextField). */
  children?: ReactNode;
  /** Called after any action (and on Escape with a cancel action). Set `isPresented` false here. */
  onDismiss?: () => void;
  /** `actionSheet` stacks every action (ActionSheet / confirmationDialog). */
  layout?: 'alert' | 'actionSheet';
}

const ZERO: Rect = { x: 0, y: 0, width: 1, height: 1 };
const W = metrics.alertWidth; // 320

let measureCtx: CanvasRenderingContext2D | null = null;
function textWidth(s: string, weight: number): number {
  if (typeof document === 'undefined') return s.length * 9;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return s.length * 9;
  measureCtx.font = `${weight} 17px -apple-system, BlinkMacSystemFont, system-ui, sans-serif`;
  return measureCtx.measureText(s).width;
}

/** §9.2: side by side when there are exactly two actions and both titles fit 140 − 2·12 pt of padding. */
export function alertSideBySide(actions: readonly AlertAction[]): boolean {
  if (actions.length !== 2) return false;
  return actions.every((a) => textWidth(a.title, a.preferred ? 590 : 510) <= 140 - 24);
}

export function Alert({ isPresented, title, message, actions = [{ title: 'OK', preferred: true }], children, onDismiss, layout = 'alert' }: AlertProps) {
  const { mounted, exiting, done } = usePresence(isPresented);
  if (!mounted) return null;
  // Inline roots: drawn by a page-level overlay root by default (root/OverlayPortal); in place otherwise.
  return (
    <OverlayPortal>
      <AlertView title={title} message={message} actions={actions} onDismiss={onDismiss} layout={layout} exiting={exiting} onExited={done}>
        {children}
      </AlertView>
    </OverlayPortal>
  );
}

/** ActionSheet / confirmationDialog: iPhone iOS 27 renders it centred like an alert, all actions stacked. */
export function ActionSheet(props: Omit<AlertProps, 'layout'>) {
  return <Alert {...props} layout="actionSheet" />;
}
export const ConfirmationDialog = ActionSheet;

function AlertView({
  title,
  message,
  actions,
  children,
  onDismiss,
  layout,
  exiting,
  onExited,
}: Omit<AlertProps, 'isPresented'> & { actions: AlertAction[]; exiting: boolean; onExited: () => void }) {
  const ctx = useLiquid();
  const [layer, setLayer] = useState<Layer | null>(null);
  const dim = useRef<Layer | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const size = useRef({ w: W, h: 152 });
  const scale = useMotion(1.2, springs.alert); // TR §7: additive scale 1.2 → 1.0
  const opacity = useMotion(0, springs.alert);

  const side = layout === 'alert' && alertSideBySide(actions);
  const ordered = orderActions(actions, side);
  const rect = (): Rect => {
    const { w, h } = size.current;
    const top = ctx.safeArea.top || metrics.safeAreaTop;
    const bottom = ctx.safeArea.bottom || metrics.safeAreaBottom;
    // §9.1 `_contentInsets` {62, 24, 34, 24}: centred in the safe area (centre y 492 on 956).
    const cy = Math.max(top + h / 2, (top + ctx.viewport.height - bottom) / 2);
    const s = scale.value;
    return { x: ctx.viewport.width / 2 - (w * s) / 2, y: cy - (h * s) / 2, width: w * s, height: h * s };
  };

  useGlassCore(ZERO, { style: 'regular', z: zBands.alert + 1, radius: radii.alert }, (_g: GlassGeometry, shape: GlassShape) => {
    const r = rect();
    shape.rect = r;
    shape.radius = radii.alert * scale.value;
    // TR §7: the glass fades with the content (scale 1.2 → 1 plus opacity 0 → 1).
    shape.opacity = Math.max(0, Math.min(1, opacity.value));
    shape.visible = shape.opacity > 0.001;
  });

  useLayoutEffect(() => {
    if (!layer) return;
    const off = ctx.onBeforeFrame(() => {
      const r = rect();
      const s = scale.value;
      layer.transform = new DOMMatrix().translate(r.x, r.y).scale(s);
      layer.opacity = Math.max(0, Math.min(1, opacity.value));
      if (dim.current) dim.current.opacity = Math.max(0, Math.min(1, opacity.value));
      if (exiting && opacity.value <= 0.01) queueMicrotask(onExited);
    });
    ctx.requestFrame();
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, exiting]);

  useLayoutEffect(() => {
    const el = boxRef.current;
    if (el) size.current = { w: W, h: el.offsetHeight };
    if (!layer) return;
    if (exiting) opacity.set(0); // TR §7 dismiss: opacity only, same spring
    else {
      scale.snap(1.2);
      opacity.snap(0);
      scale.set(1);
      opacity.set(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, exiting]);

  const press = (a: AlertAction) => {
    if (a.disabled || exiting) return;
    a.onPress?.();
    onDismiss?.();
  };
  useFocusTrap(boxRef, !!layer && !exiting, () => {
    const i = ordered.findIndex((a) => a.preferred);
    return (boxRef.current?.querySelectorAll<HTMLElement>('[data-lq-alert-action]')[i >= 0 ? i : 0] as HTMLElement | undefined) ?? null;
  });

  const hasHeader = !!title || !!message;
  const at = componentType;
  return (
    <>
      <LayerView
        ref={(l) => {
          dim.current = l;
        }}
        z={zBands.alert}
        opacity={0}
        aria-hidden="true"
        className="lq-solid"
        // An action sheet (confirmationDialog) is cancelled by a tap outside it; an alert is not.
        onClick={() => {
          if (layout !== 'actionSheet') return;
          const c = actions.find((a) => a.role === 'cancel');
          if (c) press(c);
        }}
        style={{ background: cssVar('alertDimming') }}
      />
      <LayerView ref={setLayer} z={zBands.alert + 2} width={W} height="auto">
        <div
          ref={boxRef}
          role="alertdialog"
          aria-modal="true"
          aria-label={title}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              const c = actions.find((a) => a.role === 'cancel');
              if (c) press(c);
            }
          }}
          style={{ width: W, boxSizing: 'border-box', textAlign: 'center', color: cssVar('label') }}
        >
          {hasHeader && (
            // Title frame at y 22 with its first baseline at 38.287 and the message baseline 25.9 below (§9.1): the CSS line box
            // puts the baseline 0.29 pt higher, so the text is nudged down and the bottom pad shortened (header stays 72 / 46).
            <div style={{ padding: `22.29px ${metrics.alertLabelInset}px ${message ? 3.91 : 3.43}px` }}>
              {title && (
                <div
                  style={{
                    fontSize: at.alertTitle.size,
                    fontWeight: message ? at.alertTitle.weight : 400, // §9.1 title only: Regular
                    lineHeight: '20.29px',
                    letterSpacing: 0,
                  }}
                >
                  {title}
                </div>
              )}
              {message && (
                <div
                  style={{
                    marginTop: title ? 7.61 : 0,
                    fontSize: at.alertMessage.size,
                    lineHeight: '17.9px',
                    letterSpacing: 0,
                    color: cssVar('alertMessage'),
                  }}
                >
                  {message}
                </div>
              )}
            </div>
          )}
          {children && <div style={{ padding: `8px ${metrics.alertActionInsets}px 0` }}>{children}</div>}
          <div
            style={{
              display: 'flex',
              flexDirection: side ? 'row' : 'column',
              gap: metrics.alertActionSpacing,
              padding: metrics.alertActionInsets,
            }}
          >
            {ordered.map((a, i) => (
              <button
                key={i}
                type="button"
                data-lq-alert-action=""
                disabled={a.disabled}
                onClick={() => press(a)}
                style={{
                  flex: side ? '1 1 0' : undefined,
                  height: metrics.alertActionHeight,
                  border: 'none',
                  borderRadius: radii.alertAction,
                  background: cssVar('tertiarySystemFill'),
                  fontFamily: 'inherit',
                  fontSize: 17,
                  fontWeight: a.preferred ? at.alertAction.preferredWeight : at.alertAction.weight,
                  letterSpacing: 0,
                  color: a.disabled ? cssVar('tertiaryLabel') : a.role === 'destructive' ? cssVar('systemRed') : cssVar('label'),
                  cursor: a.disabled ? 'default' : 'pointer',
                  padding: '0 12px',
                }}
              >
                {a.title}
              </button>
            ))}
          </div>
        </div>
      </LayerView>
    </>
  );
}
