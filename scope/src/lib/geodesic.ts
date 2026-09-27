/**
 * Geodesics on the WGS84 ellipsoid by Vincenty's formulae (T. Vincenty, "Direct and inverse
 * solutions of geodesics on the ellipsoid with application of nested equations", Survey Review
 * XXIII/176, 1975). Sub-millimetre at radar ranges; the inverse fails to converge only for
 * nearly antipodal points, which a scope never measures.
 */
import { type GeoPoint, NM_IN_METERS } from './geo';
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
