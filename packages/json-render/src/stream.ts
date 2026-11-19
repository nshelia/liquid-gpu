/**
 * Streaming specs. A model either emits json-render's SpecStream (JSONL RFC 6902 patches, what `catalog.prompt()`
 * asks for) or a plain JSON spec object. `createLiquidSpecStream()` accepts text chunks in either format and returns
 * the best spec so far; `parsePartialJson()` turns a truncated JSON document into the value parsed up to the cut.
 */
import { createSpecStreamCompiler, type Spec, type UIElement } from '@json-render/core';

// ---------------------------------------------------------------------------------------------------------------------
// Partial JSON
// ---------------------------------------------------------------------------------------------------------------------

export interface PartialJsonOptions {
  /**
   * Object keys whose value is dropped while its string is still open (a half-streamed `"type": "Tex"` would
   * otherwise render as the wrong component). Default: `type`, `root`, and the `$`-expression keys.
   */
  atomicKeys?: ReadonlySet<string>;
}

const DEFAULT_ATOMIC = new Set(['type', 'root', 'action', 'statePath', 'openPath', '$state', '$bindState', '$bindItem', '$item', '$template', '$computed', 'event', 'value']);

const MISSING = Symbol('missing');
type Parsed = { v: unknown; done: boolean } | typeof MISSING;

/**
 * Parse a JSON document that may be cut off anywhere. Returns `undefined` when nothing usable has arrived. Complete
 * values are exact; an open object / array holds the members parsed so far; an open string holds its prefix (unless
 * its key is atomic); a dangling key, `:`, or partial literal is dropped. Leading prose or a ```json fence is skipped.
 */
