/** Lines and circles on the scope plane that follow the earth: geodesic circles. */
import type { GeoPoint, ProjectFn } from '../../lib/geo';
import { geodesicCircle } from '../../lib/geodesic';
import type { Anchor } from './pack';

/** Segments in a drawn circle: its chords stay within a pixel of it at any range the scope shows. */
export const CIRCLE_SEGMENTS = 96;

/** The points `radiusNm` from `center` along the earth, on the scope plane, from due north round. */
export function projectedCircle(center: GeoPoint, radiusNm: number, project: ProjectFn): Anchor[] {
  return geodesicCircle(center, radiusNm, CIRCLE_SEGMENTS).map((p) => project(p.lat, p.lon));
}
