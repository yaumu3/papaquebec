/** Where things stand on the scope with every panel closed, for the visual tests to reach them. */
import type { LatLon } from '../../src/lib/aircraft';
import { NM_PER_DEGREE } from '../../src/lib/geo';

export type Place = readonly [east: number, north: number];

const SCOPE_MIDDLE = { x: 800, y: 500 };
export const PX_PER_NM = 11.43;

export const onScope = ([east, north]: Place): [x: number, y: number] => [
  SCOPE_MIDDLE.x + east * PX_PER_NM,
  SCOPE_MIDDLE.y - north * PX_PER_NM,
];

/** `place` as a position about `site`, on the flat map the visual tests lay things out on. */
export function latLonOf(site: LatLon, [east, north]: Place): LatLon {
  return {
    lat: site.lat + north / NM_PER_DEGREE,
    lon: site.lon + east / (NM_PER_DEGREE * Math.cos((site.lat * Math.PI) / 180)),
  };
}
