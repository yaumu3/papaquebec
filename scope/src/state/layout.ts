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

/** The one panel shown in the phone sheet; null when the sheet is closed. Not persisted. */
export const [activeSheet, setActiveSheet] = createSignal<PanelId | null>(null);

/** Tapping the open panel's tab closes the sheet; any other tab swaps to that panel. */
export function nextSheet<T extends string>(current: T | null, tapped: T): T | null {
  return current === tapped ? null : tapped;
}

export function toggleSheet(id: PanelId): void {
  setActiveSheet((cur) => nextSheet(cur, id));
}
