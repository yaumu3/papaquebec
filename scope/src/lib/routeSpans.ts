/** The drawn form of a path's spans, walked once: the lines, the labels and the highlight read it. */

import { gridIdentity } from './chart';
import type { ProjectFn, Vec2 } from './geo';
import { geodesicLine } from './geodesic';
import { lengthOf, type Midpoint, midpointOf, type Reading, readingAngle } from './polyline';
import { type Cuts, type Span, spanIdentity, spansOf } from './stops';
import type { ChartPath } from './topology';

/** A span of a path as the scope draws it. */
export interface RouteSpan extends Span {
  /** Shared by every path that runs this span, in either direction. */
  id: string;
  /** Each edge's geodesic on the plane, so a run can take any of them and stay one line. */
  edges: readonly (readonly Vec2[])[];
  /** The world distance from the span's start to each of its vertices. */
  reach: readonly number[];
  /** World length of the span. */
  length: number;
  /** The grid identity where the span starts on this path. */
  start: string;
  /** Half-way along, and how text reads there; none for a span with no length. */
  middle?: Midpoint & Reading;
}

/** The spans of a path, walked the first time they are asked for. */
export type SpansOf = (path: ChartPath) => readonly RouteSpan[];

function routeSpan(path: ChartPath, span: Span, project: ProjectFn): RouteSpan {
  const edges = path.coordinates
    .slice(span.from, span.to)
    .map((at, i) => geodesicLine([at, path.coordinates[span.from + i + 1] ?? at], project));
  const reach = [0];
  for (const edge of edges) reach.push((reach.at(-1) ?? 0) + lengthOf(edge));
  const middle = midpointOf(edges.flatMap((edge, i) => (i === 0 ? edge : edge.slice(1))));
  return {
    ...span,
    id: spanIdentity(path, span),
    edges,
    reach,
    length: reach.at(-1) ?? 0,
    start: gridIdentity(path.coordinates[span.from] ?? [0, 0]),
    ...(middle && { middle: { ...middle, ...readingAngle(middle.direction) } }),
  };
}

/** The spans of each path between the stops `cuts` names, kept once walked. */
export function pathSpans(cuts: Cuts, project: ProjectFn): SpansOf {
  const walked = new Map<ChartPath, readonly RouteSpan[]>();
  return (path) => {
    const known = walked.get(path);
    if (known) return known;
    const spans = spansOf(path, cuts).map((span) => routeSpan(path, span, project));
    walked.set(path, spans);
    return spans;
  };
}
