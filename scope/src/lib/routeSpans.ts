/** The drawn form of a path's spans, walked once: the lines, the labels and the highlight read it. */

import { gridIdentity } from './chart';
import type { Vec2 } from './geo';
import type { LineOf, PathLine } from './pathLines';
import { type Midpoint, pointAlong, type Reading, readingAngle } from './polyline';
import { type Cuts, NO_CUTS, type Span, spanIdentity, spansOf } from './stops';
import type { ChartPath } from './topology';

/** A span of a path on the plane: all that drawing its runs reads. */
export interface LineSpan extends Span {
  /** Its path's line, so a run can take any stretch of it and stay one line. */
  line: PathLine;
}

/** A span of a route, with what its label reads. */
export interface RouteSpan extends LineSpan {
  /** Shared by every path that runs this span, in either direction. */
  id: string;
  /** World length of the span. */
  length: number;
  /** The grid identity where the span starts on this path. */
  start: string;
  /** Half-way along, and how text reads there; none for a span with no length. */
  middle?: Midpoint & Reading;
}

/** The spans of a path, walked the first time they are asked for. */
export type SpansOf<S extends LineSpan = RouteSpan> = (path: ChartPath) => readonly S[];

/** The points of the edge after vertex `i`. */
function edgePoints({ points, at }: PathLine, i: number): Vec2[] {
  const edge: Vec2[] = [];
  for (let p = at[i] ?? 0; p <= (at[i + 1] ?? 0); p += 2) {
    edge.push({ x: points[p] ?? 0, y: points[p + 1] ?? 0 });
  }
  return edge;
}

/** Half-way along a span of `length`; none for a span with no length. */
function middleOf(line: PathLine, { from, to }: Span, length: number) {
  const reachOf = (vertex: number) => (line.reach[vertex] ?? 0) - (line.reach[from] ?? 0);
  if (length === 0) return undefined;
  let edge = from;
  while (edge + 1 < to && reachOf(edge + 1) <= length / 2) edge++;
  return pointAlong(edgePoints(line, edge), length / 2 - reachOf(edge));
}

/** What a span's ends alone decide, so that a change of the points that stop it keeps it. */
type Measured = Pick<RouteSpan, 'id' | 'length' | 'start' | 'middle'>;

function measuredSpan(path: ChartPath, span: Span, line: PathLine): Measured {
  const length = (line.reach[span.to] ?? 0) - (line.reach[span.from] ?? 0);
  const middle = middleOf(line, span, length);
  return {
    id: spanIdentity(path, span),
    length,
    start: gridIdentity(path.coordinates[span.from] ?? [0, 0]),
    ...(middle && { middle: { ...middle, ...readingAngle(middle.direction) } }),
  };
}

/** Each line's stretches measured so far, by their ends. */
const stretches = new WeakMap<PathLine, Map<number, Measured>>();

function routeSpan(path: ChartPath, span: Span, line: PathLine): RouteSpan {
  const known = stretches.get(line) ?? new Map<number, Measured>();
  stretches.set(line, known);
  const key = span.from * line.reach.length + span.to;
  const measured = known.get(key) ?? measuredSpan(path, span, line);
  known.set(key, measured);
  return { ...span, ...measured, line };
}

/** Keeps each path's spans once made. */
function keptSpans<S extends LineSpan>(make: (path: ChartPath) => readonly S[]): SpansOf<S> {
  const walked = new Map<ChartPath, readonly S[]>();
  return (path) => {
    const known = walked.get(path);
    if (known) return known;
    const spans = make(path);
    walked.set(path, spans);
    return spans;
  };
}

/** The spans of each path between the stops `cuts` names, kept once walked. */
export const pathSpans = (cuts: Cuts, lineOf: LineOf): SpansOf =>
  keptSpans((path) => spansOf(path, cuts).map((span) => routeSpan(path, span, lineOf(path))));

/** The spans of paths that nothing stops, as the areas are: each path whole. */
export const uncutSpans = (lineOf: LineOf): SpansOf<LineSpan> =>
  keptSpans((path) => {
    const line = lineOf(path);
    return spansOf(path, NO_CUTS).map((span) => Object.assign(span, { line }));
  });
