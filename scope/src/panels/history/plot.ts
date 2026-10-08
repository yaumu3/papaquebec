import { nearestInTime } from '../../lib/nearest';
import { RAD } from '../../lib/units';
import type { ReadingKey } from '../../state/plotted';
import type { Sample } from '../../state/track';
import { type Dash, PLOTS, type Wind } from './plots';
import type { Interval } from './span';
import { alignTo, barbMarks, GAP_SEC, type Point, type Read, runsOf, unwrap } from './trace';

/** A number as an SVG attribute: a tenth of a pixel is precision enough. */
export const fixed = (n: number): string => n.toFixed(1);

export interface LaneTrace {
  key: ReadingKey;
  runs: Point[][];
  dash?: Dash | undefined;
  /** Drawn along the lane's floor, off its scale: the values of its points mean nothing. */
  floor?: true;
}

/**
 * The traces of a lane, `keys` being its own reading then the intents drawn in it: the own
 * reading first, its stretches along the floor, the second line of a pair with its dash, then each
 * intent with its dash. Degrees are unwrapped and the intents aligned to them. None for a lane
 * of another kind.
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
  const angular = (own.kind === 'line' || own.kind === 'pair') && own.angular === true;
  const ownRuns = angular ? unwrap(read(own.y)) : read(own.y);
  const floor = own.kind === 'line' ? own.floor : undefined;
  const floorRuns = floor ? read((s) => (floor(s) ? 0 : undefined)) : [];
  const floored: LaneTrace[] =
    floorRuns.length > 0 ? [{ key: lane, runs: floorRuns, floor: true }] : [];
  const second =
    own.kind === 'pair'
      ? [
          {
            key: lane,
            runs: angular ? alignTo(read(own.y2), ownRuns) : read(own.y2),
            dash: own.dash,
          },
        ]
      : [];
  const drawn = intents.flatMap((key) => {
    const spec = PLOTS[key];
    if (spec.kind !== 'intent') return [];
    const runs = read(spec.y);
    return [{ key, runs: angular ? alignTo(runs, ownRuns) : runs, dash: spec.dash }];
  });
  return [{ key: lane, runs: ownRuns }, ...floored, ...second, ...drawn];
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

export interface Barb extends Wind {
  t: number;
}

/** One wind per tick, read from the sample nearest it, unless that lies a gap away. */
export function barbsAt(
  samples: readonly Sample[],
  ticks: readonly number[],
  barb: (s: Sample) => Wind | undefined,
): Barb[] {
  return ticks.flatMap((t) => {
    const s = nearestInTime(samples, t);
    const wind = s && Math.abs(s.t - t) <= GAP_SEC ? barb(s) : undefined;
    return wind ? [{ t, ...wind }] : [];
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
