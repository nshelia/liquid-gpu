import { useLiquidOptional } from './context';
import { resolveTheme, type ResolvedTheme } from './theme';

/**
 * The effective theme of the enclosing `LiquidRoot` (its `theme` overrides resolved for the current appearance).
 * Outside a root: the default tokens in light appearance.
 */
export function useTheme(): ResolvedTheme {
  const ctx = useLiquidOptional();
  return ctx?.theme ?? resolveTheme(undefined, ctx?.appearance ?? 'light');
}
