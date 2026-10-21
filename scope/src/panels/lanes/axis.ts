import { formatAgo } from '../../lib/format';
import type { Interval, LanesWindow } from '../../state/window';

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

/** The multiples of `step` inside the interval, its ends included; counted from `origin` when given. */
export function ticks(i: Interval, step: number, origin = 0): number[] {
  const out: number[] = [];
  for (let t = origin + Math.ceil((i.from - origin) / step) * step; t <= i.to; t += step) {
    out.push(t);
  }
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

/** What the axis reads at its right edge: NOW while live, else how far back the window ends. */
export const endLabel = (w: LanesWindow, lagSec: number): { text: string; held: boolean } =>
  w.kind === 'live' ? { text: 'NOW', held: false } : { text: `${formatAgo(lagSec)} ›`, held: true };

/** Whether each label at `xs`, `halfPx` either side, misses the stretch from `from` to `to`. */
export const clearOf = (
  xs: readonly number[],
  from: number,
  to: number,
  halfPx: number,
): boolean[] => xs.map((x) => x + halfPx <= from || x - halfPx >= to);
