/**
 * `TextEditor` (multi-line text, shadcn Textarea): a real `<textarea>` styled after UITextView / SwiftUI TextEditor.
 *
 * TO = components/text_overlays.md, SC = deep/swiftui-components/spec.md.
 * - `plain`: UITextView chrome. textContainerInset {8, 0, 8, 0} and lineFragmentPadding 5 (TO §3) → padding 8 / 5;
 *   background systemBackground (TO §3; SC §5 TextEditor). Text labelColor.
 * - `roundedRect`: the TextField roundedRect chrome (TO §2.2: fill #FFF / #000, 1 px border #000@0.20 / #FFF@0.20,
 *   disabled #FAFAFA / #050505 SC §5) with the multi-line radius 4 (SC §5 TextField `axis: .vertical` bordered "r 4");
 *   text inset 7 horizontally (TO §2.1). TODO(unknown): vertical inset of the bordered multi-line field; 8 is used
 *   (the UITextView textContainerInset).
 * - Font body 17 (SC §5 `.SFUI-Regular` 17). Line height: the body token 20.287 (theme `--lq-body-line`).
 *   TODO(unknown): TextKit 2 selection rects in a UITextView are 23.667 tall for body (TO §4.2); the line advance
 *   itself was not extracted.
 * - Caret: the fixed insertion-point colour #426BF2 with the default tint, otherwise the tint (TO §4.1).
 * - Selection: #0054A6@0.20 light / @0.35 dark regardless of tint (TO §4.2).
 * - Placeholder: placeholderText (TO §2.3), SwiftUI `TextField(axis: .vertical)` prompt style.
 * - Auto-grow between `minLines` and `maxLines`, then scrolls.
 * - Counter: TODO(unknown) — no iOS counterpart; caption1 secondaryLabel under the trailing edge.
 */
import { forwardRef, useCallback, useLayoutEffect, useRef, type CSSProperties, type TextareaHTMLAttributes } from 'react';
import { cssVar, useLiquid } from '../root';
import { useControllable } from '../controls/internal';
import { injectFieldCss } from '../controls/TextField';
import { editorHeight, formatCount } from './logic';

type TextareaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'defaultValue' | 'onChange' | 'style' | 'rows'>;

export interface TextEditorProps extends TextareaProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** `plain` (UITextView, default) or `roundedRect` (TextField bordered chrome). */
  variant?: 'plain' | 'roundedRect';
  placeholder?: string;
  /** Minimum visible lines. Default 3. */
  minLines?: number;
  /** Lines before the editor scrolls instead of growing. Default 8; `null` grows without bound. */
  maxLines?: number | null;
  disabled?: boolean;
  /** Show "n/maxLength" (or "n") under the editor. */
  showCount?: boolean;
  maxLength?: number;
  /** Caret colour (CSS). Default: the UIKit insertion-point colour #426BF2 (TO §4.1). */
  tint?: string;
  width?: number | string;
  style?: CSSProperties;
  textareaStyle?: CSSProperties;
}

const FONT_SIZE = 17; // SC §5 / TO §2.3 `.SFUI-Regular` 17
const LINE = 20.287; // core typography body lineHeight (TODO(unknown) see module doc)
const DEFAULT_CARET = '#426BF2'; // TO §4.1 fixed insertion-point colour with the default tint
const PLAIN_PAD = { v: 8, h: 5 }; // TO §3 textContainerInset {8,0,8,0}, lineFragmentPadding 5
const RR_PAD = { v: 8, h: 7 }; // TO §2.1 text inset 7; vertical TODO(unknown)
const RR_RADIUS = 4; // SC §5 vertical bordered TextField r 4

export const TextEditor = forwardRef<HTMLTextAreaElement, TextEditorProps>(function TextEditor(
  {
    value,
    defaultValue,
    onChange,
    variant = 'plain',
    minLines = 3,
    maxLines = 8,
    disabled,
    showCount,
    maxLength,
    tint,
    width = '100%',
    style,
    textareaStyle,
    ...rest
  },
  ref,
) {
  const ctx = useLiquid();
  injectFieldCss();
  injectEditorCss();
  const [v, setV] = useControllable(value, defaultValue ?? '', onChange);
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      inner.current = el;
      if (typeof ref === 'function') ref(el);
      else if (ref) ref.current = el;
    },
    [ref],
  );
  const rr = variant === 'roundedRect';
  const dark = ctx.appearance === 'dark';
  const pad = rr ? RR_PAD : PLAIN_PAD;

  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${editorHeight(el.scrollHeight, LINE, pad.v * 2, minLines, maxLines ?? undefined)}px`;
  }, [v, minLines, maxLines, pad.v, width]);

  const fill = rr ? (disabled ? (dark ? '#050505' : '#FAFAFA') : dark ? '#000000' : '#FFFFFF') : cssVar('systemBackground');
  const border = rr
    ? `inset 0 0 0 calc(1px / var(--lq-dpr, 1)) ${dark ? 'rgba(255,255,255,0.2)' : disabled ? 'rgba(0,0,0,0.17)' : 'rgba(0,0,0,0.2)'}`
    : 'none';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, width, ...style }}>
      <textarea
        ref={setRef}
        value={v}
        onChange={(e) => setV(e.target.value)}
        disabled={disabled}
        maxLength={maxLength}
        rows={minLines}
        className="lq-input lq-text-editor"
        style={{
          display: 'block',
          boxSizing: 'border-box',
          width: '100%',
          margin: 0,
          padding: `${pad.v}px ${pad.h}px`,
          border: 'none',
          outline: 'none', // TO §2.5: no focus ring on text input
          resize: 'none',
          overflowY: 'auto',
          font: 'inherit',
          fontSize: FONT_SIZE,
          lineHeight: `${LINE}px`,
          letterSpacing: 0, // as TextField: Chrome's SF already applies tracking
          color: disabled ? cssVar('tertiaryLabel') : cssVar('label'),
          caretColor: tint ?? DEFAULT_CARET,
          background: fill,
          boxShadow: border,
          borderRadius: rr ? RR_RADIUS : 0,
          ['--lq-selection' as string]: dark ? 'rgba(0,84,166,0.35)' : 'rgba(0,84,166,0.2)', // TO §4.2
          ...textareaStyle,
        }}
        {...rest}
      />
      {showCount && (
        <span className="lq-caption1" aria-live="polite" style={{ alignSelf: 'flex-end', color: cssVar('secondaryLabel'), fontVariantNumeric: 'tabular-nums' }}>
          {formatCount(v.length, maxLength)}
        </span>
      )}
    </div>
  );
});

let editorCss = false;
function injectEditorCss(): void {
  if (editorCss || typeof document === 'undefined') return;
  editorCss = true;
  const el = document.createElement('style');
  el.textContent = '.lq-text-editor::selection{background:var(--lq-selection)}';
  document.head.appendChild(el);
}
