/**
 * FullScreenCover (SwiftUI `.fullScreenCover`, UIKit `UIModalPresentationFullScreen` with the default
 * `coverVertical` transition): the content slides up from the bottom edge and covers the whole viewport; it is not
 * dismissed by a drag.
 *
 * - One layer at `zBands.sheet(i)` (shares the stacking index with `Sheet`, so later presentations draw above
 *   earlier ones whatever their kind).
 * - Present / dismiss on the sheet curve (ζ 1, 0.3441; TR §0/§3b curve 7, the presentation curve UIKit uses for
 *   modal transitions). TODO(unknown): the extraction has no separate coverVertical spring; curve 7 is used.
 * - A NavigationStack inside draws its screens inline in the cover's layer (`ZBaseContext`), like in a sheet.
 *
 * TR = findings/transitions.md.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { springs } from '@liquid-gpu/core';
import type { Layer } from '@liquid-gpu/gpu';
import { useLiquid, ZBaseContext } from '../root/context';
import { LayerView } from '../root/Layer';
import { useSpring } from '../root/useSpring';
import { zBands } from '../root/zBands';
import { ScrollChannel } from '../logic/scroll';
import { BarInsetsContext, ScrollChannelContext, TabBarPresentContext } from '../scroll/context';
import { useModalIndex } from './Sheet';

export interface FullScreenCoverProps {
  isPresented: boolean;
  /** Called once the dismiss transition has finished and the cover is gone. */
  onDismissed?(): void;
  /** Cover background (default systemBackground). */
  background?: string;
  'aria-label'?: string;
  children?: ReactNode;
}

export function FullScreenCover({ isPresented, onDismissed, ...rest }: FullScreenCoverProps) {
  const [mounted, setMounted] = useState(isPresented);
  useEffect(() => {
    if (isPresented) setMounted(true);
  }, [isPresented]);
  if (!mounted) return null;
  return (
    <CoverInner
      {...rest}
      isPresented={isPresented}
      onGone={() => {
        setMounted(false);
        onDismissed?.();
      }}
    />
  );
}

function CoverInner({
  isPresented,
  onGone,
  background,
  children,
  ...aria
}: Omit<FullScreenCoverProps, 'onDismissed'> & { onGone(): void }) {
  const ctx = useLiquid();
  const { viewport } = ctx;
  const H = viewport.height;
  const index = useModalIndex();
  const z = zBands.sheet(index);
  const layer = useRef<Layer | null>(null);
  const hRef = useRef(H);
  hRef.current = H;
  const closing = useRef(false);
  const onGoneRef = useRef(onGone);
  onGoneRef.current = onGone;

  const y = useSpring(H, springs.sheet, (v, s) => {
    const l = layer.current;
    if (l) {
      l.transform = new DOMMatrix().translate(0, v);
      l.visible = v < hRef.current - 0.5;
    }
    if (closing.current && s.settled && v >= hRef.current - 0.5) {
      closing.current = false;
      onGoneRef.current();
    }
  });

  useLayoutEffect(() => {
    if (isPresented) {
      closing.current = false;
      y.set(0, { params: springs.sheet });
    } else {
      closing.current = true;
      y.set(hRef.current, { params: springs.sheet });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPresented]);

  const channel = useMemo(() => new ScrollChannel(null), []);
  const insets = useMemo(() => ({ top: 0, bottom: 0 }), []);

  return (
    <LayerView
      ref={(l) => {
        layer.current = l;
      }}
      z={z}
      y={H}
      role="dialog"
      aria-modal={true}
      aria-label={aria['aria-label']}
      className="lq-cover lq-solid"
      style={{ overflow: 'hidden', background: background ?? 'var(--lq-system-background)', color: 'var(--lq-label)' }}
    >
      <ZBaseContext.Provider value={z}>
        <ScrollChannelContext.Provider value={channel}>
          <BarInsetsContext.Provider value={insets}>
            <TabBarPresentContext.Provider value={false}>{children}</TabBarPresentContext.Provider>
          </BarInsetsContext.Provider>
        </ScrollChannelContext.Provider>
      </ZBaseContext.Provider>
    </LayerView>
  );
}
