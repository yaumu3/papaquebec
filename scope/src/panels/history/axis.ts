import { clockTime } from '../../lib/format';
import { clamp } from '../../lib/math';
import type { Interval } from './span';

/** Steps along the clock, seconds: each a round part of it, up to the hour. */
const STEPS_SEC = [10, 15, 30, 60, 120, 300, 600, 900, 1800];
const HOUR_SEC = 3600;
/** How many labels at most an axis carries. */
const MAX_LABELS = 5;

/** The shortest round step that falls at most `most` times across a span of `spanSec`. */
export function clockStep(spanSec: number, most: number): number {
  return STEPS_SEC.find((s) => spanSec / s <= most) ?? HOUR_SEC;
}

/** The step between the labels of an axis over a span of `spanSec`. */
export const axisStep = (spanSec: number): number => clockStep(spanSec, MAX_LABELS);

/** The multiples of `step` inside the interval, its ends included. */
export function ticks(i: Interval, step: number): number[] {
  const out: number[] = [];
  for (let t = Math.ceil(i.from / step) * step; t <= i.to; t += step) out.push(t);
  return out;
}

/** The ticks at which a mark reaching `reachPx` round each fits whole inside a plot `width` across. */
export function clearOfEnds(
  at: readonly number[],
  x: (t: number) => number,
  width: number,
  reachPx: number,
): number[] {
  return at.filter((t) => x(t) >= reachPx && x(t) <= width - reachPx);
}

/** The clock time to the minute, or to the second when the step is shorter than a minute. */
export function clockLabel(t: number, step: number): string {
  const full = clockTime(t);
  return step < 60 ? full : full.slice(0, 5);
}

/** The span's ends as its axis reads them, then how long it is: in seconds under a minute, else in whole minutes. */
export function spanLabel(i: Interval): string {
  const sec = i.to - i.from;
  const step = axisStep(sec);
  const long = sec < 60 ? `${Math.round(sec)} S` : `${Math.round(sec / 60)} MIN`;
  return `${clockLabel(i.from, step)} – ${clockLabel(i.to, step)} · ${long}`;
}

/** The left of a chip `chipW` across centred on `x`, kept inside a plot `plotW` across. */
export const chipAt = (x: number, chipW: number, plotW: number): number =>
  clamp(x - chipW / 2, 0, Math.max(0, plotW - chipW));

/** Whether each label at `xs`, `halfPx` either side, misses the stretch from `from` to `to`. */
export const clearOf = (
  xs: readonly number[],
  from: number,
  to: number,
  halfPx: number,
): boolean[] => xs.map((x) => x + halfPx <= from || x - halfPx >= to);
