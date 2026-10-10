/** A point on the projected plane, in nautical miles: x east, y north. */
import { RAD } from './units';
export interface Vec2 {
  x: number;
  y: number;
}

export const NM_IN_METERS = 1852;

/** True bearing to magnetic, given declination in degrees east positive. */
export function trueToMagnetic(trueDeg: number, declinationDeg: number): number {
  const m = (trueDeg - declinationDeg) % 360;
  return m < 0 ? m + 360 : m;
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

/** A segment from its first point to its second. */
export type Span = [Vec2, Vec2];

/** Segment `p`–`q` split into what lies outside the circle of radius `r` about `c` and what inside. */
export function splitByCircle(
  p: Vec2,
  q: Vec2,
  c: Vec2,
  r: number,
): { outside: Span[]; inside: Span[] } {
  const d = { x: q.x - p.x, y: q.y - p.y };
  const f = { x: p.x - c.x, y: p.y - c.y };
  const a = d.x * d.x + d.y * d.y;
  const b = 2 * (f.x * d.x + f.y * d.y);
  const disc = b * b - 4 * a * (f.x * f.x + f.y * f.y - r * r);
  if (a === 0 || disc <= 0) return { outside: [[p, q]], inside: [] };
  const t1 = Math.max((-b - Math.sqrt(disc)) / (2 * a), 0);
  const t2 = Math.min((-b + Math.sqrt(disc)) / (2 * a), 1);
  if (t1 >= 1 || t2 <= 0) return { outside: [[p, q]], inside: [] };
  const at = (t: number) => ({ x: p.x + d.x * t, y: p.y + d.y * t });
  const outside: Span[] = [];
  if (t1 > 0) outside.push([p, at(t1)]);
  if (t2 < 1) outside.push([at(t2), q]);
  return { outside, inside: [[at(t1), at(t2)]] };
}

export interface GeoPoint {
  lat: number;
  lon: number;
}

/** Lat/lon onto a projected plane. */
export type ProjectFn = (lat: number, lon: number) => Vec2;
/** The inverse of a `ProjectFn`: a point on the plane back to lat/lon. */
export type UnprojectFn = (x: number, y: number) => GeoPoint;

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
