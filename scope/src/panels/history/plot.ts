import { nearestInTime } from '../../lib/nearest';
import { RAD } from '../../lib/units';
import type { ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { type Dash, type Heading, minSpanOf, PLOTS } from './plots';
import type { Interval } from './span';
import {
  barbMarks,
  GAP_SEC,
  type Point,
  type Range,
  rangeOf,
  type Read,
  runsOf,
  widened,
} from './trace';

/** A number as an SVG attribute: a tenth of a pixel is precision enough. */
export const fixed = (n: number): string => n.toFixed(1);

export interface LaneTrace {
  key: ReadingKey;
  runs: Point[][];
  dash?: Dash | undefined;
  /** Drawn along the lane's floor, off its scale: the values of its points mean nothing. */
  floor?: true;
  /** What the aircraft is set to do, not what it does. */
  intent?: true;
}

/**
 * The traces of a lane, `keys` being its own reading then the intents drawn in it: the own
 * reading first, its stretches along the floor, the second line of a pair with its dash, then each
 * intent with its dash. None for a lane of another kind.
 */
export function laneTraces(
  samples: readonly Sample[],
  keys: readonly ReadingKey[],
  visible: Interval,
): LaneTrace[] {
  const [lane, ...intents] = keys;
  if (lane === undefined) return [];
  const own = PLOTS[lane];
  if (own.kind !== 'line' && own.kind !== 'pair') return [];
  const read = (y: Read) => runsOf(samples, y, visible);
  const floor = own.kind === 'line' ? own.floor : undefined;
  const floorRuns = floor ? read((s) => (floor(s) ? 0 : undefined)) : [];
  const floored: LaneTrace[] =
    floorRuns.length > 0 ? [{ key: lane, runs: floorRuns, floor: true }] : [];
  const second = own.kind === 'pair' ? [{ key: lane, runs: read(own.y2), dash: own.dash }] : [];
  const drawn = intents.flatMap((key) => {
    const spec = PLOTS[key];
    if (spec.kind !== 'intent') return [];
    return [{ key, runs: read(spec.y), dash: spec.dash, intent: true as const }];
  });
  return [{ key: lane, runs: read(own.y) }, ...floored, ...second, ...drawn];
}

/** The one scale of a lane's traces off its floor over the interval, at least its least span; null without any. */
export function laneRange(
  traces: readonly LaneTrace[],
  lane: ReadingKey,
  visible: Interval,
): Range | null {
  const r = rangeOf(
    traces.filter((tr) => !tr.floor).map((tr) => tr.runs),
    visible,
  );
  return r && widened(r, minSpanOf(lane) ?? 0);
}

/** The path of the runs across a lane, each run its own subpath. */
export function pathOf(
  runs: readonly Point[][],
  x: (t: number) => number,
  y: (v: number) => number,
): string {
  return runs
    .map((run) => run.map((p, i) => `${i ? 'L' : 'M'}${fixed(x(p.t))} ${fixed(y(p.v))}`).join(' '))
    .join(' ');
}

/** The value of a trace at a sample time; undefined where the trace has none. */
export function valueAt(runs: readonly Point[][], t: number): number | undefined {
  for (const run of runs) {
    for (const p of run) if (p.t === t) return p.v;
  }
  return undefined;
}

/** Samples to read a tick from rather than the nearest, while one lies within reach of it. */
export interface Preference {
  has: (s: Sample) => boolean;
  withinSec: number;
}

/**
 * One reading per tick, from the sample nearest it or the nearest one preferred, unless that lies
 * a gap away or lacks it.
 */
export function atTicks<T extends object>(
  samples: readonly Sample[],
  ticks: readonly number[],
  read: (s: Sample) => T | undefined,
  prefer?: Preference,
): (T & { t: number })[] {
  const preferred = prefer ? samples.filter(prefer.has) : [];
  return ticks.flatMap((t) => {
    const near = nearestInTime(preferred, t);
    const s =
      prefer && near && Math.abs(near.t - t) <= prefer.withinSec ? near : nearestInTime(samples, t);
    const value = s && Math.abs(s.t - t) <= GAP_SEC ? read(s) : undefined;
    return value ? [{ ...value, t }] : [];
  });
}

const CALM_RADIUS = 3;
const FULL_PX = 6;
const HALF_PX = 3;
const MARK_STEP_PX = 3;
const PENNANT_STEP_PX = 4.5;

/**
 * A wind barb at (x, y), north up: the staff runs toward where the wind comes from, its marks
 * hang from the tip. Calm is a circle.
 */
export function barbPath(x: number, y: number, dirDeg: number, speedKt: number, lengthPx: number) {
  const marks = barbMarks(speedKt);
  if (marks.length === 0) {
    const r = CALM_RADIUS;
    return `M${fixed(x + r)} ${fixed(y)} a${r} ${r} 0 1 0 ${-2 * r} 0 a${r} ${r} 0 1 0 ${2 * r} 0`;
  }
  const ux = Math.sin(dirDeg * RAD);
  const uy = -Math.cos(dirDeg * RAD);
  const px = -uy;
  const py = ux;
  const along = (d: number) => `${fixed(x + ux * d)} ${fixed(y + uy * d)}`;
  let d = `M${fixed(x)} ${fixed(y)} L${along(lengthPx)} `;
  let pos = lengthPx;
  for (const mark of marks) {
    if (mark === 'pennant') {
      const base = pos - PENNANT_STEP_PX;
      d += `M${along(pos)} L${fixed(x + ux * pos + px * FULL_PX)} ${fixed(y + uy * pos + py * FULL_PX)} L${along(base)} Z `;
      pos = base;
      continue;
    }
    // A lone half barb sits one step in, so it is not taken for the tip.
    if (mark === 'half' && pos === lengthPx) pos -= MARK_STEP_PX;
    const len = mark === 'full' ? FULL_PX : HALF_PX;
    d += `M${along(pos)} l${fixed(px * len)} ${fixed(py * len)} `;
    pos -= MARK_STEP_PX;
  }
  return d.trim();
}

/** The aircraft, nose to tail, in px. */
const AIRCRAFT_PX = 22;
/** How far the track runs out of the aircraft's centre, past its nose. */
const VECTOR_PX = 19;
/** Half the length of the track's own arrow, and its head's length and half width. */
const ARROW_PX = 13;
const HEAD_PX = 5;
const HEAD_HALF_PX = 3.2;
/** How far a glyph reaches round its point at the most: the track out of the aircraft. */
export const GLYPH_REACH_PX = VECTOR_PX;

/** A point `a` out from (x, y) along `deg` and `c` across it to the right, north up. */
const offset =
  (x: number, y: number, deg: number) =>
  (a: number, c = 0): [number, number] => {
    const ux = Math.sin(deg * RAD);
    const uy = -Math.cos(deg * RAD);
    return [x + ux * a - uy * c, y + uy * a + ux * c];
  };

/** The same as an SVG pair. */
const toward = (x: number, y: number, deg: number) => {
  const at = offset(x, y, deg);
  return (a: number, c = 0): string => at(a, c).map(fixed).join(' ');
};

export interface HeadingGlyph {
  /** The aircraft along its heading, when known. */
  aircraft?: string;
  /** The track out of the aircraft's centre. */
  vector?: string;
  /** The track as an arrow of its own, without the aircraft. */
  arrow?: string;
}

/**
 * Where the aircraft points and where it goes, at (x, y): the aircraft along the heading with the
 * track running out of it, so a crab shows as the nose off the track; the track alone as an arrow.
 */
export function headingGlyph(x: number, y: number, h: Heading): HeadingGlyph {
  if (h.hdg !== undefined) return aircraftOf(x, y, h.hdg, h.trk);
  return h.trk === undefined ? {} : { arrow: arrowOf(x, y, h.trk) };
}

function arrowOf(x: number, y: number, trk: number): string {
  const at = toward(x, y, trk);
  const base = ARROW_PX - HEAD_PX;
  return `M${at(-ARROW_PX)} L${at(base)} M${at(ARROW_PX)} L${at(base, -HEAD_HALF_PX)} L${at(base, HEAD_HALF_PX)} Z`;
}

function aircraftOf(x: number, y: number, hdg: number, trk: number | undefined): HeadingGlyph {
  // In elevenths of its length: the fuselage, the wings a little ahead of the centre, the tailplane.
  const unit = AIRCRAFT_PX / 11;
  const at = toward(x, y, hdg);
  const of = (a: number, c = 0) => at(a * unit, c * unit);
  const aircraft = `M${of(5.5)} L${of(-5.5)} M${of(1, -5)} L${of(1, 5)} M${of(-4.5, -2.2)} L${of(-4.5, 2.2)}`;
  if (trk === undefined) return { aircraft };
  return { aircraft, vector: `M${at(0)} L${toward(x, y, trk)(VECTOR_PX)}` };
}
