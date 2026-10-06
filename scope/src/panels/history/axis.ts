import { clockTime } from '../../lib/format';
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

/** The clock time to the minute, or to the second when the step is shorter than a minute. */
export function clockLabel(t: number, step: number): string {
  const full = clockTime(t);
  return step < 60 ? full : full.slice(0, 5);
}
