/**
 * Messages-style chat demo. Open `/chat.html` (`?dark`, `?fallback`, `?empty`). Type and press Enter or the send
 * button; a reply arrives after a short delay. Seeded like the native probe (uikit-internals/deep/demo-audit/chat/
 * probe/seed.txt) for pixel comparison. Exposes `window.__chat` ({ send, receive, trace }).
 */
import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { LiquidRoot } from '@liquid-gpu/react';
import { ChatScreen, type ChatMessage, type SendFrame } from '../../../../packages/react/src/chat';

const q = new URLSearchParams(location.search);
// Seeded a few minutes ago, so new messages join the same timestamp group (no new header).
const T0 = new Date(Date.now() - 5 * 60e3);

const SEED: Array<[ChatMessage['from'], string]> = [
  ['me', 'Hey! Are we still on for tomorrow?'],
  ['them', 'Yes, definitely'],
  ['them', 'What time works for you?'],
  ['me', 'How about 10?'],
  ['me', 'We could grab coffee first'],
  ['them', 'Perfect, see you then'],
  ['me', 'Hey! How are you?'],
  ['them', 'Good, you?'],
  ['me', 'Did you see the new design?'],
  ['them', 'Yes! The glass effect looks amazing. It refracts the content behind it really nicely.'],
  ['me', 'Right?'],
  ['me', 'It even bends the edges'],
  ['them', 'Ok'],
  ['me', 'See you soon'],
];

const REPLIES = ['Sounds good!', 'Haha, totally', 'Great 👍', 'On my way', 'Let me check and get back to you', 'Nice'];

let seq = 0;
const id = () => `m${++seq}`;

function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>(() =>
    q.has('empty') ? [] : SEED.map(([from, text], i) => ({ id: id(), from, text, time: new Date(T0.getTime() + i * 1000), status: from === 'me' ? 'delivered' : undefined })),
  );
  const trace = useRef<Array<{ t: number } & SendFrame>>([]);
  const replyIx = useRef(0);
  const api = useMemo(
    () => ({
      send(text: string) {
        const m: ChatMessage = { id: id(), from: 'me', text, time: new Date(), status: 'sending' };
        setMessages((l) => [...l, m]);
        // Native: "Delivered" arrives ≈ 1.0 s after the send (send2-nokb: 0.99 s).
        setTimeout(() => setMessages((l) => l.map((x) => (x.id === m.id ? { ...x, status: 'delivered' } : x))), 1000);
        if (!q.has('noreply')) setTimeout(() => api.receive(REPLIES[replyIx.current++ % REPLIES.length]!), 2600);
      },
      receive(text: string) {
        setMessages((l) => [...l, { id: id(), from: 'them', text, time: new Date() }]);
      },
      trace,
    }),
    [],
  );
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__chat = api;
    document.documentElement.dataset.ready = '1';
  }, [api]);
  return (
    <ChatScreen
      title="+1 (888) 555-1212"
      initials="JA"
      placeholder="iMessage"
      messages={messages}
      onSend={api.send}
      onSendFrame={(t, f) => trace.current.push({ t, ...f })}
    />
  );
}

function Page() {
  const safeArea = useMemo(() => ({ top: 62, bottom: 34 }), []);
  return (
    <LiquidRoot appearance={q.has('dark') ? 'dark' : 'light'} safeArea={safeArea}>
      <Chat />
    </LiquidRoot>
  );
}

export function mount(el: HTMLElement): void {
  createRoot(el).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
