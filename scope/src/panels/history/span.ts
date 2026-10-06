import { clamp } from '../../lib/math';

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

/** The span a chosen interval settles into: the whole contact when it covers it, a tail when it ends with it. */
export function spanOf(i: Interval, contact: Interval): Span {
  if (i.from <= contact.from && i.to >= contact.to) return WHOLE;
  if (i.to >= contact.to) return { kind: 'tail', sec: i.to - i.from };
  return { kind: 'fixed', from: i.from, to: i.to };
}

/** What a press on the timeline takes hold of. */
export type Grab = 'left' | 'right' | 'body' | 'outside';

/** The nearer edge within `tolerance`, the body between the edges, else the rest of the contact. */
export function grabAt(t: number, visible: Interval, tolerance: number): Grab {
  const toLeft = Math.abs(t - visible.from);
  const toRight = Math.abs(t - visible.to);
  if (Math.min(toLeft, toRight) <= tolerance) return toLeft <= toRight ? 'left' : 'right';
  return t > visible.from && t < visible.to ? 'body' : 'outside';
}

/** The interval once a pointer that pressed at `t0` on `grab` has moved to `t`. */
export function dragInterval(
  grab: Grab,
  start: Interval,
  t0: number,
  t: number,
  contact: Interval,
): Interval {
  switch (grab) {
    case 'left':
      return { from: clamp(t, contact.from, start.to - MIN_SPAN_SEC), to: start.to };
    case 'right':
      return { from: start.from, to: clamp(t, start.from + MIN_SPAN_SEC, contact.to) };
    case 'body': {
      const width = start.to - start.from;
      const from = clamp(start.from + t - t0, contact.from, contact.to - width);
      return { from, to: from + width };
    }
    default:
      return {
        from: clamp(Math.min(t0, t), contact.from, contact.to),
        to: clamp(Math.max(t0, t), contact.from, contact.to),
      };
  }
}

/** Where a time falls across `width`. */
export const xOf = (t: number, i: Interval, width: number): number =>
  ((t - i.from) / (i.to - i.from)) * width;

/** The time at a point across `width`. */
export const timeAt = (x: number, i: Interval, width: number): number =>
  i.from + (x / width) * (i.to - i.from);
