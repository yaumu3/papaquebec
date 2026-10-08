/**
 * An active resolution advisory as the TCAS RA broadcast and the ACAS register carry it (ICAO
 * Annex 10 Vol. IV, the ARA subfield; "The 1090 Megahertz Riddle", BDS 3,0): of one threat, or
 * of several that call for one sense, the advisory; of several that differ, the corrections.
 */
export interface ResolutionAdvisory {
  multipleThreats: boolean;
  advisory?: {
    /** Corrective, else preventive. */
    corrective: boolean;
    /** Downward, else upward. */
    downward: boolean;
    increasedRate: boolean;
    senseReversal: boolean;
    altitudeCrossing: boolean;
    /** A climb or a descent, else a limit on the vertical speed. */
    positive: boolean;
  };
  corrections?: {
    upward: boolean;
    positiveClimb: boolean;
    downward: boolean;
    positiveDescent: boolean;
    crossing: boolean;
    senseReversal: boolean;
  };
  /** Ended, and still reported for a while. */
  terminated: boolean;
}

/** A climb or a descent as the flags qualify it: a reversal, an increase or a crossing. */
function qualified(
  sense: 'CLIMB' | 'DESCEND',
  flags: { increasedRate: boolean; senseReversal: boolean; crossing: boolean },
): string {
  if (flags.senseReversal) return `${sense} NOW`;
  if (flags.increasedRate) return sense === 'CLIMB' ? 'INCREASE CLIMB' : 'INCREASE DESCENT';
  if (flags.crossing) return `CROSSING ${sense}`;
  return sense;
}

/**
 * The advisory in the words of the TCAS II aural annunciations (RTCA DO-185B): CLIMB or DESCEND,
 * reversed, increased or crossing by the flags; ADJUST VS for a corrective limit on the vertical
 * speed, MONITOR VS for a preventive one, MAINTAIN VS for a preventive climb or descent; of
 * several threats, what is called for; CLEAR once the advisory has ended.
 */
export function advisoryWord(ra: ResolutionAdvisory): string {
  if (ra.terminated) return 'CLEAR';
  const one = ra.advisory;
  if (one) {
    if (!one.positive) return one.corrective ? 'ADJUST VS' : 'MONITOR VS';
    if (!one.corrective) return 'MAINTAIN VS';
    return qualified(one.downward ? 'DESCEND' : 'CLIMB', {
      increasedRate: one.increasedRate,
      senseReversal: one.senseReversal,
      crossing: one.altitudeCrossing,
    });
  }
  const several = ra.corrections;
  if (!several) return 'ADJUST VS';
  const flags = {
    increasedRate: false,
    senseReversal: several.senseReversal,
    crossing: several.crossing,
  };
  if (several.positiveClimb) return qualified('CLIMB', flags);
  if (several.positiveDescent) return qualified('DESCEND', flags);
  return 'ADJUST VS';
}
