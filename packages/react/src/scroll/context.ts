import { createContext } from 'react';
import type { ScrollChannel } from '../logic/scroll';

/** Nearest scroll activity channel (Screen, TabView, Sheet create one). */
export const ScrollChannelContext = createContext<ScrollChannel | null>(null);

/** Space taken by floating bars over the content; scroll views pad their content by it. */
export interface BarInsets {
  top: number;
  bottom: number;
  /** Default scroll detents for scroll views in this screen (large title: [0, 52]). */
  detents?: readonly number[];
}

export const BarInsetsContext = createContext<BarInsets>({ top: 0, bottom: 0 });

/** True inside a TabView (floating toolbars sit above the tab bar platter). */
export const TabBarPresentContext = createContext(false);
