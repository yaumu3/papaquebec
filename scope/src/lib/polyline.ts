/** Measures on polylines of the world plane. */

import type { Vec2 } from './geo';

/** The distance between two points; a chart's chords are many, and `Math.hypot` is slow. */
export function chordOf(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** The length of a polyline: the sum of its chords. */
export const lengthOf = (points: readonly Vec2[]): number =>
  points.slice(1).reduce((sum, p, i) => sum + chordOf(points[i] ?? p, p), 0);

/** A point on a polyline with the unit direction of the piece it lies on. */
export interface Midpoint {
  at: Vec2;
  direction: Vec2;
}

/**
 * The point `distance` along a polyline and the direction of the piece it falls on; on a vertex,
 * the piece ahead. Past the end, the end of the last piece.
 */
export function pointAlong(points: readonly Vec2[], distance: number): Midpoint | undefined {
  let behind = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const chord = chordOf(a, b);
    if (behind + chord <= distance && i < points.length - 1) {
      behind += chord;
      continue;
    }
    const t = (distance - behind) / chord;
    const direction = { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord };
    return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, direction };
  }
  return undefined;
}

/** The point half-way along a polyline; none for a polyline with no length. */
export function midpointOf(points: readonly Vec2[]): Midpoint | undefined {
  const half = lengthOf(points) / 2;
  return half === 0 ? undefined : pointAlong(points, half);
}

/** A text angle on the screen, and whether it was turned half a circle to read upright. */
export interface Reading {
  /** Radians, clockwise from east, in CSS px with y down. */
  angle: number;
  flipped: boolean;
}

/**
 * The angle text reads along a world direction (y up) on the screen. Beyond a quarter turn
 * either way it would read upside down, so it is turned half a circle; exactly a quarter turn is
 * kept.
 */
export function readingAngle({ x, y }: Vec2): Reading {
  const angle = Math.atan2(-y, x);
  if (Math.abs(angle) <= Math.PI / 2) return { angle, flipped: false };
  return { angle: angle - Math.sign(angle) * Math.PI, flipped: true };
}
