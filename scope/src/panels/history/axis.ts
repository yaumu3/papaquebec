import { clockTime } from '../../lib/format';
import type { Interval } from './span';

/** Steps between labels, seconds: each a round part of the clock, up to the hour. */
const STEPS_SEC = [10, 15, 30, 60, 120, 300, 600, 900, 1800];
const HOUR_SEC = 3600;
/** How many labels at most an axis carries. */
const MAX_LABELS = 5;

/** The shortest step that labels a span of `spanSec` at most `MAX_LABELS` times. */
export function axisStep(spanSec: number): number {
  return STEPS_SEC.find((s) => spanSec / s <= MAX_LABELS) ?? HOUR_SEC;
}

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
