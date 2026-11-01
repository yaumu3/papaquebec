/** Measures on polylines of the world plane. */

import type { Vec2 } from './geo';

/** The distance between two points. */
export const chordOf = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);

/** The length of a polyline: the sum of its chords. */
export const lengthOf = (points: readonly Vec2[]): number =>
  points.slice(1).reduce((sum, p, i) => sum + chordOf(points[i] ?? p, p), 0);
