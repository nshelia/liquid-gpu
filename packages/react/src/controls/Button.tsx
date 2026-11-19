/**
 * `Button`: UIButton.Configuration styles (components/controls.md §1).
 *
 * - Solid styles (plain, gray, tinted, filled): a DOM button with the fill/foreground of CT §1.5. Highlight applies
 *   instantly at touch-down and fades back over 0.25 s ease-in-out (0.42, 0, 0.58, 1) on release (CT §1.7).
 * - Glass styles (glass, prominentGlass, clearGlass): the foundation's `<Glass interactive>` (flex press lift, drag
 *   stretch, glow, pressed aberration), capsule radius h/2 (CT §1.1), tinted with the accent for prominentGlass.
 * - Sizes (CT §1.3): mini = small 28 pt (insets 5/10, 15 pt title), medium 34.33 (7/12, 17 pt), large 50.33 (15/20).
 */
import { forwardRef, useState, type CSSProperties, type ReactNode, type MouseEvent as ReactMouseEvent } from 'react';
import { colors } from '@liquid-gpu/core';
import { Glass, useLiquid, type GlassHandle } from '../root';
import { buttonColors, buttonMetrics, isGlassVariant, type ButtonSize, type ButtonVariant } from './logic';

export interface ButtonProps {
  /** Style (SwiftUI `.buttonStyle`). Default `gray` (bordered). */
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Accent colour (CSS hex/rgb). Default: the system tint for the current appearance. */
  tint?: string;
  /** Destructive role: tints with systemRed. */
  role?: 'destructive' | 'cancel';
  disabled?: boolean;
  /** Leading icon (an SVG or glyph sized to the text). */
  icon?: ReactNode;
  children?: ReactNode;
  onClick?: (e: ReactMouseEvent<HTMLElement>) => void;
  /** Capsule (default for glass), or the per-size `dynamic` radius 14/17/25 (default for solid styles). */
  cornerStyle?: 'dynamic' | 'capsule';
  /** Stretch to the parent's width. */
  fullWidth?: boolean;
  className?: string;
  style?: CSSProperties;
  /** CSS for the label box (e.g. a custom height for a 44 pt circular glass button, SwiftUI `.frame(width:height:)`). */
  contentStyle?: CSSProperties;
  'aria-label'?: string;
  'aria-haspopup'?: 'menu' | 'dialog' | boolean;
  'aria-expanded'?: boolean;
  id?: string;
  /** Glass-style buttons: the `<Glass>` handle (shape, content layer) for transitions that morph out of the button. */
  glassRef?: React.Ref<GlassHandle>;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'gray',
    size = 'medium',
    tint,
    role,
    disabled,
    icon,
    children,
    onClick,
    cornerStyle,
    fullWidth,
    className,
    style,
    contentStyle,
    glassRef,
    ...aria
  },
  ref,
) {
  const ctx = useLiquid();
  const m = buttonMetrics[size];
  const palette = colors[ctx.appearance];
  // The root's `theme` overrides (ctx.theme) win over the tokens.
  const accent = tint ?? (role === 'destructive' ? (ctx.theme?.color('systemRed') ?? palette.systemRed!) : (ctx.theme?.tint ?? palette.tint!));
  const [highlighted, setHighlighted] = useState(false);
  const c = buttonColors(variant, ctx.appearance, accent, { highlighted, disabled });
  const glass = isGlassVariant(variant);
  const capsule = (cornerStyle ?? (glass ? 'capsule' : 'dynamic')) === 'capsule';
  const radius = capsule ? m.height / 2 : m.radius;
  const press = {
    onPointerDown: () => setHighlighted(true),
    onPointerUp: () => setHighlighted(false),
    onPointerLeave: () => setHighlighted(false),
    onPointerCancel: () => setHighlighted(false),
  };
  const iconOnly = !!icon && (children === undefined || children === null || children === false);

  const inner: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4, // TODO(unknown): imagePadding is 0 with the symbol's own 28 pt box (CT §1.3); 4 approximates the box inset
    boxSizing: 'border-box',
    height: m.height,
    minWidth: iconOnly ? m.height : undefined,
    padding: iconOnly ? 0 : `0 ${m.insetH}px`,
    fontSize: m.titleSize,
    lineHeight: `${m.titleLineHeight}px`,
    fontWeight: 400, // CT §1.3: `.SFUI-Regular`, weight 0 in every config
    letterSpacing: 0, // SF tracking is already applied by the system font in Chrome (size audit: widths match iOS at 0)
    whiteSpace: 'nowrap',
    color: c.foreground,
    fontFamily: 'inherit',
    ...contentStyle,
  };

  if (glass) {
    const tintColor = variant === 'prominentGlass' && !disabled ? accent : null;
    return (
      <Glass
        ref={glassRef}
        as="button"
        interactive={!disabled}
        style={variant === 'clearGlass' ? 'clear' : 'regular'}
        tint={tintColor}
        radius={radius}
        disabled={disabled}
        onClick={onClick}
        className={className}
        boxStyle={{ display: fullWidth ? 'block' : 'inline-block', width: fullWidth ? '100%' : undefined, height: inner.height, verticalAlign: 'middle', ...style }}
        fit={fullWidth ? 'container' : 'content'}
        contentStyle={{ ...inner, border: 'none', background: 'transparent', borderRadius: radius, cursor: disabled ? 'default' : 'pointer', transition: highlighted ? 'none' : 'color 0.25s cubic-bezier(0.42,0,0.58,1)' }}
        {...press}
        {...aria}
      >
        {icon}
        {children}
      </Glass>
    );
  }

  const fill = c.fill ?? 'transparent';
  return (
    <button
      ref={ref}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={className}
      {...press}
      style={{
        ...inner,
        width: fullWidth ? '100%' : undefined,
        border: 'none',
        borderRadius: radius,
        background: fill,
        cursor: disabled ? 'default' : 'pointer',
        // CT §1.7: instant highlight, 0.25 s (0.42, 0, 0.58, 1) un-highlight.
        transition: highlighted ? 'none' : 'background-color 0.25s cubic-bezier(0.42,0,0.58,1), color 0.25s cubic-bezier(0.42,0,0.58,1)',
        // radius ≈ h/2 at every size: iOS renders these as near-capsules, so no squircle corner shape
        ...style,
      }}
      {...aria}
    >
      {icon}
      {children}
    </button>
  );
});
