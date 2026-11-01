/** Where things stand on the scope with every panel closed, for the visual tests to reach them. */
import type { LatLon } from '../../src/lib/aircraft';
import { NM_PER_DEGREE } from '../../src/lib/geo';
import type { Clip } from './imageDiff';

export type Place = readonly [east: number, north: number];

/** A square of a sheet: what to crop, and where on the scope its subject stands. */
export interface Cell {
  clip: Clip;
  place: Place;
}

const SCOPE_MIDDLE = { x: 800, y: 500 };
/** Clear of the top bar. */
const SHEET_TOP = 45;
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

export interface Sheet {
  cols: number;
  width: number;
  height: number;
}

/** Cell `i` of a sheet, row by row from the top left, its subject at the middle. */
export function cellOf(i: number, { cols, width, height }: Sheet): Cell {
  const x = SCOPE_MIDDLE.x - (cols * width) / 2 + (i % cols) * width;
  const y = SHEET_TOP + Math.floor(i / cols) * height;
  return {
    clip: { x, y, width, height },
    place: [
      (x + width / 2 - SCOPE_MIDDLE.x) / PX_PER_NM,
      (SCOPE_MIDDLE.y - y - height / 2) / PX_PER_NM,
    ],
  };
}
