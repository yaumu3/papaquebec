import type { Point } from './geometry';

/** The client position of a pointer, mouse or wheel event. */
export const at = (e: { clientX: number; clientY: number }): Point => ({
  x: e.clientX,
  y: e.clientY,
});

type Off = () => void;

/** Adds a listener and returns the function that removes it. */
export function listen<K extends keyof HTMLElementEventMap>(
  target: HTMLElement,
  type: K,
  fn: (e: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions,
): Off;
export function listen<K extends keyof WindowEventMap>(
  target: Window,
  type: K,
  fn: (e: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions,
): Off;
export function listen(
  target: EventTarget,
  type: string,
  fn: (e: Event) => void,
  options?: AddEventListenerOptions,
): Off {
  target.addEventListener(type, fn, options);
  return () => target.removeEventListener(type, fn, options);
}

/** One remover for many. */
export const offAll =
  (offs: Off[]): Off =>
  () => {
    for (const off of offs) off();
  };
