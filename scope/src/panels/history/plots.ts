import { epuM } from '../../lib/accuracy';
import type { HeardKey } from '../../lib/aircraft';
import { crewAltitudeFt } from '../../lib/altitude';
import { steeringHeading } from '../../lib/autopilot';
import { modeNames, sourceName } from '../../lib/format';
import { magneticTrack } from '../../state/magnetic';
import { laneOf, type ReadingKey } from '../../state/plotted';
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

/**
 * How a reading is drawn: a lane of its own, as a line, a pair of lines with the second dashed or
 * dotted, gantt bars, wind barbs or heading glyphs; or an intent, in its parent's lane: a line
 * with its dash on that lane's scale, or on the lane's glyphs, where the dash goes unused.
 */
export type PlotSpec =
  | {
      kind: 'line';
      y: Read;
      /** The least range the lane's scale spans, in what `y` reads. */
      minSpan: number;
      /** Whether a sample has no value yet a state to show, drawn along the lane's floor. */
      floor?: (s: Sample) => boolean;
    }
  | { kind: 'pair'; y: Read; y2: Read; dash: Dash; minSpan: number }
  | { kind: 'gantt'; names: (s: Sample) => readonly string[] | undefined }
  | { kind: 'barbs'; barb: (s: Sample) => Wind | undefined }
  | { kind: 'heading'; heading: (s: Sample) => Heading | undefined }
  | { kind: 'intent'; y: Read; dash: Dash };

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

/** A bound in metres on a log scale: its power of ten, so each factor of ten takes the same height. */
const logOf = (m: number | undefined): number | undefined =>
  m === undefined ? undefined : Math.log10(m);

/** How each reading is drawn; `laneOf` in `state/plotted.ts` says which lane an intent goes in. */
export const PLOTS: Record<ReadingKey, PlotSpec> = {
  // As the crew reads it, so that an aircraft holding its selected altitude sits on that line.
  alt: {
    kind: 'line',
    y: (s) => crewAltitudeFt(s, settings.altimeter),
    minSpan: 1000,
    floor: (s) => s.alt === 'ground',
  },
  selAlt: { kind: 'intent', y: (s) => s.selAlt, dash: 'dashed' },
  fmsAlt: { kind: 'intent', y: (s) => s.fmsAlt, dash: 'dotted' },
  vs: { kind: 'line', y: (s) => s.verticalRate, minSpan: 1000 },
  trk: { kind: 'heading', heading },
  selHdg: { kind: 'intent', y: steeringHeading, dash: 'dashed' },
  gs: { kind: 'line', y: (s) => s.gs, minSpan: 20 },
  qnh: { kind: 'line', y: (s) => s.navQnh, minSpan: 4 },
  modes: { kind: 'gantt', names: (s) => s.navModes && modeNames(s.navModes) },
  ias: { kind: 'line', y: (s) => s.ias, minSpan: 20 },
  tas: { kind: 'line', y: (s) => s.tas, minSpan: 20 },
  mach: { kind: 'line', y: (s) => s.mach, minSpan: 0.04 },
  wind: { kind: 'barbs', barb: wind },
  oat: { kind: 'line', y: (s) => s.oat, minSpan: 5 },
  tat: { kind: 'line', y: (s) => s.tat, minSpan: 5 },
  nic: { kind: 'line', y: (s) => logOf(s.rc), minSpan: 1 },
  nacp: {
    kind: 'line',
    y: (s) => logOf(s.nacP === undefined ? undefined : epuM(s.nacP)),
    minSpan: 1,
  },
  src: { kind: 'gantt', names: (s) => [sourceName(s.source)] },
  rssi: { kind: 'line', y: (s) => s.rssi, minSpan: 6 },
  msgs: { kind: 'line', y: (s) => s.messageRate, minSpan: 4 },
  age: { kind: 'pair', y: (s) => s.seen, y2: (s) => s.seenPos, dash: 'dashed', minSpan: 5 },
};

/** The values each reading is made of, by the instants they are heard at; none for the reception's own. */
export const HEARD: Record<ReadingKey, readonly HeardKey[]> = {
  alt: ['alt'],
  selAlt: ['selAlt'],
  fmsAlt: ['fmsAlt'],
  vs: ['verticalRate'],
  trk: ['track', 'heading'],
  selHdg: ['selHeading'],
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

/** The least span of the scale `key` is drawn on: its lane's, none for a lane of bars, barbs or glyphs. */
export function minSpanOf(key: ReadingKey): number | undefined {
  const spec = PLOTS[laneOf(key)];
  return spec.kind === 'line' || spec.kind === 'pair' ? spec.minSpan : undefined;
}
