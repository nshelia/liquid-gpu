/**
 * ChatScreen: a Messages-style conversation (iOS 27 layout, measured in uikit-internals/deep/demo-audit/chat).
 *
 * Header (no bar background; the scroll edge effect 197.33 tall separates it): 44 pt glass back button at (20, 62),
 * 60 pt avatar centred at y 62, a glass title capsule 32.33 tall at y 117 (r 16.17; Bold 17 title 13 pt in, 4 pt
 * gap, 8.33 × 14.67 chevron, 9 pt right) under the avatar. Transcript inset 157.33 / 69, entry bar at the bottom.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Layer } from '@liquid-gpu/gpu';
import { LayerView } from '../root/Layer';
import { Glass } from '../root/Glass';
import { useLiquid } from '../root/context';
import { cssVar, fontStack } from '../root/theme';
import { AVATAR_GRADIENT, CHAT } from './geometry';
import { ChatInputBar, fieldHeight } from './ChatInputBar';
import { ChatTranscript, type ChatTranscriptProps } from './ChatTranscript';
import type { ChatMessage, SendOrigin } from './types';

export interface ChatScreenProps {
  title: string;
  /** Avatar monogram (e.g. "JA"). */
  initials: string;
  messages: ChatMessage[];
  /** A message was sent: append it to `messages` (the flying bubble starts from the field). */
  onSend(text: string): void;
  onBack?(): void;
  onTitlePress?(): void;
  placeholder?: string;
  /** Measurement hook, see ChatTranscript. */
  onSendFrame?: ChatTranscriptProps['onSendFrame'];
}

/** The avatar layer is padded so its shadow is not clipped. */
const AVATAR_PAD = 12;
const AVATAR_SHADOW = { light: '0 4px 6px -2px rgba(0,0,0,0.24)', dark: '0 4px 6px -2px rgba(0,0,0,0.4)' } as const;

/** Top scroll edge effect (as NavBar's: blur + background wash, opacity 1 once content is underneath). */
function EdgeEffect({ top, height, edge, flip, visible }: { top: number; height: number; edge: number; flip?: boolean; visible: boolean }) {
  const dir = flip ? 'to top' : 'to bottom';
  const mask = `linear-gradient(${dir}, #000 0, #000 ${edge - 8}px, rgba(0,0,0,0.6) ${edge + 8}px, rgba(0,0,0,0) ${height}px)`;
  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: flip ? undefined : top,
        bottom: flip ? 0 : undefined,
        height,
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 0.514s cubic-bezier(0.25, 0.8, 0.3, 1)',
        backdropFilter: 'blur(4px) saturate(1.25) brightness(1.03)',
        WebkitBackdropFilter: 'blur(4px) saturate(1.25) brightness(1.03)',
        background: `linear-gradient(${dir}, var(--lq-system-background) 0, color-mix(in srgb, var(--lq-system-background) 85%, transparent) ${edge - 12}px, color-mix(in srgb, var(--lq-system-background) 40%, transparent) ${edge}px, transparent ${height}px)`,
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    />
  );
}

