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

/** Whether the lanes read an instant other than now: while peeking, or with the window held. */
export const readsPast = (peeking: boolean, w: LanesWindow): boolean =>
  peeking || w.kind === 'held';

/** The window held where it stands, `visible` being what it shows. */
export const holdWindow = (visible: Interval): LanesWindow => ({
  kind: 'held',
  from: visible.from,
  to: visible.to,
});

/** The window live again, as long as `visible`. */
export const goLive = (visible: Interval): LanesWindow => ({
  kind: 'live',
  sec: visible.to - visible.from,
});

/** From the first sample to now; empty at now without any. */
export const contactOf = (samples: readonly { t: number }[], now: number): Interval => ({
  from: samples[0]?.t ?? now,
  to: now,
});

/** The slack in telling a held window's right edge from now. */
const EDGE_EPS_SEC = 1e-6;

/** A live window `sec` long, the whole contact when it is at least as long. */
const liveOf = (sec: number, contact: Interval): LanesWindow => ({
  kind: 'live',
  sec: sec >= contact.to - contact.from ? Infinity : sec,
});

/** The window `sec` long starting at `from`: moved up to the contact's start, live when it reaches now. */
function settle(from: number, sec: number, contact: Interval): LanesWindow {
  const start = Math.max(from, contact.from);
  const to = start + sec;
  return to >= contact.to - EDGE_EPS_SEC ? liveOf(sec, contact) : { kind: 'held', from: start, to };
}

/**
 * The window once its length is multiplied by `factor` (wider above one), within the minimum and
 * the whole contact. A live window keeps its right edge; a held one keeps `pivot` where it stands.
 */
export function zoomWindow(
  w: LanesWindow,
  visible: Interval,
  factor: number,
  pivot: number,
  contact: Interval,
): LanesWindow {
  const length = visible.to - visible.from;
  const sec = Math.max(MIN_WINDOW_SEC, Math.min(length * factor, contact.to - contact.from));
  if (w.kind === 'live') return liveOf(sec, contact);
  return settle(pivot - ((pivot - visible.from) / length) * sec, sec, contact);
}

/**
 * The window moved `sec` toward now (back when negative): held once it leaves now, live again on
 * reaching it, stopped at the start of the contact. Unchanged when live and asked to go on.
 */
export function panWindow(
  w: LanesWindow,
  visible: Interval,
  sec: number,
  contact: Interval,
): LanesWindow {
  if (w.kind === 'live' && sec >= 0) return w;
  return settle(visible.from + sec, visible.to - visible.from, contact);
}

/**
 * The window a band dragged from instant `t0` to `t1` makes, within `visible`: held, grown to the
 * minimum from its earlier end, live again if it reaches now.
 */
export function selectWindow(
  t0: number,
  t1: number,
  visible: Interval,
  contact: Interval,
): LanesWindow {
  const from = clamp(Math.min(t0, t1), visible.from, visible.to);
  const to = clamp(Math.max(t0, t1), visible.from, visible.to);
  return settle(from, Math.max(MIN_WINDOW_SEC, to - from), contact);
}

/**
 * The window two fingers make of the one they began on (`start`), when they stand at `a`, `b`
 * across plots `width` wide where they began at `a0`, `b0`: the content follows them and their
 * spread scales it, about the fingers when held and about now when live.
 */
export function pinchWindow(
  start: { w: LanesWindow; visible: Interval },
  a0: number,
  b0: number,
  a: number,
  b: number,
  width: number,
  contact: Interval,
): LanesWindow {
  const { w, visible } = start;
  const length = visible.to - visible.from;
  const spread = Math.max(1, Math.abs(b0 - a0)) / Math.max(1, Math.abs(b - a));
  const sec = clamp(
    length * spread,
    MIN_WINDOW_SEC,
    Math.max(MIN_WINDOW_SEC, contact.to - contact.from),
  );
  const mid = (a + b) / 2 / width;
  if (w.kind === 'live')
    return settle(contact.to - (mid - (a0 + b0) / 2 / width) * sec - sec, sec, contact);
  const pinned = visible.from + ((a0 + b0) / 2 / width) * length;
  return settle(pinned - mid * sec, sec, contact);
}

/** The keys that pan, narrow, widen or reset the window. */
export type WindowKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home';

/** The window an arrow key or Home asks for: a tenth of the window to pan or to narrow or widen by, Home the default. */
export function keyWindow(
  key: WindowKey,
  w: LanesWindow,
  visible: Interval,
  contact: Interval,
): LanesWindow {
  const length = visible.to - visible.from;
  const middle = (visible.from + visible.to) / 2;
  switch (key) {
    case 'ArrowLeft':
      return panWindow(w, visible, -length / 10, contact);
    case 'ArrowRight':
      return panWindow(w, visible, length / 10, contact);
    case 'ArrowUp':
      return zoomWindow(w, visible, 0.9, middle, contact);
    case 'ArrowDown':
      return zoomWindow(w, visible, 1.1, middle, contact);
    default:
      return DEFAULT_WINDOW;
  }
}
