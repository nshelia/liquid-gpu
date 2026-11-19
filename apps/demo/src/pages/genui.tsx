/**
 * Generative UI showcase (`@liquid-gpu/json-render`): three json-render specs rendered by `<LiquidRenderer>` (a
 * Settings app, a sign-up form with checks, a dashboard), one of them streamed token by token as an LLM would emit it
 * (json-render SpecStream JSONL, or a plain JSON object), and a playground that renders pasted JSON live.
 * Open `/genui.html` (`?dark`, `?light`, `?fallback`).
 */
import { StrictMode, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  LiquidRenderer,
  createLiquidSpecStream,
  dashboardSpec,
  liquidComponentNames,
  liquidPrompt,
  parseSpec,
  settingsSpec,
  signUpSpec,
  specToPatches,
  validateLiquidSpec,
  type Spec,
} from '@liquid-gpu/json-render';

const q = new URLSearchParams(location.search);
const appearance = q.has('dark') ? 'dark' : q.has('light') ? 'light' : 'system';
const forceFallback = q.has('fallback') ? true : undefined;

const TINTS: { name: string; value: string | undefined }[] = [
  { name: 'Default', value: undefined },
  { name: 'Purple', value: '#AF52DE' },
  { name: 'Orange', value: '#FF9500' },
  { name: 'Green', value: '#34C759' },
  { name: 'Pink', value: '#FF2D55' },
];

const EXAMPLES: Record<string, { title: string; spec: Spec; prompt: string; height?: number }> = {
  settings: { title: 'Settings', spec: settingsSpec, prompt: 'Make me an iOS Settings screen with Wi-Fi and notifications.', height: 640 },
  signUp: { title: 'Sign-up form', spec: signUpSpec, prompt: 'A sign-up form with email + password validation.' },
  dashboard: { title: 'Dashboard', spec: dashboardSpec, prompt: 'Show this week’s store metrics with charts.' },
};
type ExampleKey = keyof typeof EXAMPLES;

// ---------------------------------------------------------------------------------------------------------------------
// Page chrome (plain DOM: the Liquid UI lives in the inline roots LiquidRenderer creates)
// ---------------------------------------------------------------------------------------------------------------------

const css = `
:root { color-scheme: light dark; --bg: #f2f2f7; --card: #fff; --ink: #000; --dim: rgba(60,60,67,.6); --hair: rgba(60,60,67,.18); --bubble: #e9e9eb; --me: #0a84ff; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #000; --card: #1c1c1e; --ink: #fff; --dim: rgba(235,235,245,.6); --hair: rgba(84,84,88,.5); --bubble: #262628; } }
:root[data-theme="dark"] { --bg: #000; --card: #1c1c1e; --ink: #fff; --dim: rgba(235,235,245,.6); --hair: rgba(84,84,88,.5); --bubble: #262628; }
html, body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.4 -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; }
.g-wrap { max-width: 1180px; margin: 0 auto; padding: 32px 16px 80px; }
.g-h1 { font-size: 34px; font-weight: 700; margin: 0 0 4px; letter-spacing: -.4px; }
.g-sub { color: var(--dim); margin: 0 0 20px; max-width: 760px; }
.g-h2 { font-size: 13px; text-transform: uppercase; color: var(--dim); font-weight: 400; margin: 36px 4px 10px; letter-spacing: .2px; }
.g-row { display: flex; gap: 16px; flex-wrap: wrap; align-items: flex-start; }
.g-col { flex: 1 1 340px; min-width: 0; }
.g-card { background: var(--card); border-radius: 22px; padding: 14px; box-shadow: 0 1px 0 var(--hair); }
.g-bubble-me { align-self: flex-end; background: var(--me); color: #fff; padding: 8px 14px; border-radius: 18px; max-width: 80%; margin: 0 0 8px auto; width: fit-content; }
.g-bubble-ai { background: var(--bubble); border-radius: 22px; padding: 6px; overflow: hidden; }
.g-btn { font: inherit; border: 0; border-radius: 999px; padding: 7px 14px; background: var(--bubble); color: var(--ink); cursor: pointer; }
.g-btn[aria-pressed="true"] { background: var(--me); color: #fff; }
.g-btn:focus-visible { outline: 2px solid var(--me); outline-offset: 2px; }
.g-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 12px; }
.g-raw { font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; white-space: pre-wrap; word-break: break-all; background: var(--card); border-radius: 16px; padding: 12px; height: 420px; overflow: auto; margin: 0; color: var(--dim); }
.g-raw b { color: var(--ink); font-weight: 400; }
.g-ta { width: 100%; box-sizing: border-box; height: 440px; font: 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; border-radius: 16px; border: 1px solid var(--hair); background: var(--card); color: var(--ink); padding: 12px; resize: vertical; }
.g-issues { margin: 8px 0 0; padding: 0 0 0 18px; color: var(--dim); font-size: 13px; }
.g-issues .err { color: #ff3b30; }
.g-log { font: 12px ui-monospace, Menlo, monospace; color: var(--dim); min-height: 18px; margin-top: 8px; }
.g-meter { height: 3px; background: var(--hair); border-radius: 2px; overflow: hidden; margin: 6px 0 10px; }
.g-meter > div { height: 100%; background: var(--me); transition: width .1s linear; }
.g-prompt { font: 11px/1.45 ui-monospace, Menlo, monospace; white-space: pre-wrap; max-height: 320px; overflow: auto; background: var(--card); border-radius: 16px; padding: 12px; color: var(--dim); }
`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="g-h2">{title}</h2>
      {children}
    </section>
  );
}

