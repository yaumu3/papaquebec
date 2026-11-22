import { trackLabel } from '../render/scene/rules';
import { magneticTrack } from './magnetic';
import type { ListSort, SortKey } from './settingsDefaults';
import type { Track } from './track';

/** Plane distance from the site (the projection origin), NM; undefined without a drawable position. */
export function distanceFromSite(t: Track): number | undefined {
  const p = t.position;
  return p.kind === 'live' ? Math.hypot(p.x, p.y) : undefined;
}

type SortValue = string | number | undefined;

const VALUE: Record<SortKey, (t: Track) => SortValue> = {
  id: trackLabel,
  type: (t) => t.type,
  alt: (t) => (t.alt === 'ground' ? -1 : t.alt),
  gs: (t) => t.gs,
  track: magneticTrack,
  squawk: (t) => t.squawk,
  dist: distanceFromSite,
  source: (t) => t.source,
};

function compare(a: SortValue, b: SortValue): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b));
}

/** Stable sort by one column; rows without a value go last whatever the direction. */
export function sortTracks(tracks: readonly Track[], sort: ListSort): Track[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  return tracks
    .map((t) => ({ t, v: VALUE[sort.key](t) }))
    .toSorted((x, y) => {
      if (x.v === undefined) return y.v === undefined ? 0 : 1;
      if (y.v === undefined) return -1;
      return sign * compare(x.v, y.v);
    })
    .map((x) => x.t);
}

export function toggleSort(current: ListSort, key: SortKey): ListSort {
  if (current.key !== key) return { key, dir: 'asc' };
  return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
}

/**
 * The row one step down (1) or up (-1) the list from `current`, round from either end to the
 * other; from no row, or one no longer listed, the first going down and the last going up.
 */
export function stepThrough(
  hexes: readonly string[],
  current: string | null,
  direction: 1 | -1,
): string | null {
  const count = hexes.length;
  const at = current === null ? -1 : hexes.indexOf(current);
  const entry = direction === 1 ? 0 : count - 1;
  return hexes[at === -1 ? entry : (at + direction + count) % count] ?? null;
}
