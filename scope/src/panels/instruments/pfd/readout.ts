import type { HeardKey } from '../../../lib/aircraft';
import { type Altimeter, crewAltitudeFt, selectedFt } from '../../../lib/altitude';
import { turn } from '../../../lib/geo';
import { hpaToInHg } from '../../../lib/metar';
import { holds, INSTRUMENT_SEC } from '../../../lib/reports';
import { RAD } from '../../../lib/units';
import { magneticTrack } from '../../../state/magnetic';
import type { Readout, Sample, Track } from '../../../state/track';
import { holdsAll, isLost } from '../freshness';
import type { Fpv } from './geometry';

/** The labels the PFD gives the modes, in the order a column shows them when two are engaged. */
const LATERAL_MODES: readonly (readonly [string, string])[] = [
  ['approach', 'APP'],
  ['lnav', 'LNAV'],
];
const VERTICAL_MODES: readonly (readonly [string, string])[] = [
  ['althold', 'ALT HOLD'],
  ['vnav', 'VNAV'],
];

/**
 * How long a column's box stands after its text changed, as Boeing's PFDs box a mode change for
 * 10 seconds.
 */
export const MODE_CHANGE_SEC = 10;

export type FmaColumn = 'lateral' | 'vertical';

export type FmaColumns = Record<FmaColumn, string | undefined>;

const labelOf = (
  modes: readonly string[],
  table: readonly (readonly [string, string])[],
): string | undefined => table.find(([mode]) => modes.includes(mode))?.[1];

/** The lateral and vertical columns of the annunciator for the modes engaged. */
export const fmaColumns = (modes: readonly string[]): FmaColumns => ({
  lateral: labelOf(modes, LATERAL_MODES),
  vertical: labelOf(modes, VERTICAL_MODES),
});

/**
 * When a column's text first took its current value, after a sample in which it read differently;
 * none for a text present since the first sample, or none at all. Only the samples whose modes
 * were fresh at their own time count: a gap in the reports is not a change.
 */
export function modeChangedAt(samples: readonly Sample[], column: FmaColumn): number | undefined {
  const counted = samples.filter(
    (s) => s.navModes !== undefined && holds(s.heard.navModes, s.t, INSTRUMENT_SEC),
  );
  const text = (s: Sample | undefined) => fmaColumns(s?.navModes ?? [])[column];
  const current = text(counted.at(-1));
  if (current === undefined) return undefined;
  let first = counted.length - 1;
  while (first > 0 && text(counted[first - 1]) === current) first--;
  return first === 0 ? undefined : counted[first]?.t;
}

export interface PfdFma extends FmaColumns {
  ap: boolean;
  /** The columns whose text changed within `MODE_CHANGE_SEC`. */
  boxed: Record<FmaColumn, boolean>;
}

const EMPTY_FMA: PfdFma = {
  lateral: undefined,
  vertical: undefined,
  ap: false,
  boxed: { lateral: false, vertical: false },
};

/** What the annunciator shows: nothing once the target is lost or while its modes do not hold. */
export function pfdFma(t: Readout & Pick<Track, 'samples'>, now: number): PfdFma {
  const modes = t.navModes;
  if (isLost(t) || modes === undefined || !holdsAll(t, ['navModes'], now)) return EMPTY_FMA;
  const columns = fmaColumns(modes);
  const boxed = (column: FmaColumn) =>
    columns[column] !== undefined && holds(modeChangedAt(t.samples, column), now, MODE_CHANGE_SEC);
  return {
    ...columns,
    ap: modes.includes('autopilot'),
    boxed: { lateral: boxed('lateral'), vertical: boxed('vertical') },
  };
}

/** What the altitude tape reads: feet as the crew reads them, the ground, or the ALT flag. */
export type PfdAltitude = { kind: 'feet'; ft: number } | { kind: 'ground' } | { kind: 'flag' };

/** The feet of an altitude read in feet; none of the ground or a flag. */
export const feetOf = (read: PfdAltitude): number | undefined =>
  read.kind === 'feet' ? read.ft : undefined;

