/**
 * Geodesics on the WGS84 ellipsoid by Vincenty's formulae (T. Vincenty, "Direct and inverse
 * solutions of geodesics on the ellipsoid with application of nested equations", Survey Review
 * XXIII/176, 1975). Sub-millimetre at radar ranges; the inverse fails to converge only for
 * nearly antipodal points, which a scope never measures.
 */
import { type GeoPoint, NM_IN_METERS, type Vec2 } from './geo';
import { WGS84 } from './projection';
import { RAD } from './units';

const A = WGS84.a;
const F = 1 / WGS84.invF;
const B = A * (1 - F);
const MAX_ITERATIONS = 100;
const CONVERGED = 1e-12;

export interface RangeBearing {
  distanceNm: number;
  /** Initial true course from the first point, degrees 0..360. */
  bearingTrue: number;
}

/** Vincenty's A and B series in u², shared by the inverse and the direct solution. */
function series(cos2Alpha: number): { a: number; b: number } {
  const u2 = (cos2Alpha * (A * A - B * B)) / (B * B);
  return {
    a: 1 + (u2 / 16384) * (4096 + u2 * (-768 + u2 * (320 - 175 * u2))),
    b: (u2 / 1024) * (256 + u2 * (-128 + u2 * (74 - 47 * u2))),
  };
}

/** Δσ, the correction from the sphere's arc to the ellipsoid's. */
function deltaSigma(b: number, sinS: number, cosS: number, cos2Sm: number): number {
  const c2 = cos2Sm * cos2Sm;
  return (
    b *
    sinS *
    (cos2Sm +
      (b / 4) * (cosS * (-1 + 2 * c2) - (b / 6) * cos2Sm * (-3 + 4 * sinS * sinS) * (-3 + 4 * c2)))
  );
}

/** Vincenty's C, weighting the longitude correction. */
const lambdaWeight = (cos2Alpha: number) => (F / 16) * cos2Alpha * (4 + F * (4 - 3 * cos2Alpha));

/** Distance and initial true course from `a` to `b` along the geodesic. */
export function inverse(a: GeoPoint, b: GeoPoint): RangeBearing {
  const l = (b.lon - a.lon) * RAD;
  const u1 = Math.atan((1 - F) * Math.tan(a.lat * RAD));
  const u2 = Math.atan((1 - F) * Math.tan(b.lat * RAD));
  const [sinU1, cosU1, sinU2, cosU2] = [Math.sin(u1), Math.cos(u1), Math.sin(u2), Math.cos(u2)];
  let lambda = l;
  let sinL = 0;
  let cosL = 1;
  let sinS = 0;
  let cosS = 1;
  let sigma = 0;
  let cos2Alpha = 1;
  let cos2Sm = 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    sinL = Math.sin(lambda);
    cosL = Math.cos(lambda);
    sinS = Math.hypot(cosU2 * sinL, cosU1 * sinU2 - sinU1 * cosU2 * cosL);
    if (sinS === 0) return { distanceNm: 0, bearingTrue: 0 };
    cosS = sinU1 * sinU2 + cosU1 * cosU2 * cosL;
    sigma = Math.atan2(sinS, cosS);
    const sinAlpha = (cosU1 * cosU2 * sinL) / sinS;
    cos2Alpha = 1 - sinAlpha * sinAlpha;
    cos2Sm = cos2Alpha === 0 ? 0 : cosS - (2 * sinU1 * sinU2) / cos2Alpha;
    const c = lambdaWeight(cos2Alpha);
    const prev = lambda;
    lambda =
      l +
      (1 - c) *
        F *
        sinAlpha *
        (sigma + c * sinS * (cos2Sm + c * cosS * (-1 + 2 * cos2Sm * cos2Sm)));
    if (Math.abs(lambda - prev) < CONVERGED) break;
  }
  const s = series(cos2Alpha);
  const metres = B * s.a * (sigma - deltaSigma(s.b, sinS, cosS, cos2Sm));
  const course = Math.atan2(cosU2 * sinL, cosU1 * sinU2 - sinU1 * cosU2 * cosL) / RAD;
  return { distanceNm: metres / NM_IN_METERS, bearingTrue: (course + 360) % 360 };
}

/** The point `distanceNm` along the geodesic that leaves `from` on the true course `bearingTrue`. */
export function direct(from: GeoPoint, bearingTrue: number, distanceNm: number): GeoPoint {
  const s = distanceNm * NM_IN_METERS;
  const sinA1 = Math.sin(bearingTrue * RAD);
  const cosA1 = Math.cos(bearingTrue * RAD);
  const tanU1 = (1 - F) * Math.tan(from.lat * RAD);
  const cosU1 = 1 / Math.sqrt(1 + tanU1 * tanU1);
  const sinU1 = tanU1 * cosU1;
  const sigma1 = Math.atan2(tanU1, cosA1);
  const sinAlpha = cosU1 * sinA1;
  const cos2Alpha = 1 - sinAlpha * sinAlpha;
  const k = series(cos2Alpha);
  let sigma = s / (B * k.a);
  let sinS = 0;
  let cosS = 1;
  let cos2Sm = 0;
  for (let i = 0; i < MAX_ITERATIONS; i++) {
    cos2Sm = Math.cos(2 * sigma1 + sigma);
    sinS = Math.sin(sigma);
    cosS = Math.cos(sigma);
    const prev = sigma;
    sigma = s / (B * k.a) + deltaSigma(k.b, sinS, cosS, cos2Sm);
    if (Math.abs(sigma - prev) < CONVERGED) break;
  }
  sinS = Math.sin(sigma);
  cosS = Math.cos(sigma);
  cos2Sm = Math.cos(2 * sigma1 + sigma);
  const x = sinU1 * sinS - cosU1 * cosS * cosA1;
  const lat = Math.atan2(sinU1 * cosS + cosU1 * sinS * cosA1, (1 - F) * Math.hypot(sinAlpha, x));
  const lambda = Math.atan2(sinS * sinA1, cosU1 * cosS - sinU1 * sinS * cosA1);
  const c = lambdaWeight(cos2Alpha);
  const l =
    lambda -
    (1 - c) * F * sinAlpha * (sigma + c * sinS * (cos2Sm + c * cosS * (-1 + 2 * cos2Sm * cos2Sm)));
  return { lat: lat / RAD, lon: from.lon + l / RAD };
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
  project: (lat: number, lon: number) => Vec2,
  tolerance = PATH_TOLERANCE_NM,
): Vec2[] {
  const first = points[0];
  if (!first) return [];
  const path = [project(first.lat, first.lon)];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1] ?? first;
    const b = points[i] ?? a;
    const pa = path.at(-1) ?? project(a.lat, a.lon);
    const pb = project(b.lat, b.lon);
    const m = sphericalMidpoint(a, b);
    const bow = offLine(project(m.lat, m.lon), pa, pb);
    if (bow > tolerance) {
      const pieces = Math.ceil(Math.sqrt(bow / tolerance));
      const { distanceNm, bearingTrue } = inverse(a, b);
      for (let k = 1; k < pieces; k++) {
        const p = direct(a, bearingTrue, (distanceNm * k) / pieces);
        path.push(project(p.lat, p.lon));
      }
    }
    path.push(pb);
  }
  return path;
}
