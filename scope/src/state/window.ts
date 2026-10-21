import { clamp } from '../lib/math';

/** A stretch of time, seconds since epoch. */
export interface Interval {
  from: number;
  to: number;
}

/**
 * The stretch of time every history lane shows: the last `sec` seconds as time goes on (the whole
 * contact when `sec` is infinite), or an interval that stays put.
 */
export type LanesWindow =
  | { kind: 'live'; sec: number }
  | { kind: 'held'; from: number; to: number };

/** The whole contact, live. */
export const DEFAULT_WINDOW: LanesWindow = { kind: 'live', sec: Infinity };
export const MIN_WINDOW_SEC = 30;

/** The interval of the contact `w` shows, at least the minimum long. */
export function resolveWindow(w: LanesWindow, contact: Interval): Interval {
  if (w.kind === 'live') {
    const sec = clamp(w.sec, MIN_WINDOW_SEC, Math.max(MIN_WINDOW_SEC, contact.to - contact.from));
    return { from: contact.to - sec, to: contact.to };
  }
  const sec = Math.max(MIN_WINDOW_SEC, w.to - w.from);
  const to = Math.min(Math.max(w.from, contact.from) + sec, contact.to);
  return { from: to - sec, to };
}

/** Where a time falls across `width`. */
export const xOf = (t: number, i: Interval, width: number): number =>
  ((t - i.from) / (i.to - i.from)) * width;

/** The time at a point across `width`. */
export const timeAt = (x: number, i: Interval, width: number): number =>
  i.from + (x / width) * (i.to - i.from);