export interface PfdReadouts {
  /** The speed in knots; undefined for the SPD flag. */
  ias: number | undefined;
  /** The Mach as the tape's foot prints it; empty when it does not hold. */
  mach: string;
  /** The roll in degrees, positive to the right; undefined for the ATT flag. */
  roll: number | undefined;
  /** The flight path vector's angles; undefined while it is not shown. */
  fpv: Fpv | undefined;
  altitude: PfdAltitude;
  /** The selected altitude and the FMS one in feet; the latter hidden when it is the former. */
  selAlt: number | undefined;
  fmsAlt: number | undefined;
  /** The crew's altimeter setting in inches of mercury; empty when it does not hold. */
  baro: string;
  /** The vertical rate in feet per minute; undefined for no needle and no digits. */
  vs: number | undefined;
}

const machText = (mach: number): string => mach.toFixed(3).replace(/^0/, '');

/** Feet per minute in a knot: 6076.12 ft per nautical mile over 60 minutes. */
const KT_TO_FPM = 101.27;

/** The climb angle of the path, in degrees, from the vertical rate in ft/min and the ground speed in kt. */
const pathAngle = (vsFpm: number, gsKt: number): number =>
  Math.atan2(vsFpm, gsKt * KT_TO_FPM) / RAD;

/** Whether every one of the keys holds on its own: a key never heard does not hold. */
const allHold = (t: Readout, keys: readonly HeardKey[], now: number): boolean =>
  keys.every((key) => holdsAll(t, [key], now));

/** The turn from the heading to the magnetic track while both hold, else none. */
function driftOf(t: Readout, now: number): number {
  const track = magneticTrack(t);
  if (t.heading === undefined || track === undefined) return 0;
  return allHold(t, ['heading', 'track'], now) ? turn(t.heading, track) : 0;
}

/**
 * The flight path vector while the roll, the vertical rate and the ground speed hold and the
 * aircraft is under way. The track's drift off the heading adds to it only while both hold.
 */
function fpvOf(t: Readout, now: number): Fpv | undefined {
  const { verticalRate: vs, gs } = t;
  if (isLost(t) || vs === undefined || gs === undefined || gs <= 0) return undefined;
  if (!allHold(t, ['roll', 'verticalRate', 'gs'], now)) return undefined;
  return { fpaDeg: pathAngle(vs, gs), driftDeg: driftOf(t, now) };
}

/**
 * The altitude as the crew reads it, with the track as it is: the setting is not aged, so that the
 * capture of the selected altitude agrees with the data block's tick.
 */
function altitudeOf(t: Readout, now: number, altimeter: Altimeter): PfdAltitude {
  if (isLost(t) || !holdsAll(t, ['alt'], now)) return { kind: 'flag' };
  if (t.alt === 'ground') return { kind: 'ground' };
  const ft = crewAltitudeFt(t, altimeter);
  return ft === undefined ? { kind: 'flag' } : { kind: 'feet', ft };
}

/** A reading of the target while it holds and the target is not lost. */
const liveValue = (
  t: Readout,
  key: 'ias' | 'mach' | 'roll' | 'selAlt' | 'fmsAlt' | 'navQnh' | 'verticalRate',
  now: number,
): number | undefined => (!isLost(t) && holdsAll(t, [key], now) ? t[key] : undefined);

const asSet = (ft: number | undefined): number | undefined =>
  ft === undefined ? undefined : selectedFt(ft);

/** The values of the instrument, each while its keys hold and the target is not lost. */
export function pfdReadouts(t: Readout, now: number, altimeter: Altimeter): PfdReadouts {
  const ias = liveValue(t, 'ias', now);
  const mach = liveValue(t, 'mach', now);
  const roll = liveValue(t, 'roll', now);
  const selAlt = asSet(liveValue(t, 'selAlt', now));
  const fmsAlt = asSet(liveValue(t, 'fmsAlt', now));
  const qnh = liveValue(t, 'navQnh', now);
  return {
    ias,
    mach: mach === undefined ? '' : machText(mach),
    roll,
    fpv: fpvOf(t, now),
    altitude: altitudeOf(t, now, altimeter),
    selAlt,
    fmsAlt: fmsAlt === selAlt ? undefined : fmsAlt,
    vs: liveValue(t, 'verticalRate', now),
    baro: qnh === undefined ? '' : hpaToInHg(qnh).toFixed(2),
  };
}
