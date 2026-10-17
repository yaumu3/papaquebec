import type { HeardKey } from '../../lib/aircraft';
import { BOUND_NM_FROM_M, BOUND_ROUNDED_UP_BY_M } from '../../lib/format';
import { NM_IN_METERS } from '../../lib/geo';
import { nearestInTime } from '../../lib/nearest';
import { RAD } from '../../lib/units';
import { laneOf, type ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { type Reading, READINGS } from '../readings';
import { type Dash, HEARD, type Heading, PLOTS } from './plots';
import type { Interval } from './span';
import {
  barbMarks,
  GAP_SEC,
  heardNear,
  type Point,
  type Range,
  rangeOf,
  type Read,
  runsOf,
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
  const read = (y: Read, key: ReadingKey = lane) => runsOf(samples, y, visible, HEARD[key]);
  const floor = own.kind === 'line' ? own.floor : undefined;
  const floorRuns = floor ? read((s) => (floor(s) ? 0 : undefined)) : [];
  const floored: LaneTrace[] =
    floorRuns.length > 0 ? [{ key: lane, runs: floorRuns, floor: true }] : [];
  const second = own.kind === 'pair' ? [{ key: lane, runs: read(own.y2), dash: own.dash }] : [];
  const drawn = intents.flatMap((key) => {
    const spec = PLOTS[key];
    if (spec.kind !== 'intent') return [];
    return [{ key, runs: read(spec.y, key), dash: spec.dash, intent: true as const }];
  });
  return [{ key: lane, runs: read(own.y) }, ...floored, ...second, ...drawn];
}

/** The one scale of a lane's traces off its floor over the interval, snapped to its quantum; null without any. */
export function laneRange(
  traces: readonly LaneTrace[],
  lane: ReadingKey,
  visible: Interval,
): Range | null {
  const r = rangeOf(
    traces.filter((tr) => !tr.floor).map((tr) => tr.runs),
    visible,
  );
  return r && snapped(r, lane);
}

/** Slack for the float error of a value that falls on a step. */
const EPS = 1e-9;

/** A number without the float error of the arithmetic that made it. */
const clean = (n: number): number => Number(n.toPrecision(12));

/** 1, 2 and 5 times each power of ten from 10⁻¹ to 10⁴. */
const ROUND = [-1, 0, 1, 2, 3, 4].flatMap((n) => [1, 2, 5].map((m) => clean(m * 10 ** n)));

/** The round bounds in metres, as they read: in metres below a tenth of a mile, in miles from there. */
const BOUNDS_M = [
  ...ROUND.filter((m) => m < BOUND_NM_FROM_M),
  ...ROUND.map((nm) => clean(nm * NM_IN_METERS)).filter((m) => m >= BOUND_NM_FROM_M),
];

/** Whether a bound in metres reads as no more than the round bound `round`, the tracker's rounding up allowed for in miles. */
const within = (m: number, round: number): boolean =>
  m <= round * (1 + EPS) + (round >= BOUND_NM_FROM_M ? BOUND_ROUNDED_UP_BY_M : 0);

/**
 * The range spread outward to multiples of the lane's quantum, in the unit its reading is shown
 * in, or on a lane of bounds on a log scale to the nearest round bounds; one step taller when it
 * would have none, a flat line on a step lying along the bottom.
 */
export function snapped(r: Range, lane: ReadingKey): Range {
  const spec = PLOTS[laneOf(lane)];
  if (spec.kind !== 'line' && spec.kind !== 'pair') return r;
  if (spec.log) {
    const lo = BOUNDS_M.findLast((m) => m <= 10 ** r.lo * (1 + EPS)) ?? 10 ** r.lo;
    const at = BOUNDS_M.findIndex((m) => within(10 ** r.hi, m));
    const top = BOUNDS_M[at] ?? 10 ** r.hi;
    const hi = top === lo ? (BOUNDS_M[at + 1] ?? top) : top;
    return { lo: Math.log10(lo), hi: Math.log10(hi) };
  }
  const q = spec.quantum;
  const lo = clean(Math.floor(r.lo / q + EPS) * q);
  const hi = clean(Math.ceil(r.hi / q - EPS) * q);
  return { lo, hi: hi === lo ? clean(lo + q) : hi };
}

/** A value on a lane's scale, and how it reads. */
export interface ScaleLabel {
  v: number;
  text: string;
}

/** The metres a power of ten stands for, to six figures, as a bound reads them. */
const metresOf = (v: number): number => Number((10 ** v).toPrecision(6));

/** Whether a reading is drawn on a log scale, as a bound. */
const isLog = (key: ReadingKey): boolean => {
  const spec = PLOTS[key];
  return spec.kind === 'line' && spec.log === true;
};

/** A reading's value as a lane prints it: with its unit only on a log lane, where the unit changes along it. */
export const plotText = (key: ReadingKey, r: Reading): string =>
  isLog(key) && r.unit ? `${r.v} ${r.unit}` : r.v;

/**
 * The top and bottom of a lane's scale as its reading reads them, bounds on a log scale with
 * their unit, which changes along it; none for a lane without a scale.
 */
export function scaleLabels(lane: ReadingKey, r: Range): ScaleLabel[] {
  const spec = PLOTS[lane];
  const value = READINGS[lane].value;
  if (!value || (spec.kind !== 'line' && spec.kind !== 'pair')) return [];
  return [r.hi, r.lo].map((v) => ({
    v,
    text: plotText(lane, value(isLog(lane) ? metresOf(v) : v)),
  }));
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

/** Samples to read a tick from rather than the nearest, while one lies within reach of it. */
export interface Preference {
  has: (s: Sample) => boolean;
  withinSec: number;
}

/**
 * One reading per tick, from the sample nearest it or the nearest one preferred, unless that lies
 * a gap away or lacks it, or its reading, of the `heard` instants, was heard a gap away. A
 * preferred sample a gap away gives way to the nearest, however far the preference reaches.
 */
export function atTicks<T extends object>(
  samples: readonly Sample[],
  ticks: readonly number[],
  read: (s: Sample) => T | undefined,
  prefer?: Preference,
  heard: readonly HeardKey[] = [],
): (T & { t: number })[] {
  const preferred = prefer ? samples.filter(prefer.has) : [];
  const reach = Math.min(prefer?.withinSec ?? 0, GAP_SEC);
  return ticks.flatMap((t) => {
    const near = nearestInTime(preferred, t);
    const s = near && Math.abs(near.t - t) <= reach ? near : nearestInTime(samples, t);
    const value = s && Math.abs(s.t - t) <= GAP_SEC && heardNear(s, heard, t) ? read(s) : undefined;
    return value ? [{ ...value, t }] : [];
  });
}

const CALM_RADIUS = 3;
const FULL_PX = 6;
const HALF_PX = 3;
const MARK_STEP_PX = 3;
const PENNANT_STEP_PX = 4.5;
/** At least half the widest stroke a mark is drawn with, which sticks out past its path. */
const STROKE_HALF_PX = 1;

/** How far a barb with a staff `lengthPx` long reaches round its point: a full barb at the tip. */
export const barbReach = (lengthPx: number): number =>
  Math.hypot(lengthPx, FULL_PX) + STROKE_HALF_PX;

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
/** The arc to the selected heading, just clear of the nose, and the dot there once it holds. */
const TO_GO_PX = AIRCRAFT_PX / 2 + 2.5;
const HELD_PX = TO_GO_PX + 0.5;
const HELD_DOT_PX = 2.2;
/** The selection's tick past the head of the track's own arrow, from and to. */
const TICK_FROM_PX = ARROW_PX + 3;
const TICK_TO_PX = ARROW_PX + 6.5;
/** Within this of the selected heading, the heading holds it: off by 3° or more, it is turning. */
const HOLD_DEG = 3;
/** How far a glyph reaches round its point at the most: the track, or the tick past its arrow, with its stroke. */
export const GLYPH_REACH_PX = Math.max(VECTOR_PX, TICK_TO_PX) + STROKE_HALF_PX;

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

/** To a tenth, as precise as the drawing. */
const tenth = (n: number): number => Math.round(n * 10) / 10;

/** Degrees from `from` round to `to` the short way, to the right positive. */
const turn = (from: number, to: number): number => ((to - from + 540) % 360) - 180;

/** The heading glyph's readings: the track and heading, and the selected heading while it steers. */
export interface HeadingMark extends Heading {
  sel?: number | undefined;
}

export interface HeadingGlyph {
  /** The aircraft along its heading, when known. */
  aircraft?: string;
  /** The track out of the aircraft's centre. */
  vector?: string;
  /** The track as an arrow of its own, without the aircraft. */
  arrow?: string;
  /** The turn still to go to the selected heading, round from the nose either way. */
  toGo?: string;
  /** Ahead of the nose, once the heading holds the selection. */
  held?: { cx: number; cy: number; r: number };
  /** The selection past the arrow's head, when the heading is unknown and so is whether it holds. */
  tick?: string;
}

/**
 * Where the aircraft points and where it goes, at (x, y): the aircraft along the heading with the
 * track running out of it, so a crab shows as the nose off the track, and the turn still to go
 * to the selected heading; the track alone as an arrow, the selection a tick past its head.
 */
export function headingGlyph(x: number, y: number, h: HeadingMark): HeadingGlyph {
  if (h.hdg !== undefined)
    return { ...aircraftOf(x, y, h.hdg, h.trk), ...selectionOf(x, y, h.hdg, h.sel) };
  if (h.trk === undefined) return {};
  const arrow = arrowOf(x, y, h.trk);
  if (h.sel === undefined) return { arrow };
  const at = toward(x, y, h.sel);
  return { arrow, tick: `M${at(TICK_FROM_PX)} L${at(TICK_TO_PX)}` };
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

function selectionOf(x: number, y: number, hdg: number, sel: number | undefined): HeadingGlyph {
  if (sel === undefined) return {};
  const go = turn(hdg, sel);
  if (Math.abs(go) < HOLD_DEG) {
    const [cx, cy] = offset(x, y, hdg)(HELD_PX);
    return { held: { cx: tenth(cx), cy: tenth(cy), r: HELD_DOT_PX } };
  }
  const r = TO_GO_PX;
  return {
    toGo: `M${toward(x, y, hdg)(r)} A${r} ${r} 0 0 ${go > 0 ? 1 : 0} ${toward(x, y, sel)(r)}`,
  };
}
