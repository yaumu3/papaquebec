import type { GeoPoint } from '../../lib/geo';
import { geodesicCircle } from '../../lib/geodesic';
import type { ProjectFn } from '../../state/trackStore';
import type { Anchor } from './pack';

/** Segments in a drawn circle: its chords stay within a pixel of it at any range the scope shows. */
export const CIRCLE_SEGMENTS = 96;

export function ringStepNm(rangeNm: number): number {
  if (rangeNm <= 20) return 5;
  if (rangeNm <= 80) return 10;
  return 20;
}

/** Rings spaced for `rangeNm`, drawn out to `extentNm`. */
export function ringRadii(rangeNm: number, extentNm: number): number[] {
  const step = ringStepNm(rangeNm);
  const out: number[] = [];
  for (let r = step; r <= extentNm; r += step) out.push(r);
  return out;
}

/** The points `radiusNm` from `center` along the earth, on the scope plane, from due north round. */
export function projectedCircle(center: GeoPoint, radiusNm: number, project: ProjectFn): Anchor[] {
  return geodesicCircle(center, radiusNm, CIRCLE_SEGMENTS).map((p) => project(p.lat, p.lon));
}

/** Range ring outlines round the site, each worked out once per radius and kept. */
export function ringPaths(site: GeoPoint, project: ProjectFn): (radiusNm: number) => Anchor[] {
  const paths = new Map<number, Anchor[]>();
  return (radiusNm) => {
    const known = paths.get(radiusNm);
    if (known) return known;
    const path = projectedCircle(site, radiusNm, project);
    paths.set(radiusNm, path);
    return path;
  };
}
