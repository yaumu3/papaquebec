/**
 * Geodesics on the WGS84 ellipsoid, as the geodesy crate compiled to WebAssembly measures them
 * by Vincenty's formulae, and the lines and rings drawn along them.
 */
import { type GeoPoint, type ProjectFn, type Vec2 } from './geo';
import { RAD } from './units';
import init, { direct as directOf, inverse as inverseOf } from './wasm/geodesy';

// Instantiated before anything measures: a range ring or an RBL cannot be drawn without it.
await init();

export interface RangeBearing {
  distanceNm: number;
  /** Initial true course from the first point, degrees 0..360. */
  bearingTrue: number;
}

/** Distance and initial true course from `a` to `b` along the geodesic. */
export function inverse(a: GeoPoint, b: GeoPoint): RangeBearing {
  const [distanceNm = Number.NaN, bearingTrue = Number.NaN] = inverseOf(a.lat, a.lon, b.lat, b.lon);
  return { distanceNm, bearingTrue };
}

/** The point `distanceNm` along the geodesic that leaves `from` on the true course `bearingTrue`. */
export function direct(from: GeoPoint, bearingTrue: number, distanceNm: number): GeoPoint {
  const [lat = Number.NaN, lon = Number.NaN] = directOf(
    from.lat,
    from.lon,
    bearingTrue,
    distanceNm,
  );
  return { lat, lon };
}

/** `segments + 1` points `radiusNm` from `center`, clockwise from due north and back to it. */
export function geodesicCircle(center: GeoPoint, radiusNm: number, segments: number): GeoPoint[] {
  return Array.from({ length: segments + 1 }, (_, i) =>
    direct(center, (360 * (i % segments)) / segments, radiusNm),
  );
}

/** How far a drawn chord may stray from the geodesic, in NM: about 9 m, under half a pixel at the closest range. */
export const PATH_TOLERANCE_NM = 0.005;

/**
 * The great-circle midpoint of `a` and `b` on a sphere: closed form, and close enough to the
 * ellipsoid's to tell how far an edge bows.
 */
function sphericalMidpoint(a: GeoPoint, b: GeoPoint): GeoPoint {
  const lat1 = a.lat * RAD;
  const lat2 = b.lat * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const bx = Math.cos(lat2) * Math.cos(dLon);
  const by = Math.cos(lat2) * Math.sin(dLon);
  const lat = Math.atan2(Math.sin(lat1) + Math.sin(lat2), Math.hypot(Math.cos(lat1) + bx, by));
  return { lat: lat / RAD, lon: a.lon + Math.atan2(by, Math.cos(lat1) + bx) / RAD };
}

/** How far `p` lies to either side of the line through `a` and `b`. */
function offLine(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? 0 : Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

/**
 * A line through `points` projected so it follows the geodesics between them. An edge whose
 * straight chord would bow more than `tolerance` (in plane units) from its geodesic is split
 * along it; the bow shrinks with the square of the pieces, so a few suffice. The bow is judged
 * from the spherical midpoint, cheap enough for every edge of the map; the pieces come from the
 * ellipsoid.
 */
export function geodesicPath(
  points: readonly GeoPoint[],
  project: ProjectFn,
  tolerance = PATH_TOLERANCE_NM,
): Vec2[] {
  const [first, ...rest] = points;
  if (!first) return [];
  let a = first;
  let pa = project(a.lat, a.lon);
  const path = [pa];
  for (const b of rest) {
    const pb = project(b.lat, b.lon);
    const m = sphericalMidpoint(a, b);
    const bow = offLine(project(m.lat, m.lon), pa, pb);
    if (bow > tolerance)
      path.push(...inBetween(a, b, Math.ceil(Math.sqrt(bow / tolerance)), project));
    path.push(pb);
    a = b;
    pa = pb;
  }
  return path;
}

/** The points that cut the geodesic from `a` to `b` into `pieces` equal parts, projected. */
function inBetween(a: GeoPoint, b: GeoPoint, pieces: number, project: ProjectFn): Vec2[] {
  const { distanceNm, bearingTrue } = inverse(a, b);
  return Array.from({ length: pieces - 1 }, (_, i) => {
    const p = direct(a, bearingTrue, (distanceNm * (i + 1)) / pieces);
    return project(p.lat, p.lon);
  });
}
