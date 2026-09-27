import type { GeoPoint, ProjectFn } from '../../lib/geo';
import type { Anchor } from './pack';
import { projectedCircle } from './paths';

export function ringStepNm(rangeNm: number): number {
  if (rangeNm <= 20) return 5;
  if (rangeNm <= 80) return 10;
  if (rangeNm <= 160) return 20;
  return 50;
}

/** Rings spaced for `rangeNm`, drawn out to `extentNm`. */
export function ringRadii(rangeNm: number, extentNm: number): number[] {
  const step = ringStepNm(rangeNm);
  const out: number[] = [];
  for (let r = step; r <= extentNm; r += step) out.push(r);
  return out;
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
