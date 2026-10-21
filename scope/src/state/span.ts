import { clamp } from '../lib/math';

/** A stretch of time, seconds since epoch. */
export interface Interval {
  from: number;
  to: number;
}

/**
 * What the lanes show of the contact: all of it, its last seconds as it goes on, or an interval
 * that stays put.
 */
export type Span =
  | { kind: 'all' }
  | { kind: 'tail'; sec: number }
  | { kind: 'fixed'; from: number; to: number };

export const WHOLE: Span = { kind: 'all' };
export const MIN_SPAN_SEC = 60;

/** The interval inside the contact, at least the minimum span long, ending where the contact does if need be. */
function fit(i: Interval, contact: Interval): Interval {
  const to = clamp(i.to, contact.from, contact.to);
  const from = clamp(i.from, contact.from, to);
  if (to - from >= MIN_SPAN_SEC) return { from, to };
  const end = Math.min(contact.to, from + MIN_SPAN_SEC);
  return { from: end - MIN_SPAN_SEC, to: end };
}

/** The visible interval of the contact under `span`. */
export function resolveSpan(span: Span, contact: Interval): Interval {
  switch (span.kind) {
    case 'all':
      return fit(contact, contact);
    case 'tail':
      return fit({ from: contact.to - span.sec, to: contact.to }, contact);
    default:
      return fit(span, contact);
  }
}

/** Where a time falls across `width`. */
export const xOf = (t: number, i: Interval, width: number): number =>
  ((t - i.from) / (i.to - i.from)) * width;

/** The time at a point across `width`. */
export const timeAt = (x: number, i: Interval, width: number): number =>
  i.from + (x / width) * (i.to - i.from);
