/** Measures on polylines of the world plane. */

import type { Vec2 } from './geo';

/** The distance between two points. */
export const chordOf = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

/** The length of a polyline: the sum of its chords. */
export const lengthOf = (points: readonly Vec2[]): number =>
  points.slice(1).reduce((sum, p, i) => sum + chordOf(points[i] ?? p, p), 0);

/** A point on a polyline with the unit direction of the piece it lies on. */
export interface Midpoint {
  at: Vec2;
  direction: Vec2;
}

/**
 * The point half-way along a polyline and the direction of the piece it falls on; on a vertex,
 * the piece ahead. None for a polyline with no length.
 */
export function midpointOf(points: readonly Vec2[]): Midpoint | undefined {
  const half = lengthOf(points) / 2;
  if (half === 0) return undefined;
  let behind = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const chord = chordOf(a, b);
    if (behind + chord <= half) {
      behind += chord;
      continue;
    }
    const t = (half - behind) / chord;
    const direction = { x: (b.x - a.x) / chord, y: (b.y - a.y) / chord };
    return { at: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }, direction };
  }
  return undefined;
}