export function ChatScreen({ title, initials, messages, onSend, onBack, onTitlePress, placeholder, onSendFrame }: ChatScreenProps) {
  const { appearance, viewport, safeArea, requestFrame } = useLiquid();
  const [draft, setDraft] = useState('');
  const [fieldH, setFieldH] = useState(fieldHeight(1));
  const [edges, setEdges] = useState({ top: false, bottom: false });
  const origin = useRef<SendOrigin | null>(null);
  const takeSendOrigin = useCallback(() => {
    const o = origin.current;
    origin.current = null;
    return o;
  }, []);
  const barTop = safeArea.top;
  const headerBottom = barTop + CHAT.headerInset - 62;
  const bottomInset = CHAT.entryHeight + fieldH - CHAT.fieldHeight;
  const onScroll = useCallback((o: number, max: number) => {
    const top = o > 0.5;
    const bottom = o < max - 0.5;
    setEdges((e) => (e.top === top && e.bottom === bottom ? e : { top, bottom }));
  }, []);
  // The avatar is its own layer (it sits over the title glass); LayerView applies x/y only at registration, so
  // follow viewport and safe-area changes here, or a resize leaves it at the old centre.
  const [avatar, setAvatar] = useState<Layer | null>(null);
  useLayoutEffect(() => {
    if (!avatar) return;
    avatar.transform = new DOMMatrix().translate((viewport.width - 60) / 2 - AVATAR_PAD, barTop - AVATAR_PAD);
    requestFrame();
  }, [avatar, viewport.width, barTop, requestFrame]);
  const css = useMemo(() => `.lq-chat-input::placeholder{color:var(--lq-placeholder-text);opacity:1}`, []);

  return (
    <div
      className="lq-chat"
      style={{ position: 'absolute', left: 0, top: 0, width: viewport.width, height: viewport.height, overflow: 'hidden', background: cssVar('systemBackground'), color: cssVar('label'), fontFamily: fontStack }}
    >
      <style>{css}</style>
      <ChatTranscript
        messages={messages}
        bottomInset={bottomInset}
        topInset={headerBottom}
        takeSendOrigin={takeSendOrigin}
        onScroll={onScroll}
        onSendFrame={onSendFrame}
      />
      {/* Native: blurred and washed over the bar row (to safe + 54), nothing left by y 136 (seeded-light.png). */}
      <EdgeEffect top={0} height={barTop + 74} edge={barTop + 54} visible={edges.top} />
      <EdgeEffect top={0} height={bottomInset + 40} edge={bottomInset} flip visible={edges.bottom} />

      {/* Header. */}
      <Glass
        as="button"
        interactive
        aria-label="Back"
        onClick={onBack}
        boxStyle={{ position: 'absolute', left: CHAT.sideMargin, top: barTop }}
        contentStyle={{ width: 44, height: 44, color: cssVar('label'), display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        {/* chevron.backward in the 44 pt button (seeded-light.png, 3x): ink x 35…46, y 75…93.67, stroke ≈ 2.75. */}
        <svg width={44} height={44} viewBox="0 0 44 44" fill="none" stroke="currentColor" strokeWidth={2.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ display: 'block' }}>
          <path d="M24.55 14.45 16.45 22.33l8.1 7.89" />
        </svg>
      </Glass>
      <div style={{ position: 'absolute', left: 0, right: 0, top: barTop + 55, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
        <Glass
          as="button"
          interactive
          radius={16.167}
          onClick={onTitlePress}
          aria-label={`${title}, details`}
          contentStyle={{
            height: 32.333,
            boxSizing: 'border-box',
            padding: '0 9px 0 13px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            border: 'none',
            background: 'transparent',
            color: cssVar('label'),
            fontFamily: fontStack,
            fontSize: 17,
            fontWeight: 700,
            lineHeight: '20.333px',
            whiteSpace: 'nowrap',
          }}
        >
          <span>{title}</span>
          <svg width="8.333" height="14.667" viewBox="0 0 8.333 14.667" aria-hidden style={{ color: cssVar('tertiaryLabel') }}>
            <path d="M1.6 1.6 6.733 7.333 1.6 13.067" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Glass>
      </div>
      <LayerView
        ref={setAvatar}
        z={3}
        x={(viewport.width - 60) / 2 - AVATAR_PAD}
        y={barTop - AVATAR_PAD}
        width={60 + 2 * AVATAR_PAD}
        height={60 + 2 * AVATAR_PAD}
        aria-hidden
        style={{ pointerEvents: 'none' }}
      >
        <div
          style={{
            margin: AVATAR_PAD,
            width: 60,
            height: 60,
            borderRadius: 30,
            background: AVATAR_GRADIENT[appearance],
            // Native casts a soft shadow down onto the title glass (seeded-light.png: luma 249 → 210 just under the
            // circle, back to 238 5 pt lower; ≤ 2 levels at the sides, none above).
            boxShadow: AVATAR_SHADOW[appearance],
            color: '#FFFFFF',
            fontFamily: fontStack,
            fontSize: 27,
            fontWeight: 700,
            lineHeight: '60px',
            textAlign: 'center',
            letterSpacing: 0.2,
          }}
        >
          {initials}
        </div>
      </LayerView>

      <ChatInputBar
        value={draft}
        onChange={setDraft}
        placeholder={placeholder}
        appearance={appearance}
        onHeight={setFieldH}
        onSend={(text, o) => {
          origin.current = o;
          setDraft('');
          onSend(text);
        }}
      />
    </div>
  );
}
