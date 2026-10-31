/** Vertical limits of an area part: what a published limit means in feet, and which stratum a part is. */

import type { ItemPart } from './chart';

/** A published limit in feet: `SFC` and `GND` are 0, `UNL` is unbounded, `FLnnn` is nnn hundreds. */
function limitFt(limit: string): number {
  if (limit === 'UNL') return Infinity;
  if (limit === 'SFC' || limit === 'GND') return 0;
  const level = /^FL(\d+)$/.exec(limit);
  return level ? Number(level[1]) * 100 : parseInt(limit, 10);
}

/**
 * Whether an area part is an upper stratum: its lower limit is above the surface, as for the
 * upper sectors of a FIR. A part with no lower limit is not one.
 */
export function isUpperStratum({ properties: p }: ItemPart): boolean {
  return 'lower' in p && p.lower !== undefined && limitFt(p.lower) > 0;
}
