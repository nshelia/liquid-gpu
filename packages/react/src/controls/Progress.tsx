/**
 * `ProgressView` (UIProgressView, components/controls.md §7) and `ActivityIndicator` (UIActivityIndicatorView, §8).
 *
 * ProgressView: default style 4 pt track (#78787D@0.20 light / #777780@0.36 dark) with rounded ends, accent fill;
 * `bar` style 2.667 pt with no track. Changes animate over 0.4 s linear (setProgress(animated:)).
 * Without `value` it renders the ActivityIndicator (SwiftUI `ProgressView()`).
 *
 * ActivityIndicator: 8 spokes, a 16-frame discrete 0.8 s loop (50 ms half-spoke steps), colour #3C3C43@0.60, medium
 * 20×20 / large 37×37. Reduced motion keeps the loop (UIKit does not stop it) but it is a cheap stepped animation.
 */
import { useId, type CSSProperties } from 'react';
import { cssVar, useLiquid } from '../root';
import { activityGeometry as A, activitySpokeAlpha } from './logic';

export interface ProgressViewProps {
  /** 0…1. Omit for an indeterminate spinner. */
  value?: number;
  variant?: 'default' | 'bar';
  tint?: string;
  /** Animate value changes (0.4 s linear). Default true. */
  animated?: boolean;
  width?: number | string;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

export function ProgressView({ value, variant = 'default', tint, animated = true, width = '100%', className, style, ...aria }: ProgressViewProps) {
  const ctx = useLiquid();
  if (value === undefined) return <ActivityIndicator className={className} style={style} {...aria} />;
  const v = Math.min(1, Math.max(0, value));
  const h = variant === 'bar' ? 2.667 : 4;
  const track = variant === 'bar' ? 'transparent' : ctx.appearance === 'dark' ? 'rgba(119,119,128,0.36)' : 'rgba(120,120,125,0.20)';
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={v}
      className={className}
      style={{ width, height: h, borderRadius: h / 2, background: track, overflow: 'hidden', ...style }}
      {...aria}
    >
      <div
        style={{
          height: '100%',
          width: `${v * 100}%`,
          borderRadius: h / 2,
          background: tint ?? cssVar('tint'),
          transition: animated && !ctx.reducedMotion ? 'width 0.4s linear' : 'none',
        }}
      />
    </div>
  );
}

export interface ActivityIndicatorProps {
  size?: 'medium' | 'large';
  /** Spoke colour. Default #3C3C43@0.60 (light) / #EBEBF5@0.60 (dark). */
  color?: string;
  /** Stopped indicators hide (hidesWhenStopped). */
  animating?: boolean;
  'aria-label'?: string;
  className?: string;
  style?: CSSProperties;
}

let keyframesInjected = false;
function injectKeyframes() {
  if (keyframesInjected || typeof document === 'undefined') return;
  keyframesInjected = true;
  // One 16-step opacity sequence for spoke 0; spoke i is phase-shifted by i·2 frames (CT §8).
  const steps = Array.from({ length: 16 }, (_, f) => `${((f / 16) * 100).toFixed(3)}%{opacity:${((0.85 * activitySpokeAlpha(f, 0)) / (130 / 255)).toFixed(4)}}`).join('');
  const el = document.createElement('style');
  el.dataset.lqActivity = '';
  el.textContent = `@keyframes lq-activity{${steps}100%{opacity:0.85}}`;
  document.head.appendChild(el);
}

export function ActivityIndicator({ size = 'medium', color, animating = true, className, style, ...aria }: ActivityIndicatorProps) {
  const ctx = useLiquid();
  injectKeyframes();
  const id = useId();
  const g = A[size];
  // Spoke alphas are relative to the brightest (130/255), applied on top of the base colour's own 0.6 alpha, then ×0.85
  // so the brightest spoke renders at ≈0.51 like the iOS 27 reference (size audit: ×1.0 was ≈20 % too dark).
  const base = color ?? (ctx.appearance === 'dark' ? 'rgba(235,235,245,0.6)' : cssVar('alertMessage'));
  const frame = (A.loop / A.frames) * 1000; // 50 ms
  if (!animating) return null;
  return (
    <span
      role="progressbar"
      aria-busy="true"
      aria-label={aria['aria-label'] ?? 'Loading'}
      className={className}
      style={{ display: 'inline-block', width: g.size, height: g.size, verticalAlign: 'middle', ...style }}
    >
      <svg width={g.size} height={g.size} viewBox={`${-g.size / 2} ${-g.size / 2} ${g.size} ${g.size}`} aria-hidden="true" id={id}>
        {Array.from({ length: A.spokes }, (_, i) => (
          <line
            key={i}
            x1={0}
            y1={-g.spokeInner}
            x2={0}
            y2={-g.spokeOuter}
            stroke={base}
            strokeWidth={g.spokeWidth * (size === 'large' ? 1 : 1.6)}
            strokeLinecap="round"
            transform={`rotate(${i * 45})`}
            style={{
              opacity: (0.85 * activitySpokeAlpha(0, i)) / (130 / 255),
              animation: `lq-activity ${A.loop}s steps(1, end) infinite`,
              animationDelay: `${-((16 - 2 * i) % 16) * frame}ms`,
            }}
          />
        ))}
      </svg>
    </span>
  );
}
