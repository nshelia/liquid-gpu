/**
 * Overlay helpers: presence (keep mounted through the exit animation) and a focus trap for modal overlays.
 */
import { useEffect, useRef, useState, type RefObject } from 'react';

/** `mounted` stays true after `present` turns false until `done()` is called by the exit animation. */
export function usePresence(present: boolean): { mounted: boolean; exiting: boolean; done: () => void } {
  const [mounted, setMounted] = useState(present);
  const [exiting, setExiting] = useState(false);
  useEffect(() => {
    if (present) {
      setMounted(true);
      setExiting(false);
    } else if (mounted) setExiting(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [present]);
  const doneRef = useRef(() => {});
  doneRef.current = () => {
    if (!present) {
      setMounted(false);
      setExiting(false);
    }
  };
  return { mounted: mounted || present, exiting: exiting && !present, done: () => doneRef.current() };
}

/** Keep Tab inside `ref`, focus `initial` (or the first focusable) on mount, restore focus on unmount. */
export function useFocusTrap(ref: RefObject<HTMLElement | null>, active: boolean, initial?: () => HTMLElement | null): void {
  useEffect(() => {
    if (!active) return;
    const prev = document.activeElement as HTMLElement | null;
    const el = ref.current;
    const focusables = () =>
      [...(el?.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex]:not([tabindex="-1"])') ?? [])];
    const first = initial?.() ?? focusables()[0];
    first?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || !el) return;
      const f = focusables();
      if (f.length === 0) return;
      const i = f.indexOf(document.activeElement as HTMLElement);
      const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 ? 0 : i + 1;
      e.preventDefault();
      f[n]!.focus({ preventScroll: true });
    };
    addEventListener('keydown', onKey, true);
    return () => {
      removeEventListener('keydown', onKey, true);
      prev?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
