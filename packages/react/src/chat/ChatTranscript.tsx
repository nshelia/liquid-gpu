/**
 * ChatTranscript: the message list on our UIScrollView physics (`ScrollView`), pinned to the bottom like
 * CKTranscriptCollectionView (short content sits above the entry bar; offset −102 in the seeded native dump).
 *
 * Updates animate like the native batch updates (geometry.ts `curves`): rows that move are translated from their old
 * window position (FLIP) — `update` for a send / "Delivered", `scroll` (sin² 0.3 s) for an incoming message — inserted
 * rows fade in on `update`, a "Delivered" that moves to a newer message fades out on `fadeOut`. A sent message flies
 * from the field into its cell (`sendFrame`) under the entry glass and replaces the cell after 0.99 s.
 */
import { forwardRef, memo, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useLiquid } from '../root/context';
import { cssVar } from '../root/theme';
import { ScrollView, type ScrollViewHandle } from '../scroll/ScrollView';
import { CHAT, TAIL_INSET, bubblePath, curves, sendFrame, SEND, type SendFrame } from './geometry';
import { MessageBubble, TEXT_SHIFT, bubbleSize, gradientCss, gradientY, measureText, paintBubbleGradients } from './MessageBubble';
import type { ChatMessage, SendOrigin } from './types';

export interface ChatTranscriptProps {
  messages: ChatMessage[];
  /** Space under the content: the entry bar (69 + field growth). */
  bottomInset: number;
  topInset?: number;
  /** Returns (and clears) the field rect of the message being sent. */
  takeSendOrigin?(): SendOrigin | null;
  /** Offset and maximum on every scroll (edge effects). */
  onScroll?(offset: number, max: number): void;
  /** Every frame of a send animation (measurement hook). */
  onSendFrame?(t: number, frame: SendFrame): void;
}

export interface ChatTranscriptHandle {
  scroll: ScrollViewHandle | null;
  scrollToBottom(animated?: boolean): void;
}

const HOUR = 3600e3;

export function formatHeader(d: Date, now = new Date()): string {
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const day = d.toDateString() === now.toDateString() ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'long' });
  return `${day} ${time}`;
}

/** Run `frame(t)` on the root Animator for `duration` seconds, then `done()`. */
function useTimelines() {
  const ctx = useLiquid();
  return useCallback(
    (duration: number, frame: (t: number) => void, done?: () => void) => {
      const item = {
        t: 0,
        settled: false,
        step(dt: number) {
          this.t += dt;
          if (this.t >= duration) this.settled = true;
        },
      };
      frame(0);
      const remove = ctx.animator.add(item, () => {
        frame(Math.min(item.t, duration));
        ctx.requestFrame();
        if (item.settled) {
          remove();
          done?.();
        }
      });
      ctx.requestFrame();
      return remove;
    },
    [ctx],
  );
}

interface Snapshot {
  tops: Map<string, number>;
  atBottom: boolean;
}

