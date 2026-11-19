import { useCallback, useRef, useState } from 'react';
import type { Spec } from '@json-render/core';
import { createLiquidSpecStream } from './stream';

export interface UseLiquidSpecStream {
  spec: Spec | null;
  /** Append model output (JSONL patches or JSON). */
  push(chunk: string): void;
  /** Mark the stream finished (`streaming` false). */
  end(): void;
  reset(): void;
  streaming: boolean;
  text: string;
}

/** React state around `createLiquidSpecStream`: feed it chunks, pass `spec` and `loading={streaming}` to `<LiquidRenderer>`. */
export function useLiquidSpecStream(): UseLiquidSpecStream {
  const stream = useRef(createLiquidSpecStream());
  const [spec, setSpec] = useState<Spec | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [text, setText] = useState('');
  const push = useCallback((chunk: string) => {
    const next = stream.current.push(chunk);
    setStreaming(true);
    setText(stream.current.text);
    // New object so React sees partial updates even when the compiler mutates in place.
    setSpec(next ? { ...next, elements: { ...next.elements } } : null);
  }, []);
  const end = useCallback(() => setStreaming(false), []);
  const reset = useCallback(() => {
    stream.current.reset();
    setSpec(null);
    setText('');
    setStreaming(false);
  }, []);
  return { spec, push, end, reset, streaming, text };
}
