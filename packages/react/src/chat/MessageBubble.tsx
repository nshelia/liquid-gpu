/**
 * MessageBubble: one text balloon. Body = text + 14 pt each side, 10 pt top/bottom, first line 20.287 then 20 per
 * line (Regular 17); the shape is `bubblePath` (continuous corners + tail). Outgoing bubbles are filled with the
 * window-fixed blue gradient: the owner calls `paintBubbleGradients` when bubbles move on screen.
 */
import { memo, type CSSProperties, type Ref } from 'react';
import { fontStack } from '../root/theme';
import { BUBBLE_COLORS, CHAT, OUTGOING_STOPS, TAIL_INSET, bodyHeight, bubblePath, bubbleWidth, type TailSide } from './geometry';

/** Extra gradient length above/below the 0 … 887 pt range (flat ends), so any window y has a colour. */
const PAD = 2000;

/** Chrome sets SF 17 on a 20 pt line 0.5 pt lower than TextKit (ink bbox, seeded-light.png). */
export const TEXT_SHIFT = -0.6;

export function gradientCss(appearance: 'light' | 'dark'): string {
  const stops = OUTGOING_STOPS[appearance].map(([y, [r, g, b]]) => `rgb(${r},${g},${b}) ${y + PAD}px`);
  return `linear-gradient(to bottom, ${stops.join(', ')}) 0 0 / 100% ${CHAT.gradientHeight + 2 * PAD}px no-repeat`;
}

/** Background position for an outgoing fill whose top is at window y. */
export const gradientY = (y: number) => `0 ${-(PAD + y)}px`;

/** Paint the window-fixed gradient into every outgoing fill under `root` (reads all rects, then writes). */
export function paintBubbleGradients(root: HTMLElement | null, originY = 0): void {
  if (!root) return;
  const els = root.querySelectorAll<HTMLElement>('[data-chat-fill="out"]');
  const ys = Array.from(els, (el) => el.getBoundingClientRect().top - originY);
  els.forEach((el, i) => {
    const p = gradientY(ys[i]!);
    if (el.style.backgroundPosition !== p) el.style.backgroundPosition = p;
  });
}

// --- Text measurement ------------------------------------------------------------------------------------------

export interface TextMetrics {
  /** Widest line (pt) and line count when wrapped at the widest bubble. */
  width: number;
  lines: number;
}

const cache = new Map<string, TextMetrics>();
let probe: HTMLDivElement | null = null;

/** Lay the text out like the bubble's text view (17 pt, wrap at 310.67 − 28) and read its line boxes. */
export function measureText(text: string): TextMetrics {
  const hit = cache.get(text);
  if (hit) return hit;
  if (typeof document === 'undefined') return { width: CHAT.maxBubbleWidth - 2 * CHAT.textInsetX, lines: 1 };
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    Object.assign(probe.style, {
      position: 'fixed', left: '-10000px', top: '0', visibility: 'hidden', fontFamily: fontStack, fontSize: '17px',
      lineHeight: `${CHAT.lineHeight}px`, whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
      width: `${CHAT.maxBubbleWidth - 2 * CHAT.textInsetX}px`,
    } satisfies Partial<CSSStyleDeclaration>);
    document.body.appendChild(probe);
  }
  probe.textContent = text || ' ';
  const range = document.createRange();
  range.selectNodeContents(probe);
  const rects = Array.from(range.getClientRects());
  const tops = new Set<number>();
  let right = 0;
  const left = probe.getBoundingClientRect().left;
  for (const r of rects) {
    if (r.width === 0 && rects.length > 1) continue;
    tops.add(Math.round(r.top));
    right = Math.max(right, r.right - left);
  }
  const m = { width: right, lines: Math.max(1, tops.size) };
  cache.set(text, m);
  return m;
}

// --- Bubble ----------------------------------------------------------------------------------------------------

export interface MessageBubbleProps {
  text: string;
  outgoing: boolean;
  /** Last bubble of a run from one sender. */
  tail: boolean;
  appearance: 'light' | 'dark';
  /** Hidden while the flying copy is on its way (send animation). */
  hidden?: boolean;
  /** Override the body width (the flying bubble animates it). */
  width?: number;
  bubbleRef?: Ref<HTMLDivElement>;
  style?: CSSProperties;
}

export function bubbleSize(text: string): { width: number; height: number } {
  const m = measureText(text);
  return { width: bubbleWidth(m.width), height: bodyHeight(m.lines) };
}

/** Body + tail filled by `bubblePath`; the text sits on top. */
export const MessageBubble = memo(function MessageBubble({ text, outgoing, tail, appearance, hidden, width, bubbleRef, style }: MessageBubbleProps) {
  const size = bubbleSize(text);
  const w = width ?? size.width;
  const h = size.height;
  const side: TailSide = tail ? (outgoing ? 'right' : 'left') : null;
  const c = BUBBLE_COLORS[appearance];
  return (
    <div
      ref={bubbleRef}
      className="lq-chat-bubble"
      style={{ position: 'relative', width: w, height: h, flex: 'none', visibility: hidden ? 'hidden' : undefined, ...style }}
    >
      <div
        data-chat-fill={outgoing ? 'out' : 'in'}
        aria-hidden
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: w,
          height: h + TAIL_INSET + 1,
          clipPath: `path('${bubblePath(w, h, side)}')`,
          background: outgoing ? gradientCss(appearance) : c.incoming,
        }}
      />
      <div
        style={{
          position: 'relative',
          top: TEXT_SHIFT,
          boxSizing: 'border-box',
          width: w,
          padding: `${(h - CHAT.lineHeight * measureText(text).lines) / 2}px ${CHAT.textInsetX}px`,
          fontSize: 17,
          lineHeight: `${CHAT.lineHeight}px`,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          color: outgoing ? c.outgoingText : c.incomingText,
        }}
      >
        {text}
      </div>
    </div>
  );
});
