/**
 * ChatInputBar (no software keyboard): a 40 pt glass "+" circle at x 28 and a glass field 332 × 40.33 (r 20) at
 * x 80, both 28 pt above the bottom (CKMessageEntryView 69 tall). The field grows upwards by 20 pt per line with no
 * animation; the 38 × 28 systemBlue send capsule (6.33 from the field's right/bottom) appears and disappears in one
 * frame (typekb.trk.jsonl). Enter sends, Shift+Enter adds a line.
 */
import { forwardRef, useImperativeHandle, useLayoutEffect, useRef } from 'react';
import { Glass } from '../root/Glass';
import { useLiquid } from '../root/context';
import { cssVar } from '../root/theme';
import { CHAT, BUBBLE_COLORS } from './geometry';
import { TEXT_SHIFT } from './MessageBubble';
import type { SendOrigin } from './types';

export interface ChatInputBarProps {
  value: string;
  onChange(value: string): void;
  /** Called with the trimmed text and the field rect at the moment of sending. */
  onSend(text: string, origin: SendOrigin): void;
  placeholder?: string;
  appearance: 'light' | 'dark';
  /** Field height changes (1 line = 40.33). */
  onHeight?(height: number): void;
  maxLines?: number;
}

export interface ChatInputBarHandle {
  focus(): void;
  send(): void;
}

/** Field and "+" bottoms: 28 pt above the window bottom. */
const FIELD_BOTTOM = 28;

export function fieldHeight(lines: number): number {
  return CHAT.fieldHeight + CHAT.lineHeight * (Math.max(1, lines) - 1);
}

export const ChatInputBar = forwardRef<ChatInputBarHandle, ChatInputBarProps>(function ChatInputBar(
  { value, onChange, onSend, placeholder = 'Message', appearance, onHeight, maxLines = 8 },
  ref,
) {
  const { viewport } = useLiquid();
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const linesRef = useRef(1);
  const has = value.trim().length > 0;

  // Line count from the textarea's scroll height (padding 10.17 + 20 per line).
  useLayoutEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = '0px';
    const lines = Math.max(1, Math.round((ta.scrollHeight - (CHAT.fieldHeight - CHAT.lineHeight)) / CHAT.lineHeight));
    ta.style.height = '';
    if (lines !== linesRef.current) {
      linesRef.current = lines;
      onHeight?.(fieldHeight(Math.min(lines, maxLines)));
    }
  });
  const h = fieldHeight(Math.min(linesRef.current, maxLines));

  const send = () => {
    const text = value.trim();
    const box = boxRef.current?.parentElement?.querySelector<HTMLElement>('.lq-chat-field-box');
    if (!text || !box) return;
    const r = box.getBoundingClientRect();
    onSend(text, { right: r.right, top: r.top, width: r.width });
  };
  useImperativeHandle(ref, () => ({ focus: () => taRef.current?.focus(), send }));

  return (
    <div ref={boxRef} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: CHAT.entryHeight + h - CHAT.fieldHeight, pointerEvents: 'none' }}>
      <Glass
        as="button"
        interactive
        aria-label="Add"
        boxStyle={{ position: 'absolute', left: CHAT.plusX, bottom: FIELD_BOTTOM }}
        contentStyle={{ width: CHAT.plusSize, height: CHAT.plusSize, color: cssVar('label'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <svg width="20" height="18.667" viewBox="0 0 20 18.667" aria-hidden>
          <path d="M10 1.7v15.267M2.367 9.333h15.266" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
      </Glass>
      <Glass
        fit="container"
        radius={CHAT.fieldRadius}
        className="lq-chat-field-box"
        boxStyle={{ position: 'absolute', left: CHAT.fieldX, bottom: FIELD_BOTTOM, width: viewport.width - CHAT.fieldX - CHAT.plusX, height: h }}
        contentStyle={{ position: 'relative', boxSizing: 'border-box', borderRadius: CHAT.fieldRadius }}
      >
        <textarea
          ref={taRef}
          className="lq-input lq-chat-input"
          rows={1}
          value={value}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            boxSizing: 'border-box',
            width: '100%',
            height: '100%',
            margin: 0,
            border: 'none',
            outline: 'none',
            resize: 'none',
            background: 'transparent',
            padding: `${(CHAT.fieldHeight - CHAT.lineHeight) / 2 + TEXT_SHIFT}px ${CHAT.fieldTextRight}px ${(CHAT.fieldHeight - CHAT.lineHeight) / 2 - TEXT_SHIFT}px ${CHAT.fieldTextLeft}px`,
            font: 'inherit',
            fontSize: 17,
            lineHeight: `${CHAT.lineHeight}px`,
            color: cssVar('label'),
            caretColor: cssVar('tint'),
            overflowY: linesRef.current > maxLines ? 'auto' : 'hidden',
            scrollbarWidth: 'none',
          }}
        />
        {has && (
          <button
            type="button"
            aria-label="Send"
            onPointerDown={(e) => e.preventDefault()}
            onClick={send}
            style={{
              position: 'absolute',
              right: CHAT.sendInset,
              bottom: CHAT.sendInset,
              width: CHAT.sendWidth,
              height: CHAT.sendHeight,
              borderRadius: CHAT.sendHeight / 2,
              border: 'none',
              padding: 0,
              background: BUBBLE_COLORS[appearance].send,
              color: '#FFFFFF',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            {/* arrow.up as drawn in the capsule (raw/composed-light.png, 3x): ink 13.67 wide (x 12.17…25.83), 15.5 tall
                (y 6…21.5), stem 2.33 and wings ≈ 2.5 thick, 45° wings meeting the stem 7 pt below the tip. */}
            <svg width={CHAT.sendWidth} height={CHAT.sendHeight} viewBox="0 0 38 28" aria-hidden style={{ display: 'block' }}>
              <path d="M19 20.3V7.4M13.05 13.05 19 7.2 24.95 13.05" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}
      </Glass>
    </div>
  );
});
