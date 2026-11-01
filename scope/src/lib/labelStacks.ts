/** Area labels that share a footprint stack into one label. */

import { gridIdentity } from './chart';
import type { LonLat } from './mapdata';

/** What an exterior ring covers, as the set of its vertices: start and direction do not matter. */
export function footprintOf(ring: readonly LonLat[]): string {
  const vertices = new Set(ring.map(gridIdentity));
  return [...vertices].toSorted().join(' ');
}

/**
 * The stacks of `members`: those with one footprint, ordered by lower limit in feet with the
 * lowest first, then by name. A member with no footprint stands alone. Stacks come in the order
 * their first member does.
 */
export function stacksOf<T>(
  members: readonly T[],
  footprint: (member: T) => string | undefined,
  lowerFt: (member: T) => number,
  name: (member: T) => string,
): T[][] {
  const stacks: T[][] = [];
  const byFootprint = new Map<string, T[]>();
  for (const member of members) {
    const key = footprint(member);
    const known = key === undefined ? undefined : byFootprint.get(key);
    if (known) known.push(member);
    else {
      const stack = [member];
      stacks.push(stack);
      if (key !== undefined) byFootprint.set(key, stack);
    }
  }
  const order = (a: T, b: T) => lowerFt(a) - lowerFt(b) || name(a).localeCompare(name(b));
  return stacks.map((stack) => stack.toSorted(order));
}