function useActionLog() {
  const [log, setLog] = useState<string>('');
  const onAction = useCallback((name: string, params: Record<string, unknown>) => {
    setLog(`${new Date().toLocaleTimeString()}  ${name}(${JSON.stringify(params)})`);
  }, []);
  return { log, onAction };
}

interface RenderProps {
  spec: Spec | null;
  loading?: boolean;
  tint: string | undefined;
  height?: number | undefined;
  onAction: (name: string, params: Record<string, unknown>) => void;
}

function Rendered({ spec, loading, tint, height, onAction }: RenderProps) {
  const theme = useMemo(() => (tint ? { tint } : undefined), [tint]);
  return (
    <LiquidRenderer
      spec={spec}
      loading={!!loading}
      onAction={onAction}
      appearance={appearance}
      {...(forceFallback ? { fallback: true } : {})}
      {...(theme ? { theme } : {})}
      {...(height ? { root: { mode: 'inline', autoHeight: false, style: { height, borderRadius: 18, overflow: 'hidden' } } } : {})}
    />
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 1. Examples
// ---------------------------------------------------------------------------------------------------------------------

function ExampleCard({ k, tint }: { k: ExampleKey; tint: string | undefined }) {
  const ex = EXAMPLES[k]!;
  const { log, onAction } = useActionLog();
  return (
    <div className="g-col">
      <div className="g-bubble-me">{ex.prompt}</div>
      <div className="g-bubble-ai">
        <Rendered spec={ex.spec} tint={tint} height={ex.height} onAction={onAction} />
      </div>
      <div className="g-log" aria-live="polite">
        {log || `${Object.keys(ex.spec.elements).length} elements · actions appear here`}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 2. Streaming: an LLM-like token stream with a timer
// ---------------------------------------------------------------------------------------------------------------------

/** Split text into token-sized chunks (2–9 chars, breaking after punctuation like a BPE tokenizer roughly would). */
function tokenize(text: string): string[] {
  const out: string[] = [];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < text.length; ) {
    let n = 2 + Math.floor(rnd() * 8);
    const p = text.slice(i, i + n).search(/[",:{}[\]\n]/);
    if (p > 0) n = p + 1;
    out.push(text.slice(i, i + n));
    i += n;
  }
  return out;
}

function StreamDemo({ tint }: { tint: string | undefined }) {
  const [which, setWhich] = useState<ExampleKey>('dashboard');
  const [format, setFormat] = useState<'jsonl' | 'json'>('jsonl');
  const [speed, setSpeed] = useState(2);
  const [spec, setSpec] = useState<Spec | null>(null);
  const [text, setText] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [progress, setProgress] = useState(0);
  const [run, setRun] = useState(0);
  const { log, onAction } = useActionLog();
  const rawRef = useRef<HTMLPreElement>(null);

  const source = useMemo(() => {
    const s = EXAMPLES[which]!.spec;
    return format === 'jsonl' ? specToPatches(s) : JSON.stringify(s, null, 1);
  }, [which, format]);

  useEffect(() => {
    const tokens = tokenize(source);
    const stream = createLiquidSpecStream();
    setSpec(null);
    setText('');
    setStreaming(true);
    setProgress(0);
    let i = 0;
    const perTick = speed;
    const id = window.setInterval(() => {
      let chunk = '';
      for (let k = 0; k < perTick && i < tokens.length; k++) chunk += tokens[i++];
      const next = stream.push(chunk);
      setText(stream.text);
      setProgress(i / tokens.length);
      if (next) setSpec({ ...next, elements: { ...next.elements } });
      if (i >= tokens.length) {
        window.clearInterval(id);
        setStreaming(false);
      }
    }, 30);
    return () => window.clearInterval(id);
  }, [source, speed, run]);

  useEffect(() => {
    const el = rawRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);

  return (
    <>
      <div className="g-tools" role="toolbar" aria-label="Stream options">
        {(Object.keys(EXAMPLES) as ExampleKey[]).map((k) => (
          <button key={k} className="g-btn" aria-pressed={which === k} onClick={() => setWhich(k)}>
            {EXAMPLES[k]!.title}
          </button>
        ))}
        <span style={{ width: 12 }} />
        <button className="g-btn" aria-pressed={format === 'jsonl'} onClick={() => setFormat('jsonl')} title="json-render SpecStream: one JSON Patch per line">
          JSONL patches
        </button>
        <button className="g-btn" aria-pressed={format === 'json'} onClick={() => setFormat('json')} title="One JSON object, parsed partially as it arrives">
          Plain JSON
        </button>
        <span style={{ width: 12 }} />
        {[1, 2, 6].map((s) => (
          <button key={s} className="g-btn" aria-pressed={speed === s} onClick={() => setSpeed(s)}>
            {s}×
          </button>
        ))}
        <button className="g-btn" onClick={() => setRun((r) => r + 1)}>
          ↻ Replay
        </button>
      </div>
      <div className="g-row">
        <div className="g-col">
          <div className="g-bubble-me">{EXAMPLES[which]!.prompt}</div>
          <div className="g-meter" aria-hidden>
            <div style={{ width: `${progress * 100}%` }} />
          </div>
          <div className="g-bubble-ai">
            <Rendered spec={spec} loading={streaming} tint={tint} height={EXAMPLES[which]!.height} onAction={onAction} />
          </div>
          <div className="g-log">{streaming ? `streaming… ${spec ? Object.keys(spec.elements).length : 0} elements` : log || 'done'}</div>
        </div>
        <div className="g-col">
          <pre className="g-raw" ref={rawRef} aria-label="Raw model output">
            {text}
            {streaming ? <b>▍</b> : null}
          </pre>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// 3. Playground
// ---------------------------------------------------------------------------------------------------------------------

function Playground({ tint }: { tint: string | undefined }) {
  const [src, setSrc] = useState(() => JSON.stringify(signUpSpec, null, 2));
  const { log, onAction } = useActionLog();
  const [showPrompt, setShowPrompt] = useState(false);
  const spec = useMemo(() => parseSpec(src), [src]);
  const issues = useMemo(() => (spec ? validateLiquidSpec(spec).issues : []), [spec]);
  const prompt = useMemo(() => (showPrompt ? liquidPrompt() : ''), [showPrompt]);
  const hasNav = !!spec && Object.values(spec.elements).some((e) => e.type === 'NavigationStack' || e.type === 'TabView');

  return (
    <>
      <div className="g-tools">
        {(Object.keys(EXAMPLES) as ExampleKey[]).map((k) => (
          <button key={k} className="g-btn" onClick={() => setSrc(JSON.stringify(EXAMPLES[k]!.spec, null, 2))}>
            Load {EXAMPLES[k]!.title}
          </button>
        ))}
        <button className="g-btn" onClick={() => setSrc(specToPatches(dashboardSpec))}>
          Load as JSONL
        </button>
        <button className="g-btn" aria-pressed={showPrompt} onClick={() => setShowPrompt((v) => !v)}>
          {showPrompt ? 'Hide' : 'Show'} system prompt
        </button>
      </div>
      {showPrompt ? (
        <div style={{ marginBottom: 12 }}>
          <div className="g-log">
            liquidPrompt(): {prompt.length.toLocaleString()} characters · {liquidComponentNames.length} components{' '}
            <button className="g-btn" onClick={() => void navigator.clipboard?.writeText(prompt)}>
              Copy
            </button>
          </div>
          <pre className="g-prompt">{prompt}</pre>
        </div>
      ) : null}
      <div className="g-row">
        <div className="g-col">
          <textarea className="g-ta" value={src} onChange={(e) => setSrc(e.target.value)} spellCheck={false} aria-label="Spec JSON" />
          <ul className="g-issues" aria-label="Validation">
            {!spec ? <li className="err">Not a spec yet (paste a json-render spec, nested spec, or JSONL patches).</li> : null}
            {spec && issues.length === 0 ? <li>Valid against the Liquid catalog.</li> : null}
            {issues.slice(0, 8).map((i, n) => (
              <li key={n} className={i.severity === 'error' ? 'err' : undefined}>
                {i.element}
                {i.path ? ` ${i.path}` : ''}: {i.message}
              </li>
            ))}
          </ul>
        </div>
        <div className="g-col">
          <div className="g-bubble-ai">
            <Rendered spec={spec} tint={tint} height={hasNav ? 640 : undefined} onAction={onAction} />
          </div>
          <div className="g-log">{log}</div>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------

function Page() {
  const [tint, setTint] = useState<string | undefined>(undefined);
  useEffect(() => {
    if (appearance !== 'system') document.documentElement.dataset.theme = appearance;
  }, []);
  const chip = (t: (typeof TINTS)[number]): CSSProperties => ({ background: t.value ?? 'var(--bubble)', color: t.value ? '#fff' : 'var(--ink)' });
  return (
    <div className="g-wrap">
      <style>{css}</style>
      <h1 className="g-h1">Generative UI</h1>
      <p className="g-sub">
        <code>@liquid-gpu/json-render</code>: a json-render catalog of {liquidComponentNames.length} iOS 27 components. A model streams a spec, <code>&lt;LiquidRenderer&gt;</code>{' '}
        renders it progressively in an inline Liquid Glass root that sizes to its content, like a chat message.
      </p>
      <div className="g-tools" aria-label="Theme tint">
        <span style={{ color: 'var(--dim)' }}>Theme tint</span>
        {TINTS.map((t) => (
          <button key={t.name} className="g-btn" aria-pressed={tint === t.value} style={tint === t.value ? undefined : chip(t)} onClick={() => setTint(t.value)}>
            {t.name}
          </button>
        ))}
      </div>

      <Section title="Three specs">
        <div className="g-row">
          {(Object.keys(EXAMPLES) as ExampleKey[]).map((k) => (
            <ExampleCard key={k} k={k} tint={tint} />
          ))}
        </div>
      </Section>

      <Section title="Streaming, token by token">
        <StreamDemo tint={tint} />
      </Section>

      <Section title="Playground: paste a spec">
        <Playground tint={tint} />
      </Section>
    </div>
  );
}

export function mount(el: HTMLElement): void {
  createRoot(el).render(
    <StrictMode>
      <Page />
    </StrictMode>,
  );
}
