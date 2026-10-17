import type { HeardKey } from '../../lib/aircraft';
import { STALE_SECONDS } from '../../render/scene/rules';
import { type Interval, timeAt } from '../../state/span';
import type { Sample } from '../../state/track';

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

/** When a reading made of the values `keys` was heard: when the oldest of them was; undefined unless one was. */
export function heardAt(s: Sample, keys: readonly HeardKey[]): number | undefined {
  const instants = keys.flatMap((key) => s.heard[key] ?? []);
  return instants.length > 0 ? Math.min(...instants) : undefined;
}

/** Whether the reading made of `keys` was heard no further than the gap from `t`; always, without keys. */
export function heardNear(s: Sample, keys: readonly HeardKey[], t: number): boolean {
  if (keys.length === 0) return true;
  const at = heardAt(s, keys);
  return at !== undefined && Math.abs(t - at) <= GAP_SEC;
}

/**
 * The runs of points a trace joins: consecutive samples of a stretch that carry the reading. With
 * the `heard` instants of the reading, only a sample with a new report of it, heard within the gap
 * of the sample, is a point, and a run breaks where the reading went unheard longer than the gap.
 */
export function runsOf(
  samples: readonly Sample[],
  read: Read,
  i: Interval,
  heard: readonly HeardKey[] = [],
): Point[][] {
  const runs: Point[][] = [];
  for (const stretch of stretches(around(samples, i))) {
    let run: Point[] = [];
    let last: number | undefined;
    const end = () => {
      if (run.length > 0) runs.push(run);
      run = [];
    };
    for (const s of stretch) {
      const v = read(s);
      const at = heard.length > 0 ? heardAt(s, heard) : s.t;
      if (v === undefined) {
        end();
        continue;
      }
      if (at === undefined || at === last || !heardNear(s, heard, s.t)) continue;
      if (last !== undefined && at - last > GAP_SEC) end();
      run.push({ t: s.t, v });
      last = at;
    }
    end();
  }
  return runs;
}

/** The value at time `t` along the segment from `a` to `b`. */
const crossing = (a: Point, b: Point, t: number): number =>
  a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t);

/**
 * The lowest and highest value over every trace inside the interval, the values at its edges
 * counted where a segment crosses them, so a trace entering steeply stays within the lane; null
 * without any.
 */
export function rangeOf(traces: readonly Point[][][], i: Interval): Range | null {
  let lo = Infinity;
  let hi = -Infinity;
  const take = (v: number) => {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  };
  for (const runs of traces) {
    for (const run of runs) {
      run.forEach((p, k) => {
        if (p.t >= i.from && p.t <= i.to) take(p.v);
        const q = run[k + 1];
        if (!q) return;
        for (const edge of [i.from, i.to]) if (p.t < edge && q.t > edge) take(crossing(p, q, edge));
      });
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

/** How many of the samples, oldest first, come before `t`, or at it too when `through`. */
function countBefore(samples: readonly Sample[], t: number, through = false): number {
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const st = samples[mid]?.t ?? Infinity;
    if (st < t || (through && st === t)) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * The sample inside the interval nearest in time to `t`, the earlier of two as near; null without
 * any. The samples are oldest first.
 */
export function nearestSample(samples: readonly Sample[], t: number, i: Interval): Sample | null {
  const start = countBefore(samples, i.from);
  const end = countBefore(samples, i.to, true);
  const k = Math.min(Math.max(countBefore(samples, t), start), end);
  const before = k > start ? samples[k - 1] : undefined;
  const after = k < end ? samples[k] : undefined;
  if (!before || !after) return before ?? after ?? null;
  return t - before.t <= after.t - t ? before : after;
}

/** The sample inside the interval nearest the time a point `px` across a plot `width` wide stands for; null without any. */
export function sampleAt(
  samples: readonly Sample[],
  px: number,
  i: Interval,
  width: number,
): Sample | null {
  return nearestSample(samples, timeAt(px, i, width), i);
}

/** Where the cursor rests: a sample, and whether it is the contact's latest. */
export interface Rest {
  sample: Sample;
  current: boolean;
}

/** The last sample inside the interval, where the cursor rests; null without any. The samples are oldest first. */
export function restSample(samples: readonly Sample[], i: Interval): Rest | null {
  const end = countBefore(samples, i.to, true);
  const sample = end > countBefore(samples, i.from) ? samples[end - 1] : undefined;
  return sample ? { sample, current: end === samples.length } : null;
}

/** Whether the interval holds every sample, oldest first; true of none. */
export function seesAll(i: Interval, samples: readonly Sample[]): boolean {
  const first = samples[0];
  const last = samples.at(-1);
  return !first || !last || (i.from <= first.t && i.to >= last.t);
}

export interface Bar {
  name: string;
  /** The stretches during which the name was reported. */
  on: Interval[];
}

/**
 * A bar per name reported, in order of first report: each stretch runs from the sample that
 * first reports the name to the last that does before one that does not, or a gap. With the
 * `heard` instants of the names, a sample whose names went unheard longer than the gap reports none.
 */
export function barsOf(
  samples: readonly Sample[],
  names: (s: Sample) => readonly string[] | undefined,
  heard: readonly HeardKey[] = [],
): Bar[] {
  const bars = new Map<string, Bar>();
  for (const stretch of stretches(samples)) {
    let previous: Sample | undefined;
    for (const s of stretch) {
      const named = heardNear(s, heard, s.t) ? names(s) : undefined;
      for (const name of named ?? []) {
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
