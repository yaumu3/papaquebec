/** A point on the projected plane, in nautical miles: x east, y north. */
import { RAD } from './units';
export interface Vec2 {
  x: number;
  y: number;
}

export const NM_IN_METERS = 1852;

/** True bearing in degrees, 0..360, of a displacement on the projected plane. */
export function bearingTrue(dx: number, dy: number): number {
  const b = Math.atan2(dx, dy) / RAD;
  return b < 0 ? b + 360 : b;
}

/** True bearing to magnetic, given declination in degrees east positive. */
export function trueToMagnetic(trueDeg: number, declinationDeg: number): number {
  const m = (trueDeg - declinationDeg) % 360;
  return m < 0 ? m + 360 : m;
}

export function distanceNm(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Velocity components in knots from ground speed and true track. */
export function velocityNm(gsKt: number, trackDeg: number): Vec2 {
  const t = trackDeg * RAD;
  return { x: gsKt * Math.sin(t), y: gsKt * Math.cos(t) };
}

/** Distance from `p` to the closest point of segment `ab`. */
export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const len2 = abx * abx + aby * aby;
  const t =
    len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / len2));
  return Math.hypot(p.x - (a.x + t * abx), p.y - (a.y + t * aby));
}

export interface Mover {
  pos: Vec2;
  /** Knots. */
  vel: Vec2;
}

export type Approach =
  | { kind: 'converging'; distanceNm: number; seconds: number }
  | { kind: 'diverging' }
  | { kind: 'co-speed'; distanceNm: number };

/** Closest point of approach assuming both movers hold their current velocity. */
export function closestApproach(a: Mover, b: Mover): Approach {
  const dx = b.pos.x - a.pos.x;
  const dy = b.pos.y - a.pos.y;
  const vx = b.vel.x - a.vel.x;
  const vy = b.vel.y - a.vel.y;
  const vv = vx * vx + vy * vy;
  if (vv < 1e-6) return { kind: 'co-speed', distanceNm: Math.hypot(dx, dy) };
  const tHours = -(dx * vx + dy * vy) / vv;
  if (tHours <= 0) return { kind: 'diverging' };
  return {
    kind: 'converging',
    distanceNm: Math.hypot(dx + vx * tHours, dy + vy * tHours),
    seconds: tHours * 3600,
  };
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Equirectangular distance, good enough to rank nearby items. */
function flatDistance(lat: number, lon: number, p: GeoPoint): number {
  const k = Math.cos((lat * Math.PI) / 180);
  const dLat = p.lat - lat;
  const dLon = (p.lon - lon) * k;
  return dLat * dLat + dLon * dLon;
}

/** A copy of the items ordered nearest first. */
export function rankByDistance<T extends GeoPoint>(
  lat: number,
  lon: number,
  items: readonly T[],
): T[] {
  return items
    .map((it) => ({ it, d: flatDistance(lat, lon, it) }))
    .toSorted((a, b) => a.d - b.d)
    .map((x) => x.it);
}

export function nearest<T extends GeoPoint>(
  lat: number,
  lon: number,
  items: readonly T[],
): T | null {
  return rankByDistance(lat, lon, items)[0] ?? null;
}