export function parsePartialJson(text: string, options: PartialJsonOptions = {}): unknown {
  const atomic = options.atomicKeys ?? DEFAULT_ATOMIC;
  const start = text.search(/[{[]/);
  if (start < 0) return undefined;
  const s = text;
  let i = start;

  const ws = () => {
    while (i < s.length && (s[i] === ' ' || s[i] === '\n' || s[i] === '\r' || s[i] === '\t')) i++;
  };

  const str = (): Parsed => {
    // s[i] === '"'
    i++;
    let out = '';
    while (i < s.length) {
      const c = s[i]!;
      if (c === '"') {
        i++;
        return { v: out, done: true };
      }
      if (c === '\\') {
        if (i + 1 >= s.length) {
          i = s.length;
          return { v: out, done: false };
        }
        const e = s[i + 1]!;
        if (e === 'u') {
          const hex = s.slice(i + 2, i + 6);
          if (hex.length < 4 || !/^[0-9a-fA-F]{4}$/.test(hex)) {
            i = s.length;
            return { v: out, done: false };
          }
          out += String.fromCharCode(parseInt(hex, 16));
          i += 6;
          continue;
        }
        const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', '"': '"', '\\': '\\', '/': '/' };
        out += map[e] ?? e;
        i += 2;
        continue;
      }
      out += c;
      i++;
    }
    return { v: out, done: false };
  };

  const value = (): Parsed => {
    ws();
    if (i >= s.length) return MISSING;
    const c = s[i]!;
    if (c === '{') return obj();
    if (c === '[') return arr();
    if (c === '"') return str();
    const lit = /^(?:true|false|null|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(s.slice(i, i + 64));
    if (lit) {
      const tok = lit[0];
      const end = i + tok.length;
      // A number touching the end of the text may still be growing; keep it (it is a valid prefix value).
      i = end;
      return { v: JSON.parse(tok), done: end < s.length || !/\d$/.test(tok) };
    }
    // Partial literal (`tr`, `-`, `1.`) or garbage: stop here.
    i = s.length;
    return MISSING;
  };

  const obj = (): Parsed => {
    i++; // {
    const out: Record<string, unknown> = {};
    for (;;) {
      ws();
      if (i >= s.length) return { v: out, done: false };
      if (s[i] === '}') {
        i++;
        return { v: out, done: true };
      }
      if (s[i] === ',') {
        i++;
        continue;
      }
      if (s[i] !== '"') {
        i = s.length;
        return { v: out, done: false };
      }
      const k = str();
      if (k === MISSING || !k.done) return { v: out, done: false };
      ws();
      if (i >= s.length || s[i] !== ':') return { v: out, done: false };
      i++;
      const v = value();
      if (v === MISSING) return { v: out, done: false };
      const key = k.v as string;
      if (v.done || !(typeof v.v === 'string' && atomic.has(key))) out[key] = v.v;
      if (!v.done) return { v: out, done: false };
    }
  };

  const arr = (): Parsed => {
    i++; // [
    const out: unknown[] = [];
    for (;;) {
      ws();
      if (i >= s.length) return { v: out, done: false };
      if (s[i] === ']') {
        i++;
        return { v: out, done: true };
      }
      if (s[i] === ',') {
        i++;
        continue;
      }
      const v = value();
      if (v === MISSING) return { v: out, done: false };
      out.push(v.v);
      if (!v.done) return { v: out, done: false };
    }
  };

  const r = value();
  return r === MISSING ? undefined : r.v;
}

// ---------------------------------------------------------------------------------------------------------------------
// Spec sanitising
// ---------------------------------------------------------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/**
 * Coerce a (possibly partial) object into a renderable `Spec`, or null. Elements without a string `type` are
 * dropped; `props` defaults to `{}`, `children` keeps only string ids. Accepts json-render's nested form
 * (`{ type, props, children: [{…}] }`) too.
 */
export function toSpec(value: unknown): Spec | null {
  if (!isObj(value)) return null;
  if (typeof value.type === 'string' && !('elements' in value)) return nestedToSpec(value);
  if (!isObj(value.elements)) return typeof value.root === 'string' ? { root: value.root, elements: {} } : null;
  const elements: Record<string, UIElement> = {};
  for (const [key, el] of Object.entries(value.elements)) {
    if (!isObj(el) || typeof el.type !== 'string' || !el.type) continue;
    const out: UIElement = { ...(el as unknown as UIElement), type: el.type, props: isObj(el.props) ? el.props : {} };
    out.children = Array.isArray(el.children) ? el.children.filter((c): c is string => typeof c === 'string') : [];
    if (el.slots !== undefined) {
      if (isObj(el.slots)) {
        out.slots = Object.fromEntries(
          Object.entries(el.slots).map(([n, ids]) => [n, Array.isArray(ids) ? ids.filter((c): c is string => typeof c === 'string') : []]),
        );
      } else delete out.slots;
    }
    elements[key] = out;
  }
  const root = typeof value.root === 'string' ? value.root : Object.keys(elements)[0];
  if (!root) return null;
  const spec: Spec = { root, elements };
  if (isObj(value.state)) spec.state = value.state;
  return spec;
}

function nestedToSpec(node: Record<string, unknown>): Spec {
  const elements: Record<string, UIElement> = {};
  let n = 0;
  const walk = (v: Record<string, unknown>): string => {
    const key = typeof v.key === 'string' ? v.key : typeof v.id === 'string' && !isObj(v.props) ? v.id : `el-${n++}`;
    const kids = Array.isArray(v.children) ? v.children.filter(isObj).filter((c) => typeof c.type === 'string') : [];
    const { children: _c, key: _k, state: _s, ...rest } = v;
    elements[key] = { ...(rest as unknown as UIElement), type: String(v.type), props: isObj(v.props) ? v.props : {}, children: kids.map(walk) };
    return key;
  };
  const root = walk(node);
  const spec: Spec = { root, elements };
  if (isObj(node.state)) spec.state = node.state;
  return spec;
}

/** Parse a complete or partial spec text (JSON object, nested JSON, or JSONL patches). */
export function parseSpec(text: string): Spec | null {
  const stream = createLiquidSpecStream();
  stream.push(text);
  return stream.getSpec();
}

// ---------------------------------------------------------------------------------------------------------------------
// Stream
// ---------------------------------------------------------------------------------------------------------------------

export interface LiquidSpecStream {
  /** Append a chunk; returns the current spec (null until something renderable arrived). */
  push(chunk: string): Spec | null;
  getSpec(): Spec | null;
  /** `jsonl` (patch lines), `json` (one object), or `unknown` until the first `{` arrives. */
  readonly format: 'jsonl' | 'json' | 'unknown';
  /** All text pushed so far. */
  readonly text: string;
  reset(): void;
}

/** Incremental spec builder for LLM output in either SpecStream (JSONL patches) or plain JSON form. */
export function createLiquidSpecStream(): LiquidSpecStream {
  let text = '';
  let fed = 0;
  let format: 'jsonl' | 'json' | 'unknown' = 'unknown';
  let compiler = createSpecStreamCompiler<Record<string, unknown>>();
  let spec: Spec | null = null;

  /** The first key of the first object decides: `"op"` → patch lines, anything else → one JSON spec. */
  const detect = () => {
    const at = text.search(/\{/);
    if (at < 0) return;
    const m = /^\{\s*(?:"((?:[^"\\]|\\.)*)"|([^\s"]))?/.exec(text.slice(at));
    if (!m) return;
    if (m[1] !== undefined) format = m[1] === 'op' ? 'jsonl' : 'json';
    else if (m[2] !== undefined) format = 'json';
  };

  return {
    push(chunk: string) {
      text += chunk;
      if (format === 'unknown') detect();
      if (format === 'jsonl') {
        // Use push()'s result: getResult() would flush (and lose) a half-received line.
        const r = compiler.push(text.slice(fed)).result;
        fed = text.length;
        spec = typeof r.root === 'string' && r.root ? toSpec(r) : null;
      } else if (format === 'json') {
        spec = toSpec(parsePartialJson(text));
      }
      return spec;
    },
    getSpec: () => spec,
    get format() {
      return format;
    },
    get text() {
      return text;
    },
    reset() {
      text = '';
      fed = 0;
      format = 'unknown';
      spec = null;
      compiler = createSpecStreamCompiler<Record<string, unknown>>();
    },
  };
}
