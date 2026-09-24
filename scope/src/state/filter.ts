import { type Altimeter, displayAltitude } from '../lib/altitude';
import { emergencyCode } from '../lib/format';
import type { BandLimits } from './band';

export type SquawkFilter = 'all' | 'nonvfr' | 'emergency';

export interface Filter {
  /** Whether ground traffic is shown; the band governs airborne traffic only. */
  ground: boolean;
  lowerFl: number;
  upperFl: number;
  squawk: SquawkFilter;
}

export interface Filterable {
  alt: number | 'ground' | undefined;
  squawk: string | undefined;
  emergency: string | undefined;
}

/** A filtered target still appears, reduced to an unfilled diamond and altitude. */
export type Visibility = 'shown' | 'filtered';

const VFR_SQUAWKS = new Set(['1200', '1201', '1202', '7000']);

export const FL_MIN = 0;
export const FL_MAX = 600;
/** The band slider's range and the least width it can be squeezed to, in hundreds of feet. */
export const BAND_LIMITS: BandLimits = { min: FL_MIN, max: FL_MAX, gap: 10 };

const bandActive = (f: Filter) => f.lowerFl > FL_MIN || f.upperFl < FL_MAX;

/**
 * Emergency is additive: a filter never hides one. With a band set, a target
 * whose altitude is unknown cannot be shown to be inside it, so it is filtered.
 * The band is read against the value the data block shows, so a target
 * labelled 055 is inside a band starting at 050 whatever the QNH.
 */
export function classify(t: Filterable, filter: Filter, altimeter: Altimeter): Visibility {
  if (emergencyCode(t.squawk, t.emergency)) return 'shown';
  const d = displayAltitude(t.alt, altimeter);
  if (d.kind === 'ground') {
    if (!filter.ground) return 'filtered';
  } else if (d.kind === 'unknown') {
    if (bandActive(filter)) return 'filtered';
  } else {
    const hundreds = Math.round(d.feet / 100);
    if (hundreds < filter.lowerFl || hundreds > filter.upperFl) return 'filtered';
  }
  if (filter.squawk === 'nonvfr' && t.squawk !== undefined && VFR_SQUAWKS.has(t.squawk)) {
    return 'filtered';
  }
  if (filter.squawk === 'emergency') return 'filtered';
  return 'shown';
}
