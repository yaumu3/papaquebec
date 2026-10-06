import { nearestInTime } from '../../lib/nearest';
import { STALE_SECONDS } from '../../render/scene/rules';
import type { Sample } from '../../state/track';
import type { Interval } from './span';

/** As long without a report as makes a target stale on the scope breaks a trace too. */
export const GAP_SEC = STALE_SECONDS;

export interface Point {
  t: number;
  v: number;
}

/** A reading as a number for the plot; undefined when the sample lacks it. */
export type Read = (s: Sample) => number | undefined;

export interface Range {
  lo: number;
  hi: number;
}

/** The samples in stretches of reports no further apart than the gap. */
function stretches(samples: readonly Sample[]): Sample[][] {
  const out: Sample[][] = [];
  let stretch: Sample[] = [];
  for (const s of samples) {
    const last = stretch.at(-1);
    if (last && s.t - last.t > GAP_SEC) {
      out.push(stretch);
      stretch = [];
    }
    stretch.push(s);
  }
  if (stretch.length > 0) out.push(stretch);
  return out;
}

/** The sample before the interval through the one after it, so a trace runs off the edges. */
function around(samples: readonly Sample[], i: Interval): Sample[] {
  let first = samples.findIndex((s) => s.t >= i.from);
  if (first < 0) first = samples.length;
  let last = samples.findIndex((s) => s.t > i.to);
  if (last < 0) last = samples.length;
  return samples.slice(Math.max(0, first - 1), Math.min(samples.length, last + 1));
}

/** The runs of points a trace joins: consecutive samples of a stretch that carry the reading. */
export function runsOf(samples: readonly Sample[], read: Read, i: Interval): Point[][] {
  const runs: Point[][] = [];
  for (const stretch of stretches(around(samples, i))) {
    let run: Point[] = [];
    for (const s of stretch) {
      const v = read(s);
      if (v === undefined) {
        if (run.length > 0) runs.push(run);
        run = [];
      } else {
        run.push({ t: s.t, v });
      }
    }
    if (run.length > 0) runs.push(run);
  }
  return runs;
}

/** `v` moved by whole turns to within half a turn of `near`. */
const turnNear = (v: number, near: number): number => v + Math.round((near - v) / 360) * 360;

/**
 * Degrees moved by whole turns to within half a turn of the reference reading at the same time,
 * or of the point before where the reference has none, for an intent drawn on an unwrapped scale.
 */
export function alignTo(runs: readonly Point[][], reference: readonly Point[][]): Point[][] {
  const at = new Map(reference.flat().map((p) => [p.t, p.v]));
  return runs.map((run) => {
    let previous: number | undefined;
    return run.map((p) => {
      const near = at.get(p.t) ?? previous;
      const v = near === undefined ? p.v : turnNear(p.v, near);
      previous = v;
      return { t: p.t, v };
    });
  });
}

/** Degrees made continuous: each point moved by whole turns to within half a turn of the one before it. */
export const unwrap = (runs: readonly Point[][]): Point[][] => alignTo(runs, []);

/** The lowest and highest value inside the interval over every trace; null without any. */
export function rangeOf(traces: readonly Point[][][], i: Interval): Range | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const runs of traces) {
    for (const run of runs) {
      for (const p of run) {
        if (p.t < i.from || p.t > i.to) continue;
        lo = Math.min(lo, p.v);
        hi = Math.max(hi, p.v);
      }
    }
  }
  return lo <= hi ? { lo, hi } : null;
}

/** Where a value falls down a lane, the pads kept clear at the top and the bottom; midway between them for a flat range. */
export function yOf(
  v: number,
  r: Range,
  height: number,
  padTop: number,
  padBottom: number,
): number {
  const span = height - padTop - padBottom;
  if (r.hi === r.lo) return padTop + span / 2;
  return height - padBottom - ((v - r.lo) / (r.hi - r.lo)) * span;
}

/** The gaps between the stretches of reports, cut to the interval. */
export function gapsIn(samples: readonly Sample[], i: Interval): Interval[] {
  const out: Interval[] = [];
  let previous: Sample | undefined;
  for (const stretch of stretches(samples)) {
    const first = stretch[0];
    if (previous && first) {
      const from = Math.max(previous.t, i.from);
      const to = Math.min(first.t, i.to);
      if (from < to) out.push({ from, to });
    }
    previous = stretch.at(-1);
  }
  return out;
}

/** The sample inside the interval nearest in time to `t`; null without any. */
export function nearestSample(samples: readonly Sample[], t: number, i: Interval): Sample | null {
  return nearestInTime(
    samples.filter((s) => s.t >= i.from && s.t <= i.to),
    t,
  );
}

export interface Bar {
  name: string;
  /** The stretches during which the name was reported. */
  on: Interval[];
}

/**
 * A bar per name reported, in order of first report: each stretch runs from the sample that
 * first reports the name to the last that does before one that does not, or a gap.
 */
export function barsOf(
  samples: readonly Sample[],
  names: (s: Sample) => readonly string[] | undefined,
): Bar[] {
  const bars = new Map<string, Bar>();
  for (const stretch of stretches(samples)) {
    let previous: Sample | undefined;
    for (const s of stretch) {
      for (const name of names(s) ?? []) {
        const bar = bars.get(name) ?? { name, on: [] };
        bars.set(name, bar);
        const open = bar.on.at(-1);
        if (open && previous && open.to === previous.t) open.to = s.t;
        else bar.on.push({ from: s.t, to: s.t });
      }
      previous = s;
    }
  }
  return [...bars.values()];
}

export type BarbMark = 'pennant' | 'full' | 'half';

/** The marks of a wind barb, as the station plot draws them: a pennant per 50 kt, a barb per 10, a half barb for 5. */
export function barbMarks(speedKt: number): BarbMark[] {
  let left = Math.round(speedKt / 5) * 5;
  const marks: BarbMark[] = [];
  for (; left >= 50; left -= 50) marks.push('pennant');
  for (; left >= 10; left -= 10) marks.push('full');
  if (left >= 5) marks.push('half');
  return marks;
}
