/**
 * `TextField` and `SearchField`: real `<input>`s styled after UITextField (components/text_overlays.md §2).
 *
 * TextField `roundedRect` (default): 34 pt, text inset 7, radius 5 continuous, fill #FFF / #000, 1 px border
 * #000@0.20 / #FFF@0.20; `plain` (borderStyle none): 22 pt, no chrome. Body 17 pt, labelColor, placeholder
 * placeholderText, tint caret. The clear button (`xmark.circle.fill` 19.667 pt, 5.333 pt from the right edge) shows
 * while editing when non-empty. No focus ring (§2.5).
 *
 * SearchField: a capsule with a leading magnifying glass and the clear button, searchPlaceholder colour.
 * TODO(unknown): the iOS 27 in-content search field height and fill were not extracted (the bar search field is
 * glass); 44 pt capsule with tertiarySystemFill is used, the alert text-field pill fill (text_overlays §9.2).
 */
import { forwardRef, useState, type CSSProperties, type InputHTMLAttributes } from 'react';
import { cssVar, useLiquid } from '../root';

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'defaultValue' | 'onChange' | 'style' | 'size'>;

export interface TextFieldProps extends InputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** `roundedRect` (default) or `plain` (borderStyle none). */
  variant?: 'roundedRect' | 'plain';
  /** Show the clear button while editing (`.whileEditing`). Default true. */
  clearButton?: boolean;
  width?: number | string;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
}

function ClearButton({ onClear }: { onClear: () => void }) {
  return (
    <button
      type="button"
      aria-label="Clear text"
      tabIndex={-1}
      onPointerDown={(e) => e.preventDefault()}
      onClick={onClear}
      style={{
        flex: 'none',
        width: 19.667,
        height: 19.667,
        padding: 0,
        border: 'none',
        background: 'transparent',
        color: cssVar('tertiaryLabel'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
      }}
    >
      <svg width="17" height="17" viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="10" fill="currentColor" />
        <path d="M6.5 6.5l7 7M13.5 6.5l-7 7" stroke="var(--lq-system-background)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function useText(value: string | undefined, defaultValue: string | undefined, onChange?: (v: string) => void) {
  const [inner, setInner] = useState(defaultValue ?? '');
  const v = value ?? inner;
  const set = (s: string) => {
    if (value === undefined) setInner(s);
    onChange?.(s);
  };
  return [v, set] as const;
}

const inputBase: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  height: '100%',
  border: 'none',
  outline: 'none',
  background: 'transparent',
  padding: 0,
  margin: 0,
  font: 'inherit',
  fontSize: 17, // text_overlays §2.3 `.SFUI-Regular` 17
  letterSpacing: 0, // SF tracking is already applied by the system font in Chrome (size audit: widths match iOS at 0)
  color: cssVar('label'),
  caretColor: cssVar('tint'),
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { value, defaultValue, onChange, variant = 'roundedRect', clearButton = true, width = '100%', style, inputStyle, onFocus, onBlur, ...rest },
  ref,
) {
  const ctx = useLiquid();
  injectFieldCss();
  const [v, setV] = useText(value, defaultValue, onChange);
  const [focused, setFocused] = useState(false);
  const rr = variant === 'roundedRect';
  const dark = ctx.appearance === 'dark';
  return (
    <label
      style={{
        display: 'flex',
        alignItems: 'center',
        boxSizing: 'border-box',
        width,
        height: rr ? 34 : 22,
        padding: rr ? '0 5.333px 0 7px' : 0,
        borderRadius: rr ? 5 : 0,
        // text_overlays §2.2: disabled roundedRect is #FAFAFA with a @0.17 border (light).
        background: rr ? (rest.disabled && !dark ? '#FAFAFA' : dark ? '#000000' : '#FFFFFF') : 'transparent',
        boxShadow: rr ? `inset 0 0 0 calc(1px / var(--lq-dpr, 1)) ${dark ? 'rgba(255,255,255,0.2)' : rest.disabled ? 'rgba(0,0,0,0.17)' : 'rgba(0,0,0,0.2)'}` : 'none',
        color: rest.disabled ? cssVar('tertiaryLabel') : undefined,
        ['cornerShape' as string]: 'squircle',
        ...style,
      }}
    >
      <input
        ref={ref}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        className="lq-input"
        style={{ ...inputBase, ...(clearButton && focused && v.length > 0 ? { marginRight: 9.667 } : null), ...inputStyle }}
        {...rest}
      />
      {clearButton && focused && v.length > 0 && <ClearButton onClear={() => setV('')} />}
    </label>
  );
});

export interface SearchFieldProps extends Omit<TextFieldProps, 'variant' | 'onSubmit'> {
  /** Called on Enter. */
  onSubmit?: (value: string) => void;
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  { value, defaultValue, onChange, onSubmit, clearButton = true, width = '100%', style, inputStyle, placeholder = 'Search', ...rest },
  ref,
) {
  injectFieldCss();
  const [v, setV] = useText(value, defaultValue, onChange);
  const h = 44; // TODO(unknown) see module doc
  return (
    <label
      role="search"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        boxSizing: 'border-box',
        width,
        height: h,
        padding: '0 12px',
        borderRadius: h / 2,
        background: cssVar('tertiarySystemFill'),
        color: cssVar('searchPlaceholder'),
        ...style,
      }}
    >
      <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true" style={{ flex: 'none' }}>
        <circle cx="8.5" cy="8.5" r="6.2" fill="none" stroke="currentColor" strokeWidth="2.1" />
        <path d="M13.2 13.2l4.6 4.6" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        type="search"
        enterKeyHint="search"
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSubmit?.(v);
          if (e.key === 'Escape') setV('');
        }}
        className="lq-input lq-search-input"
        style={{ ...inputBase, ...inputStyle }}
        {...rest}
      />
      {clearButton && v.length > 0 && <ClearButton onClear={() => setV('')} />}
    </label>
  );
});

let placeholderCss = false;
/** Placeholder colour (text_overlays §2.3) and the WebKit search decoration reset. Injected on first import. */
export function injectFieldCss(): void {
  if (placeholderCss || typeof document === 'undefined') return;
  placeholderCss = true;
  const el = document.createElement('style');
  el.textContent =
    '.lq-input::placeholder{color:var(--lq-placeholder-text);opacity:1}' +
    '.lq-search-input::placeholder{color:var(--lq-search-placeholder)}' +
    '.lq-search-input::-webkit-search-cancel-button,.lq-search-input::-webkit-search-decoration{-webkit-appearance:none;appearance:none}';
  document.head.appendChild(el);
}
