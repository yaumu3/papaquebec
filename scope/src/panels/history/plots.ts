import { crewAltitudeFt } from '../../lib/altitude';
import { modeNames, sourceName } from '../../lib/format';
import { magneticTrack } from '../../state/magnetic';
import type { ReadingKey } from '../../state/plotted';
import { settings } from '../../state/settings';
import type { Sample } from '../../state/track';
import type { Read } from './trace';

export interface Wind {
  dir: number;
  speed: number;
}

export type Dash = 'dashed' | 'dotted';

/**
 * How a reading is drawn: a lane of its own, as a line, a pair of lines, gantt bars or wind
 * barbs; or an intent, a dashed line in its parent's lane on that lane's scale.
 */
export type PlotSpec =
  | {
      kind: 'line';
      y: Read;
      angular?: true;
      /** Whether a sample has no value yet a state to show, drawn along the lane's floor. */
      floor?: (s: Sample) => boolean;
    }
  | { kind: 'pair'; y: Read; y2: Read }
  | { kind: 'gantt'; names: (s: Sample) => readonly string[] | undefined }
  | { kind: 'barbs'; barb: (s: Sample) => Wind | undefined }
  | { kind: 'intent'; y: Read; dash: Dash; angular?: true };

const wind = (s: Sample): Wind | undefined =>
  s.windDir === undefined || s.windSpeed === undefined
    ? undefined
    : { dir: s.windDir, speed: s.windSpeed };

/** How each reading is drawn; `laneOf` in `state/plotted.ts` says which lane an intent goes in. */
export const PLOTS: Record<ReadingKey, PlotSpec> = {
  // As the crew reads it, so that an aircraft holding its selected altitude sits on that line.
  alt: {
    kind: 'line',
    y: (s) => crewAltitudeFt(s, settings.altimeter),
    floor: (s) => s.alt === 'ground',
  },
  selAlt: { kind: 'intent', y: (s) => s.selAlt, dash: 'dashed' },
  fmsAlt: { kind: 'intent', y: (s) => s.fmsAlt, dash: 'dotted' },
  vs: { kind: 'line', y: (s) => s.verticalRate },
  trk: { kind: 'line', y: magneticTrack, angular: true },
  selHdg: { kind: 'intent', y: (s) => s.selHeading, dash: 'dashed', angular: true },
  gs: { kind: 'line', y: (s) => s.gs },
  qnh: { kind: 'line', y: (s) => s.navQnh },
  modes: { kind: 'gantt', names: (s) => s.navModes && modeNames(s.navModes) },
  ias: { kind: 'line', y: (s) => s.ias },
  tas: { kind: 'line', y: (s) => s.tas },
  mach: { kind: 'line', y: (s) => s.mach },
  wind: { kind: 'barbs', barb: wind },
  oat: { kind: 'line', y: (s) => s.oat },
  tat: { kind: 'line', y: (s) => s.tat },
  nic: { kind: 'line', y: (s) => s.nic },
  nacp: { kind: 'line', y: (s) => s.nacP },
  src: { kind: 'gantt', names: (s) => [sourceName(s.source)] },
  rssi: { kind: 'line', y: (s) => s.rssi },
  msgs: { kind: 'line', y: (s) => s.messageRate },
  age: { kind: 'pair', y: (s) => s.seen, y2: (s) => s.seenPos },
};
