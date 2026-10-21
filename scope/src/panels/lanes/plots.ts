import { epuM } from '../../lib/accuracy';
import type { HeardKey } from '../../lib/aircraft';
import { crewAltitudeFt } from '../../lib/altitude';
import { steeringHeading } from '../../lib/autopilot';
import { modeNames, sourceName } from '../../lib/format';
import { HPA_PER_INHG } from '../../lib/units';
import { magneticTrack } from '../../state/magnetic';
import type { ReadingKey } from '../../state/plotted';
import { settings } from '../../state/settings';
import type { Sample } from '../../state/track';
import type { Read } from './trace';

export interface Wind {
  dir: number;
  speed: number;
}

/** Where the aircraft goes and where it points, magnetic degrees. */
export interface Heading {
  trk: number | undefined;
  hdg: number | undefined;
}

export type Dash = 'dashed' | 'dotted';

/** A scale bounded on multiples of a step. */
interface Quantized {
  /** The step the lane's scale is bounded on, in the unit the reading is shown in. */
  quantum: number;
  log?: never;
}

/** A scale of bounds in metres, `y` reading the power of ten of each. */
interface Logarithmic {
  log: true;
  quantum?: never;
}

/**
 * How a reading is drawn: a lane of its own, as a line, a pair of lines with the second dashed or
 * dotted, gantt bars, wind barbs or heading glyphs; or an intent, in its parent's lane: a line,
 * solid or with its dash, on that lane's scale, or on the lane's glyphs, where a dash goes unused.
 */
type PlotSpec =
  | ({
      kind: 'line';
      y: Read;
      /** Whether a sample has no value yet a state to show, drawn along the lane's floor. */
      floor?: (s: Sample) => boolean;
    } & (Quantized | Logarithmic))
  | ({ kind: 'pair'; y: Read; y2: Read; dash: Dash } & Quantized)
  | { kind: 'gantt'; names: (s: Sample) => readonly string[] | undefined }
  | { kind: 'barbs'; barb: (s: Sample) => Wind | undefined }
  | { kind: 'heading'; heading: (s: Sample) => Heading | undefined }
  | { kind: 'intent'; y: Read; dash?: Dash };

const wind = (s: Sample): Wind | undefined =>
  s.windDir === undefined || s.windSpeed === undefined
    ? undefined
    : { dir: s.windDir, speed: s.windSpeed };

/** The track in magnetic, as the table reads it, and the heading as sent. */
const heading = (s: Sample): Heading | undefined => {
  const trk = magneticTrack(s);
  const hdg = s.heading;
  return trk === undefined && hdg === undefined ? undefined : { trk, hdg };
};

/** A pressure in hPa in inHg, unrounded, as the plot is drawn to a fraction of a pixel. */
const inHg = (hpa: number | undefined): number | undefined =>
  hpa === undefined ? undefined : hpa / HPA_PER_INHG;

/** A bound in metres on a log scale: its power of ten, so each factor of ten takes the same height. */
const logOf = (m: number | undefined): number | undefined =>
  m === undefined ? undefined : Math.log10(m);

/** How each reading is drawn; `INTENTS` in `state/plotted.ts` says which lane an intent goes in. */
export const PLOTS: Record<ReadingKey, PlotSpec> = {
  // As the crew reads it, so that an aircraft holding its selected altitude sits on that line.
  alt: {
    kind: 'line',
    y: (s) => crewAltitudeFt(s, settings.altimeter),
    quantum: 1000,
    floor: (s) => s.alt === 'ground',
  },
  selAlt: { kind: 'intent', y: (s) => s.selAlt },
  fmsAlt: { kind: 'intent', y: (s) => s.fmsAlt, dash: 'dotted' },
  vs: { kind: 'line', y: (s) => s.verticalRate, quantum: 500 },
  trk: { kind: 'heading', heading },
  selHdg: { kind: 'intent', y: steeringHeading },
  roll: { kind: 'line', y: (s) => s.roll, quantum: 10 },
  gs: { kind: 'line', y: (s) => s.gs, quantum: 10 },
  qnh: { kind: 'line', y: (s) => inHg(s.navQnh), quantum: 0.01 },
  modes: { kind: 'gantt', names: (s) => s.navModes && modeNames(s.navModes) },
  ias: { kind: 'line', y: (s) => s.ias, quantum: 10 },
  tas: { kind: 'line', y: (s) => s.tas, quantum: 10 },
  mach: { kind: 'line', y: (s) => s.mach, quantum: 0.01 },
  wind: { kind: 'barbs', barb: wind },
  oat: { kind: 'line', y: (s) => s.oat, quantum: 1 },
  tat: { kind: 'line', y: (s) => s.tat, quantum: 1 },
  nic: { kind: 'line', y: (s) => logOf(s.rc), log: true },
  nacp: {
    kind: 'line',
    y: (s) => logOf(s.nacP === undefined ? undefined : epuM(s.nacP)),
    log: true,
  },
  src: { kind: 'gantt', names: (s) => [sourceName(s.source)] },
  rssi: { kind: 'line', y: (s) => s.rssi, quantum: 5 },
  msgs: { kind: 'line', y: (s) => s.messageRate, quantum: 5 },
  age: {
    kind: 'pair',
    y: (s) => s.seen,
    y2: (s) => s.seenPos,
    dash: 'dashed',
    quantum: 1,
  },
};

/** The values each reading is made of, by the instants they are heard at; none for the reception's own. */
export const HEARD: Record<ReadingKey, readonly HeardKey[]> = {
  alt: ['alt'],
  selAlt: ['selAlt'],
  fmsAlt: ['fmsAlt'],
  vs: ['verticalRate'],
  trk: ['track', 'heading'],
  selHdg: ['selHeading'],
  roll: ['roll'],
  gs: ['gs'],
  qnh: ['navQnh'],
  modes: ['navModes'],
  ias: ['ias'],
  tas: ['tas'],
  mach: ['mach'],
  wind: ['windSpeed', 'windDir'],
  oat: ['oat'],
  tat: ['tat'],
  nic: ['nic', 'rc'],
  nacp: ['nacP'],
  src: [],
  rssi: [],
  msgs: [],
  age: [],
};
