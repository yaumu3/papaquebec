import { emergencyCode } from '../lib/format';

export type SquawkFilter = 'all' | 'nonvfr' | 'emergency';

export interface Filter {
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

const bandActive = (f: Filter) => f.lowerFl > FL_MIN || f.upperFl < FL_MAX;

/**
 * Emergency is additive: a filter never hides one. With a band set, a target
 * whose altitude is unknown cannot be shown to be inside it, so it is filtered.
 */
export function classify(t: Filterable, filter: Filter): Visibility {
  if (emergencyCode(t.squawk, t.emergency)) return 'shown';
  if (t.alt === undefined) {
    if (bandActive(filter)) return 'filtered';
  } else {
    const fl = t.alt === 'ground' ? 0 : t.alt / 100;
    if (fl < filter.lowerFl || fl > filter.upperFl) return 'filtered';
  }
  if (filter.squawk === 'nonvfr' && t.squawk !== undefined && VFR_SQUAWKS.has(t.squawk)) {
    return 'filtered';
  }
  if (filter.squawk === 'emergency') return 'filtered';
  return 'shown';
}
