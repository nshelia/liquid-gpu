/**
 * Pure scroll-view helpers (no DOM), unit-tested in test/scroll-logic.test.ts.
 *
 * SMG = ~/Documents/uikit-internals/findings/scroll-motion-gestures.md
 */
import { metrics } from '@liquid-gpu/core';

/**
 * The scroll view keeps native `scrollTop` for in-bounds offsets (so focus scrolling and keyboard scrolling keep
 * working) and applies the rubber-band part as a translation of the content.
 */
export function splitOffset(offset: number, maxNative: number): { native: number; over: number } {
  const native = Math.min(Math.max(offset, 0), Math.max(0, maxNative));
  return { native, over: offset - native };
}

/** TODO(unknown): UIKit's minimum indicator length is not in the extraction; 36 pt is a visual choice. */
export const INDICATOR_MIN_LENGTH = 36;

/**
 * Scroll indicator geometry along the axis (SMG §5: 3 pt thick, 3 pt from the edge). The track runs between the
 * insets; the knob shrinks while rubber-banding (as UIKit's does) down to a 7 pt stub. TODO(unknown): the stub
 * length is not extracted.
 */
export function indicatorGeometry(
  offset: number,
  contentSize: number,
  viewport: number,
  insetStart: number,
  insetEnd: number,
  minLength = INDICATOR_MIN_LENGTH,
): { pos: number; length: number; visible: boolean } {
  const track = Math.max(0, viewport - insetStart - insetEnd - 2 * metrics.scrollIndicatorInset);
  const max = contentSize - viewport;
  if (max <= 0.5 || track <= 0) return { pos: 0, length: 0, visible: false };
  let length = Math.max(minLength, Math.min(track, (track * viewport) / contentSize));
  let over = 0;
  if (offset < 0) over = -offset;
  else if (offset > max) over = offset - max;
  if (over > 0) length = Math.max(7, length - over);
  const progress = Math.min(1, Math.max(0, offset / max));
  const pos = insetStart + metrics.scrollIndicatorInset + (track - length) * progress;
  return { pos, length, visible: true };
}

export type WheelKind = 'pixel' | 'discrete';

/**
 * Trackpads deliver pixel deltas with fractional or small values; mouse wheels deliver lines/pages or large
 * integer steps. Pixel (trackpad) input tracks the content directly with a rubber band; discrete input animates.
 */
export function classifyWheel(deltaMode: number, delta: number): WheelKind {
  if (deltaMode !== 0) return 'discrete';
  if (!Number.isInteger(delta)) return 'pixel';
  return Math.abs(delta) >= 100 ? 'discrete' : 'pixel';
}

/** Line/page wheel deltas in pt. TODO(unknown): web-only mapping (UIKit has no mouse-wheel line unit). */
export function wheelDeltaPixels(deltaMode: number, delta: number, viewport: number): number {
  if (deltaMode === 1) return delta * 40;
  if (deltaMode === 2) return delta * viewport * 0.875;
  return delta;
}

export interface ScrollEvent {
  offset: number;
  /** Offset change since the previous event. */
  delta: number;
  /** Finger (or trackpad) on the content. */
  tracking: boolean;
  /** Content size minus viewport. */
  max: number;
}

/**
 * Scroll activity channel. A ScrollView publishes to the nearest channel; channels forward to their parent so a
 * TabBar (minimize on scroll) and a NavBar (large-title collapse) can follow the primary scroll view.
 */
export class ScrollChannel {
  last: ScrollEvent = { offset: 0, delta: 0, tracking: false, max: 0 };
  private listeners = new Set<(e: ScrollEvent) => void>();
  constructor(readonly parent: ScrollChannel | null = null, public forward: () => boolean = () => true) {}

  publish(e: ScrollEvent): void {
    this.last = e;
    for (const fn of this.listeners) fn(e);
    if (this.parent && this.forward()) this.parent.publish(e);
  }

  subscribe(fn: (e: ScrollEvent) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}
