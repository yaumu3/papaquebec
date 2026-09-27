/** Lines and circles on the scope plane that follow the earth: geodesic routes and circles. */
import type { GeoPoint, ProjectFn } from '../../lib/geo';
import { geodesicCircle, geodesicPath } from '../../lib/geodesic';
import type { LatLon } from '../../lib/mapdata';
import type { Anchor } from './pack';

/** Segments in a drawn circle: its chords stay within a pixel of it at any range the scope shows. */
export const CIRCLE_SEGMENTS = 96;

/** A route drawn along the geodesics between its points. */
export const route = (points: readonly LatLon[], project: ProjectFn): Anchor[] =>
  geodesicPath(
    points.map(([lat, lon]) => ({ lat, lon })),
    project,
  );

/** A route back to its first point, for an outline. */
export function closedRoute(points: readonly LatLon[], project: ProjectFn): Anchor[] {
  const first = points[0];
  return route(first ? [...points, first] : points, project);
}

/** The points `radiusNm` from `center` along the earth, on the scope plane, from due north round. */
export function projectedCircle(center: GeoPoint, radiusNm: number, project: ProjectFn): Anchor[] {
  return geodesicCircle(center, radiusNm, CIRCLE_SEGMENTS).map((p) => project(p.lat, p.lon));
}
