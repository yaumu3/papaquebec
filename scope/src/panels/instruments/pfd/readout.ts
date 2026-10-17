import { holds, INSTRUMENT_SEC } from '../../../lib/reports';
import type { Readout, Sample, Track } from '../../../state/track';
import { holdsAll, isLost } from '../freshness';

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

export interface PfdReadouts {
  /** The speed in knots, rounded; undefined for the SPD flag. */
  ias: number | undefined;
  /** The Mach as the tape's foot prints it; empty when it does not hold. */
  mach: string;
  /** The roll in degrees, positive to the right; undefined for the ATT flag. */
  roll: number | undefined;
}

const machText = (mach: number): string => mach.toFixed(3).replace(/^0/, '');

/** The values of the instrument, each while its keys hold and the target is not lost. */
export function pfdReadouts(t: Readout, now: number): PfdReadouts {
  const live = (key: 'ias' | 'mach' | 'roll') => !isLost(t) && holdsAll(t, [key], now);
  return {
    ias: live('ias') && t.ias !== undefined ? Math.round(t.ias) : undefined,
    mach: live('mach') && t.mach !== undefined ? machText(t.mach) : '',
    roll: live('roll') ? t.roll : undefined,
  };
}
