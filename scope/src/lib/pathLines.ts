/**
 * Each path of a network drawn along its geodesics. A line depends only on its path's vertices and
 * the projection, so it outlives any choice of what draws, and an edge shared by several paths is
 * worked out once and read from the path that first ran it, whichever way this one runs it.
 */

import type { ProjectFn } from './geo';
import { pointsBetween } from './geodesic';
import type { LonLat } from './mapdata';
import { chordOf, type Midpoint, type Reading } from './polyline';
import type { ChartPath } from './topology';

/** What a stretch of a path's ends decide, so that a change of the points that stop it keeps it. */
export interface Measured {
  /** Shared by every path that runs this stretch, in either direction. */
  id: string;
  /** World length of the stretch. */
  length: number;
  /** The grid identity where the stretch starts on this path. */
  start: string;
  /** Half-way along, and how text reads there; none for a stretch with no length. */
  middle?: Midpoint & Reading;
}

/** A path on the plane. */
export interface PathLine {
  /** The path's vertices: which way the line runs. */
  vertices: Int32Array;
  /** x then y of every point along the path, one array however long it is. */
  points: ArrayLike<number>;
  /** Where each vertex's x is in `points`. */
  at: Int32Array;
  /** The world distance from the path's start to each vertex. */
  reach: Float64Array;
  /** The stretches measured so far, by their ends. */
  measured: Map<number, Measured>;
}

/** The line of a path, walked the first time it is asked for. */
export type LineOf = (path: ChartPath) => PathLine;

/** Goes on along an edge not yet walked, starting the line if nothing has. */
function walkEdge(points: number[], from: LonLat, to: LonLat, project: ProjectFn) {
  const a = { lat: from[1], lon: from[0] };
  const b = { lat: to[1], lon: to[0] };
  const pa =
    points.length > 0
      ? { x: points[points.length - 2] ?? 0, y: points[points.length - 1] ?? 0 }
      : project(a.lat, a.lon);
  if (points.length === 0) points.push(pa.x, pa.y);
  const pb = project(b.lat, b.lon);
  for (const { x, y } of pointsBetween(a, pa, b, pb, project)) points.push(x, y);
  points.push(pb.x, pb.y);
}

/** Goes on along an edge of `from`, its edge number `slot`, in the way `forward` says. */
function copyEdge(points: number[], from: PathLine, slot: number, forward: boolean) {
  const first = from.at[slot] ?? 0;
  const last = from.at[slot + 1] ?? 0;
  const start = forward ? first : last;
  const step = forward ? 2 : -2;
  const count = (last - first) / 2 + 1;
  for (let n = points.length === 0 ? 0 : 1; n < count; n++) {
    const at = start + n * step;
    points.push(from.points[at] ?? 0, from.points[at + 1] ?? 0);
  }
}

/** The length of the chords between two places in `points`. */
function lengthBetween(points: readonly number[], from: number, to: number): number {
  const a = { x: 0, y: 0 };
  const b = { x: 0, y: 0 };
  let length = 0;
  for (let i = from; i < to; i += 2) {
    a.x = points[i] ?? 0;
    a.y = points[i + 1] ?? 0;
    b.x = points[i + 2] ?? 0;
    b.y = points[i + 3] ?? 0;
    length += chordOf(a, b);
  }
  return length;
}

/**
 * The lines of the paths of one network, kept once walked: edges are numbered within a network,
 * and the lines hold as long as its topology and `project` do.
 */
export function pathLines(project: ProjectFn): LineOf {
  const walked = new Map<ChartPath, PathLine>();
  /** Per edge, the line that first ran it and which of its edges that was. */
  const homes: PathLine[] = [];
  const slots: number[] = [];

  const walk = ({ coordinates, vertices, edges }: ChartPath, line: PathLine, into: number[]) => {
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i] ?? -1;
      const home = homes[edge];
      const slot = slots[edge] ?? 0;
      if (home) copyEdge(into, home, slot, home.vertices[slot] === vertices[i]);
      else {
        homes[edge] = line;
        slots[edge] = i;
        walkEdge(into, coordinates[i] ?? [0, 0], coordinates[i + 1] ?? [0, 0], project);
      }
      const from = line.at[i] ?? 0;
      line.at[i + 1] = into.length - 2;
      line.reach[i + 1] = (line.reach[i] ?? 0) + lengthBetween(into, from, into.length - 2);
    }
  };

  return (path) => {
    const known = walked.get(path);
    if (known) return known;
    const into: number[] = [];
    const line: PathLine = {
      vertices: path.vertices,
      points: into,
      at: new Int32Array(path.vertices.length),
      reach: new Float64Array(path.vertices.length),
      measured: new Map(),
    };
    walk(path, line, into);
    line.points = new Float64Array(into);
    walked.set(path, line);
    return line;
  };
}
