import type { Readout } from '../../../state/track';
import { isLost, holdsAll } from '../freshness';

/** The labels the PFD gives the modes, in the order a column shows them when two are engaged. */
const LATERAL_MODES: readonly (readonly [string, string])[] = [
  ['approach', 'APP'],
  ['lnav', 'LNAV'],
];
const VERTICAL_MODES: readonly (readonly [string, string])[] = [
  ['althold', 'ALT HOLD'],
  ['vnav', 'VNAV'],
];

export interface FmaColumns {
  lateral: string | undefined;
  vertical: string | undefined;
}

const labelOf = (
  modes: readonly string[],
  table: readonly (readonly [string, string])[],
): string | undefined => table.find(([mode]) => modes.includes(mode))?.[1];

/** The lateral and vertical columns of the annunciator for the modes engaged. */
export const fmaColumns = (modes: readonly string[]): FmaColumns => ({
  lateral: labelOf(modes, LATERAL_MODES),
  vertical: labelOf(modes, VERTICAL_MODES),
});

export interface PfdFma extends FmaColumns {
  ap: boolean;
}

/** What the annunciator shows: nothing once the target is lost or while its modes do not hold. */
export function pfdFma(t: Readout, now: number): PfdFma {
  const modes = t.navModes;
  if (isLost(t) || modes === undefined || !holdsAll(t, ['navModes'], now)) {
    return { lateral: undefined, vertical: undefined, ap: false };
  }
  return { ...fmaColumns(modes), ap: modes.includes('autopilot') };
}
