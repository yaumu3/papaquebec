import {
  type GeoPoint,
  trueToMagnetic,
  type UnprojectFn,
  type Vec2,
  velocityNm,
} from '../../lib/geo';
import { inverse } from '../../lib/geodesic';
import type { Declination } from '../../lib/wmm';
import type { Track } from '../../state/track';
import { trackLabel } from './rules';

/** A point a readout measures from or to. */
export interface Point {
  /** Where it is drawn on the scope plane. */
  pos: Vec2;
  /** Where it is on the earth, which readouts measure between. */
  geo: GeoPoint;
  vel: Vec2 | null;
  label: string;
}

export function trackPoint(t: Track): Point | null {
  const p = t.position;
  if (p.kind !== 'live' && p.kind !== 'last') return null;
  const vel = t.gs !== undefined && t.track !== undefined ? velocityNm(t.gs, t.track) : null;
  return { pos: { x: p.x, y: p.y }, geo: { lat: p.lat, lon: p.lon }, vel, label: trackLabel(t) };
}

/** A still point placed on the scope plane rather than reported by a target. */
export function freePoint(pos: Vec2, label: string, unproject: UnprojectFn): Point {
  return { pos, geo: unproject(pos.x, pos.y), vel: null, label };
}

/**
 * How far `b` lies from `a` along the geodesic, in NM, and on what initial bearing, made
 * magnetic by the declination at `a`, where it is measured.
 */
export function measure(
  a: Point,
  b: Point,
  declination: Declination,
): { dist: number; brg: number } {
  const r = inverse(a.geo, b.geo);
  return {
    dist: r.distanceNm,
    brg: trueToMagnetic(r.bearingTrue, declination(a.geo.lat, a.geo.lon)),
  };
}