// Memoised: the screen re-renders on every keystroke and edge-effect toggle; the rows only depend on the props.
export const ChatTranscript = memo(forwardRef<ChatTranscriptHandle, ChatTranscriptProps>(function ChatTranscript(
  { messages, bottomInset, topInset = CHAT.headerInset, takeSendOrigin, onScroll, onSendFrame },
  ref,
) {
  const { appearance, viewport } = useLiquid();
  const run = useTimelines();
  /** Distance from the bottom rest offset, kept across window resizes (the transcript is bottom-anchored). */
  const fromBottom = useRef(0);
  const scrollRef = useRef<ScrollViewHandle | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rows = useRef(new Map<string, HTMLDivElement>());
  const bubbles = useRef(new Map<string, HTMLDivElement>());
  const flyRef = useRef<HTMLDivElement | null>(null);
  const flyFillRef = useRef<HTMLDivElement | null>(null);
  const [flying, setFlying] = useState<{ id: string; text: string } | null>(null);
  const [fading, setFading] = useState<Set<string>>(() => new Set());
  const [ghost, setGhost] = useState<string | null>(null);

  const statusId = [...messages].reverse().find((m) => m.from === 'me' && m.status === 'delivered')?.id ?? null;

  const maxOffset = () => {
    const el = scrollRef.current?.element;
    return el ? Math.max(0, el.scrollHeight - el.clientHeight) : 0;
  };
  const paint = () => paintBubbleGradients(rootRef.current, rootRef.current?.getBoundingClientRect().top ?? 0);
  const scrollToBottom = (animated = false) => {
    const h = scrollRef.current;
    if (!h?.element) return;
    const max = maxOffset();
    if (animated) return h.scrollTo(max, true);
    // Write the native offset: ScrollView's bounds update on its ResizeObserver (after this), and it adopts a native
    // scroll before the next frame. (A layer re-insertion for z sorting also resets scrollTop.)
    h.element.scrollTop = max;
  };

  useImperativeHandle(ref, () => ({ scroll: scrollRef.current, scrollToBottom }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Snapshot of the old layout, taken while rendering a new message list (the DOM still shows the old one).
  const prev = useRef<{ messages: ChatMessage[]; statusId: string | null; snap: Snapshot | null }>({ messages, statusId, snap: null });
  if (prev.current.messages !== messages && !prev.current.snap) {
    const tops = new Map<string, number>();
    rows.current.forEach((el, id) => tops.set(id, el.getBoundingClientRect().top));
    const el = scrollRef.current;
    prev.current.snap = { tops, atBottom: !el || el.offset >= maxOffset() - 2 };
  }

  // Initial position: the bottom.
  useLayoutEffect(() => {
    scrollToBottom(false);
    paint();
    // Layers mounted after this one re-sort the host and reset scrollTop; settle after they are in.
    let n = 0;
    let id = requestAnimationFrame(function again() {
      scrollToBottom(false);
      paint();
      if (++n < 3) id = requestAnimationFrame(again);
    });
    return () => cancelAnimationFrame(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A window resize keeps the distance from the bottom (UICollectionView keeps the anchored edge while the bounds
  // change; Messages anchors the transcript bottom). Applied in the same commit, before the ScrollView's
  // ResizeObserver clamps, so no frame shows the old offset at the new size.
  useLayoutEffect(() => {
    const h = scrollRef.current;
    if (!h?.element || h.physics.tracking) return;
    const target = Math.max(0, maxOffset() - fromBottom.current);
    if (Math.abs(target - h.offset) > 0.01) {
      h.scrollTo(target, false);
      paint();
    }
  }, [viewport.width, viewport.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the bottom pinned when the entry bar grows.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (el && el.offset >= maxOffset() - bottomInset - 2) scrollToBottom(false);
  }, [bottomInset]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const p = prev.current;
    const snap = p.snap;
    const old = p.messages;
    const oldStatus = p.statusId;
    prev.current = { messages, statusId, snap: null };
    if (!snap || old === messages) return;
    const oldIds = new Set(old.map((m) => m.id));
    const added = messages.filter((m) => !oldIds.has(m.id));
    const last = added[added.length - 1];
    const sent = last?.from === 'me' ? last : undefined;
    const origin = sent ? (takeSendOrigin?.() ?? null) : null;
    const incoming = !!last && last.from === 'them';
    if (sent || snap.atBottom) scrollToBottom(false);
    const curve = incoming ? curves.scroll : curves.update;

    // FLIP the rows that stayed.
    const moves: Array<[HTMLElement, number]> = [];
    rows.current.forEach((el, id) => {
      const before = snap.tops.get(id);
      if (before === undefined) return;
      const d = before - el.getBoundingClientRect().top;
      if (Math.abs(d) > 0.01) moves.push([el, d]);
    });
    const fresh = added
      .flatMap((m) => [m.id !== sent?.id || !origin ? rows.current.get(m.id) : undefined, rows.current.get(`h-${m.id}`)])
      .filter(Boolean) as HTMLElement[];
    const apply = (t: number) => {
      const k = curve(t);
      for (const [el, d] of moves) el.style.transform = k >= 1 ? '' : `translate3d(0, ${d * (1 - k)}px, 0)`;
      const o = curves.update(t);
      for (const el of fresh) el.style.opacity = o >= 1 ? '' : String(o);
      paint();
    };
    if (moves.length || fresh.length) run(Math.max(curve.duration, fresh.length ? curves.update.duration : 0), apply);
    else paint();

    // "Delivered" moved to a newer message: the old label fades out where it was.
    if (oldStatus && statusId !== oldStatus && messages.some((m) => m.id === oldStatus)) {
      setGhost(oldStatus);
      setTimeout(() => setGhost((g) => (g === oldStatus ? null : g)), curves.fadeOut.duration * 1000 + 50);
    }

    // The send animation.
    const target = sent && bubbles.current.get(sent.id);
    if (sent && origin && target) {
      const r = target.getBoundingClientRect();
      const rootTop = rootRef.current?.getBoundingClientRect().top ?? 0;
      const size = bubbleSize(sent.text);
      const g = {
        from: origin,
        to: { right: r.right, top: r.top - rootTop, width: size.width, height: size.height + TAIL_INSET },
      };
      setFading((s) => new Set(s).add(sent.id));
      setFlying({ id: sent.id, text: sent.text });
      const frame = (t: number) => {
        const f = sendFrame(g, t);
        const fly = flyRef.current;
        const fill = flyFillRef.current;
        if (fly && fill) {
          fly.style.width = `${f.boundsWidth}px`;
          fly.style.transform = `translate3d(${f.x}px, ${f.y}px, 0) scale(${f.scale})`;
          fill.style.width = `${f.boundsWidth}px`;
          fill.style.clipPath = `path('${bubblePath(f.boundsWidth, size.height, 'right')}')`;
          fill.style.backgroundPosition = gradientY(f.y / f.scale);
        }
        onSendFrame?.(t, f);
      };
      // The DOM node mounts with the state update; start on the next frame.
      requestAnimationFrame(() =>
        run(SEND.duration, frame, () => {
          setFlying(null);
          setFading((s) => {
            const n = new Set(s);
            n.delete(sent.id);
            return n;
          });
        }),
      );
    }
  }, [messages]); // eslint-disable-line react-hooks/exhaustive-deps

  const items: ReactNode[] = [];
  messages.forEach((m, i) => {
    const before = messages[i - 1];
    const after = messages[i + 1];
    const header = !!m.time && (!before || !before.time || m.time.getTime() - before.time.getTime() > HOUR);
    const outgoing = m.from === 'me';
    // After "Delivered" the next bubble of the same sender sits 6 below it (send2-nokb: 824.67 → 830.67).
    const afterStatus = !!before && before.id === statusId;
    const same = !!before && before.from === m.from;
    const gap = !before || header ? 0 : afterStatus ? (same ? CHAT.statusGap : CHAT.senderGap) : same ? CHAT.groupGap : CHAT.senderGap;
    if (header)
      items.push(
        <div
          key={`h-${m.id}`}
          ref={(el) => {
            if (el) rows.current.set(`h-${m.id}`, el);
            else rows.current.delete(`h-${m.id}`);
          }}
          style={{
            paddingTop: before ? CHAT.senderGap : CHAT.headerTop,
            height: CHAT.headerHeight,
            marginBottom: CHAT.headerGap,
            textAlign: 'center',
            fontSize: 11,
            fontWeight: 500,
            lineHeight: `${CHAT.headerHeight}px`,
            color: cssVar('secondaryLabel'),
            boxSizing: 'content-box',
          }}
        >
          {formatHeader(m.time!)}
        </div>,
      );
    const showStatus = m.id === statusId;
    items.push(
      <div
        key={m.id}
        data-chat-row={m.id}
        ref={(el) => {
          if (el) rows.current.set(m.id, el);
          else rows.current.delete(m.id);
        }}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          alignItems: outgoing ? 'flex-end' : 'flex-start',
          padding: `0 ${CHAT.sideMargin}px`,
          marginTop: gap,
        }}
      >
        <MessageBubble
          text={m.text}
          outgoing={outgoing}
          tail={!after || after.from !== m.from}
          appearance={appearance}
          hidden={fading.has(m.id)}
          bubbleRef={(el) => {
            if (el) bubbles.current.set(m.id, el);
            else bubbles.current.delete(m.id);
          }}
        />
        {(showStatus || m.id === ghost) && (
          <div
            className={showStatus ? undefined : 'lq-chat-status-out'}
            style={{
              marginTop: CHAT.statusGap,
              marginRight: CHAT.statusInset,
              height: CHAT.statusHeight,
              fontSize: 11,
              fontWeight: 600,
              lineHeight: `${CHAT.statusHeight}px`,
              color: cssVar('secondaryLabel'),
              ...(showStatus
                ? { animation: `lq-chat-fade-in ${curves.update.duration}s cubic-bezier(0.261, 1.024, 0.367, 0.987) both` }
                : {
                    position: 'absolute',
                    right: CHAT.sideMargin,
                    top: bubbleSize(m.text).height,
                    animation: `lq-chat-fade-out ${curves.fadeOut.duration}s ease both`,
                  }),
            }}
          >
            Delivered
          </div>
        )}
      </div>,
    );
  });

  return (
    <div ref={rootRef} style={{ position: 'absolute', inset: 0 }}>
      <style>{'@keyframes lq-chat-fade-in{from{opacity:0}to{opacity:1}}@keyframes lq-chat-fade-out{from{opacity:1}to{opacity:0}}'}</style>
      <ScrollView
        ref={scrollRef}
        ignoreBarInsets
        contentInset={{ top: topInset, bottom: CHAT.entryHeight + CHAT.bottomPad }}
        aria-label="Messages"
        style={{ position: 'absolute', inset: 0 }}
        onScroll={(o) => {
          fromBottom.current = Math.max(0, maxOffset() - o);
          paint();
          onScroll?.(o, maxOffset());
        }}
      >
        {items}
        {/* Entry growth as content (ScrollView's ResizeObserver sees content-box changes, not inset changes). */}
        <div aria-hidden style={{ height: Math.max(0, bottomInset - CHAT.entryHeight) }} />
      </ScrollView>
      {flying && (
        <div
          ref={flyRef}
          aria-hidden
          style={{ position: 'absolute', left: 0, top: 0, transformOrigin: '0 0', pointerEvents: 'none', height: bubbleSize(flying.text).height + TAIL_INSET }}
        >
          <div ref={flyFillRef} style={{ position: 'absolute', left: 0, top: 0, height: bubbleSize(flying.text).height + TAIL_INSET + 1, background: gradientCss(appearance) }} />
          <div
            style={{
              position: 'relative',
              top: TEXT_SHIFT,
              width: bubbleSize(flying.text).width,
              boxSizing: 'border-box',
              padding: `${(bubbleSize(flying.text).height - CHAT.lineHeight * measureText(flying.text).lines) / 2}px ${CHAT.textInsetX}px`,
              fontSize: 17,
              lineHeight: `${CHAT.lineHeight}px`,
              whiteSpace: 'pre-wrap',
              overflowWrap: 'break-word',
              color: '#FFFFFF',
            }}
          >
            {flying.text}
          </div>
        </div>
      )}
    </div>
  );
}));
