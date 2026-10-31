/**
 * Where routes stop short of points: a route vertex at the identity of a drawn point is a stop,
 * and the route's spans between stops are cut back from them.
 */

import type { PointLayer } from './mapsetFormat';
import type { ChartPath, ChartPoint, Stretch } from './topology';

/** CSS px of clear space between a marker and the route that stops short of it. */
export const STOP_CLEARANCE_PX = 3;

/** The cut, in CSS px, at each vertex where a drawn point stands. */
export type Cuts = ReadonlyMap<number, number>;

export const NO_CUTS: Cuts = new Map();

/** The cut at each vertex: half the largest marker standing there, plus the clearance. */
export function stopCuts(
  points: readonly ChartPoint[],
  sizeOf: (layer: PointLayer) => number,
): Cuts {
  const cuts = new Map<number, number>();
  for (const { layer, vertex } of points) {
    const cut = sizeOf(layer) / 2 + STOP_CLEARANCE_PX;
    cuts.set(vertex, Math.max(cuts.get(vertex) ?? 0, cut));
  }
  return cuts;
}

/** A stretch of a path between stops, or its ends, with the cut at each end that is a stop. */
export interface Span extends Stretch {
  cutBack: number;
  cutAhead: number;
}

/** A path split at its interior stops; a path with no edges has no span. */
export function spansOf(path: ChartPath, cuts: Cuts): Span[] {
  const last = path.vertices.length - 1;
  const cutAt = (i: number) => cuts.get(path.vertices[i] ?? -1);
  const spans: Span[] = [];
  let from = 0;
  for (let to = 1; to <= last; to++) {
    if (to < last && cutAt(to) === undefined) continue;
    spans.push({ from, to, cutBack: cutAt(from) ?? 0, cutAhead: cutAt(to) ?? 0 });
    from = to;
  }
  return spans;
}
