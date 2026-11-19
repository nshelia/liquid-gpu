/**
 * `OneTimeCodeField` (Input OTP): N single-character boxes. iOS has no segmented code field (apps draw their own);
 * the boxes use the TextField roundedRect chrome (components/text_overlays.md §2.2: fill #FFF / #000, 1 px border
 * #000@0.20 / #FFF@0.20, radius 5, disabled #FAFAFA) and the system one-time-code autofill
 * (`autocomplete="one-time-code"`, the web equivalent of `textContentType = .oneTimeCode`).
 * - Typing, paste and autofill go through `distributeCode` (logic.ts): a full code fills every box from the first.
 * - The code is always contiguous: focusing a box past the first empty one focuses the first empty one.
 * - Caret: #426BF2 (text_overlays §4.1 default insertion-point colour).
 * TODO(unknown): box size 44 × 52, 8 pt gap, 22 pt digits; the focused-box ring (tint, 2 pt) — iOS shows no focus
 * ring on fields (text_overlays §2.5), but a code field needs a visible current box.
 */
import { useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { cssVar, useLiquid } from '../root';
import { useControllable } from '../controls/internal';
import { backspaceCode, distributeCode } from './logic';

export interface OneTimeCodeFieldProps {
  /** Number of boxes. Default 6. */
  length?: number;
  value?: string;
  defaultValue?: string;
  onChange?: (code: string) => void;
  /** Called once all boxes are filled. */
  onComplete?: (code: string) => void;
  /** Digits only (default) or letters and digits. */
  numeric?: boolean;
  disabled?: boolean;
  /** Mask the characters (password-like). */
  secure?: boolean;
  autoFocus?: boolean;
  /** Insert a gap after this many boxes (e.g. 3 for "123 456"). */
  groupSize?: number;
  'aria-label'?: string;
  id?: string;
  className?: string;
  style?: CSSProperties;
}

const BOX_W = 44; // TODO(unknown)
const BOX_H = 52; // TODO(unknown)
const GAP = 8; // TODO(unknown)
const RADIUS = 5; // text_overlays §2.2 roundedRect r 5

export function OneTimeCodeField({
  length = 6,
  value,
  defaultValue = '',
  onChange,
  onComplete,
  numeric = true,
  disabled,
  secure,
  autoFocus,
  groupSize,
  className,
  style,
  ...aria
}: OneTimeCodeFieldProps) {
  const ctx = useLiquid();
  const dark = ctx.appearance === 'dark';
  const [code, setCode] = useControllable(value, defaultValue, onChange);
  const [focused, setFocused] = useState<number | null>(null);
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  // The latest code, also between a commit and the re-render (focus moves synchronously, so the next keystroke
  // lands in the next box even when keys arrive faster than a frame).
  const codeRef = useRef(code);
  codeRef.current = code;
  const focusBox = (i: number) => {
    const el = refs.current[i];
    el?.focus();
    el?.select();
  };
  const commit = (next: string, focus: number) => {
    const prev = codeRef.current;
    codeRef.current = next;
    if (next !== prev) setCode(next);
    if (next.length === length && next !== prev) onComplete?.(next);
    focusBox(focus);
  };
  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      e.preventDefault();
      const r = backspaceCode(codeRef.current, i);
      commit(r.code, r.focus);
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      focusBox(i - 1);
    } else if (e.key === 'ArrowRight' && i < Math.min(codeRef.current.length, length - 1)) {
      e.preventDefault();
      focusBox(i + 1);
    }
  };
  return (
    <div
      role="group"
      aria-label={aria['aria-label'] ?? 'One-time code'}
      id={aria.id}
      className={className}
      style={{ display: 'inline-flex', gap: GAP, ...style }}
    >
      {Array.from({ length }, (_, i) => {
        const ch = code[i] ?? '';
        const isFocused = focused === i;
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el;
            }}
            value={ch}
            disabled={disabled}
            autoFocus={autoFocus && i === 0}
            // Every box accepts the autofill: the first box gets it in Safari, others when focused there.
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            inputMode={numeric ? 'numeric' : 'text'}
            pattern={numeric ? '[0-9]*' : undefined}
            type={secure ? 'password' : 'text'}
            aria-label={`Digit ${i + 1} of ${length}`}
            onFocus={(e) => {
              const cur = codeRef.current;
              if (i > cur.length) {
                focusBox(Math.min(cur.length, length - 1));
                return;
              }
              setFocused(i);
              e.currentTarget.select();
            }}
            onBlur={() => setFocused((f) => (f === i ? null : f))}
            onKeyDown={(e) => onKey(i, e)}
            onPaste={(e) => {
              e.preventDefault();
              const r = distributeCode(codeRef.current, i, e.clipboardData.getData('text'), length, numeric);
              commit(r.code, r.focus);
            }}
            onChange={(e) => {
              // The box shows one char; the new input is what replaced it (or a whole autofilled code).
              const raw = e.target.value;
              const typed = ch && raw.length === 2 ? (raw.startsWith(ch) ? raw.slice(1) : raw.slice(0, 1)) : raw;
              const r = distributeCode(codeRef.current, i, typed, length, numeric);
              commit(r.code, r.focus);
            }}
            style={{
              boxSizing: 'border-box',
              width: BOX_W,
              height: BOX_H,
              marginLeft: groupSize && i > 0 && i % groupSize === 0 ? GAP * 2 : 0, // TODO(unknown) group gap
              padding: 0,
              border: 'none',
              outline: 'none',
              borderRadius: RADIUS,
              ['cornerShape' as string]: 'squircle',
              textAlign: 'center',
              font: 'inherit',
              fontSize: 22, // TODO(unknown)
              fontVariantNumeric: 'tabular-nums',
              color: disabled ? cssVar('tertiaryLabel') : cssVar('label'),
              caretColor: '#426BF2', // text_overlays §4.1
              background: disabled ? (dark ? '#050505' : '#FAFAFA') : dark ? '#000000' : '#FFFFFF', // §2.2 / SC §5 disabled
              boxShadow: isFocused
                ? `inset 0 0 0 2px ${cssVar('tint')}` // TODO(unknown) focused box ring
                : `inset 0 0 0 calc(1px / var(--lq-dpr, 1)) ${dark ? 'rgba(255,255,255,0.2)' : disabled ? 'rgba(0,0,0,0.17)' : 'rgba(0,0,0,0.2)'}`,
            }}
          />
        );
      })}
    </div>
  );
}
