import { createSignal } from 'solid-js';

import type { PanelId } from './settingsDefaults';

/** Below this width the panels share one bottom sheet and the top bar shrinks. */
const PHONE_QUERY = '(max-width: 720px)';

/** A page-lifetime listener: the signal is a module singleton, so there is nothing to clean up. */
function phoneSignal(): () => boolean {
  if (typeof matchMedia !== 'function') return () => false;
  const mq = matchMedia(PHONE_QUERY);
  const [phone, setPhone] = createSignal(mq.matches);
  mq.addEventListener('change', (e) => setPhone(e.matches));
  return phone;
}

/** True on a phone-sized viewport; the panel columns then collapse into a sheet. */
export const isPhone = phoneSignal();

interface ScrollHost {
  scrollX: number;
  scrollY: number;
  scrollTo(x: number, y: number): void;
  addEventListener(type: 'resize', listener: () => void): void;
  removeEventListener(type: 'resize', listener: () => void): void;
}

/**
 * Nothing here scrolls, yet an iOS home-screen web app comes back from landscape scrolled by
 * the notch inset, which puts every fixed element's hit region above where it is painted.
 * A resize that finds the window offset puts it back. Returns a disposer.
 */
export function keepUnscrolled(win: ScrollHost): () => void {
  const onResize = () => {
    if (win.scrollX !== 0 || win.scrollY !== 0) win.scrollTo(0, 0);
  };
  win.addEventListener('resize', onResize);
  return () => win.removeEventListener('resize', onResize);
}

/** The panel that holds the sheet on a phone; null when the sheet is closed. Not persisted. */
export const [activeSheet, setActiveSheet] = createSignal<PanelId | null>(null);

/** A height the sheet rests at, as SwiftUI's presentation detents: a third of the screen, or all of it. */
export type Detent = 'medium' | 'large';

/** The detents a sheet rests at, smallest first; never none. */
export type Detents = readonly [Detent, ...Detent[]];

/** The detents each panel's sheet rests at, smallest first; settings fill the screen or nothing. */
export const DETENTS: Record<PanelId, Detents> = {
  list: ['medium', 'large'],
  detail: ['medium', 'large'],
  display: ['large'],
  maps: ['large'],
};

/** True when the sheet slides up from closed or down to it; false when it passes between panels. */
export const [sheetSlides, setSheetSlides] = createSignal(true);

/** The detent the open sheet rests at. */
export const [sheetDetent, setSheetDetent] = createSignal<Detent>('medium');

/** The detent a panel takes the sheet at: the one it rests at, if the panel has it, else the panel's smallest. */
export function detentFor(detents: Detents, resting: Detent | null): Detent {
  return resting !== null && detents.includes(resting) ? resting : detents[0];
}

export function largestDetent(detents: Detents): Detent {
  return detents.at(-1) ?? detents[0];
}

/** One detent up, and from the largest back to the smallest, as a tap on the grabber goes. */
export function cycleDetent(detents: Detents, current: Detent): Detent {
  return detents[(detents.indexOf(current) + 1) % detents.length] ?? detents[0];
}

/** Tapping the open panel's tab closes the sheet; any other tab swaps to that panel. */
export function nextSheet<T extends string>(current: T | null, tapped: T): T | null {
  return current === tapped ? null : tapped;
}

export function toggleSheet(id: PanelId): void {
  const current = activeSheet();
  const next = nextSheet(current, id);
  if (next === null) {
    closeSheet();
    return;
  }
  setSheetDetent(detentFor(DETENTS[next], current === null ? null : sheetDetent()));
  setSheetSlides(current === null);
  setActiveSheet(next);
}

export function cycleSheet(): void {
  const id = activeSheet();
  if (id !== null) setSheetDetent(cycleDetent(DETENTS[id], sheetDetent()));
}

export function closeSheet(): void {
  setSheetSlides(true);
  setActiveSheet(null);
}

/** On a phone a panel shows while it holds the sheet; elsewhere while its own toggle is on. */
export function isShown<T extends string>(
  phone: boolean,
  sheet: T | null,
  id: T,
  toggled: boolean,
): boolean {
  return phone ? sheet === id : toggled;
}
