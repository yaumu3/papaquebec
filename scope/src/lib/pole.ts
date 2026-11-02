/** Where the label of an area item goes: inside it at its pole, the point farthest from every edge. */

import type { ChartItem, ItemPart } from './chart';
import { distanceToSegment, type ProjectFn, type Segment, type Vec2 } from './geo';
import { geodesicLine } from './geodesic';
import { footprintOf } from './labelStacks';
import type { LonLat } from './mapdata';
import { midpointOf } from './polyline';

/** The area a ring encloses, whichever way it winds. */
export function ringArea(ring: readonly Vec2[]): number {
  const twice = ring.reduce((sum, a, i) => {
    const b = ring[(i + 1) % ring.length] ?? a;
    return sum + (a.x * b.y - b.x * a.y);
  }, 0);
  return Math.abs(twice) / 2;
}

/** A point inside a polygon and the distance from it to the nearest edge. */
interface Pole {
  at: Vec2;
  room: number;
}

interface Cell extends Pole {
  half: number;
  /** The best room anything in the cell could have. */
  reach: number;
}

type Rings = readonly (readonly Vec2[])[];

/** Distance from a point to the nearest edge, negative outside; a hole is outside. */
type Room = (p: Vec2) => number;

/** How a polygon's rooms are measured. */
export type RoomAt = (rings: Rings) => Room;

/** Edges in one chunk: neighbours along a ring, so their box stays small. */
const CHUNK_EDGES = 16;

/** Neighbouring edges and the box around them. */
interface Chunk {
  edges: readonly Segment[];
  min: Vec2;
  max: Vec2;
}

function chunkOf(edges: readonly Segment[]): Chunk {
  const min = { x: Infinity, y: Infinity };
  const max = { x: -Infinity, y: -Infinity };
  const stretch = ({ x, y }: Vec2) => {
    min.x = Math.min(min.x, x);
    min.y = Math.min(min.y, y);
    max.x = Math.max(max.x, x);
    max.y = Math.max(max.y, y);
  };
  for (const edge of edges) {
    stretch(edge[0]);
    stretch(edge[1]);
  }
  return { edges, min, max };
}

function chunksOf(rings: Rings): Chunk[] {
  const chunks: Chunk[] = [];
  for (const ring of rings) {
    const edges = ring.map((a, i): Segment => [a, ring[(i + 1) % ring.length] ?? a]);
    for (let i = 0; i < edges.length; i += CHUNK_EDGES) {
      chunks.push(chunkOf(edges.slice(i, i + CHUNK_EDGES)));
    }
  }
  return chunks;
}

/** The square of how near a box comes to `p`. */
function nearestSquare(p: Vec2, { min, max }: Chunk): number {
  const dx = Math.max(min.x - p.x, 0, p.x - max.x);
  const dy = Math.max(min.y - p.y, 0, p.y - max.y);
  return dx * dx + dy * dy;
}

/** The square of how far a box reaches from `p`: an edge of its chunk is at least this near. */
function farthestSquare(p: Vec2, { min, max }: Chunk): number {
  const dx = Math.max(p.x - min.x, max.x - p.x);
  const dy = Math.max(p.y - min.y, max.y - p.y);
  return dx * dx + dy * dy;
}

/** A square distance a rounding error cannot put past the one it is compared to. */
const WITH_ROUNDING = 1 + 1e-9;

/**
 * The room at any point of a polygon, as if measured from every edge: a chunk with no edge that
 * could be the nearest and none that the ray east from the point can cross is passed over.
 */
export const roomsAmong: RoomAt = (rings) => {
  const chunks = chunksOf(rings);
  return (p) => {
    let bound = Infinity;
    for (const chunk of chunks) bound = Math.min(bound, farthestSquare(p, chunk));
    let crossings = 0;
    let nearest = Infinity;
    for (const chunk of chunks) {
      const { min, max, edges } = chunk;
      const near = nearestSquare(p, chunk) <= bound * WITH_ROUNDING;
      const across = p.y >= min.y && p.y <= max.y && p.x <= max.x;
      if (!near && !across) continue;
      for (const edge of edges) {
        const a = edge[0];
        const b = edge[1];
        if (across && a.y > p.y !== b.y > p.y) {
          if (p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) crossings++;
        }
        if (near) nearest = Math.min(nearest, distanceToSegment(p, a, b));
      }
    }
    return crossings % 2 === 1 ? nearest : -nearest;
  };
};

function cellAt(at: Vec2, half: number, room: Room): Cell {
  const measured = room(at);
  return { at, room: measured, half, reach: measured + half * Math.SQRT2 };
}

/** The cells of a given half-size that cover a box, row by row. */
function coverOf(min: Vec2, max: Vec2, half: number, room: Room): Cell[] {
  const cells: Cell[] = [];
  for (let x = min.x; x < max.x; x += half * 2) {
    for (let y = min.y; y < max.y; y += half * 2) {
      cells.push(cellAt({ x: x + half, y: y + half }, half, room));
    }
  }
  return cells;
}

/** Removes and returns the cell with the most room to gain. */
function takeMostPromising(queue: Cell[]): Cell | undefined {
  let at = 0;
  queue.forEach((cell, i) => {
    if (cell.reach > (queue[at]?.reach ?? -Infinity)) at = i;
  });
  const last = queue.pop();
  if (at >= queue.length) return last;
  const taken = queue[at];
  if (last) queue[at] = last;
  return taken;
}

/**
 * The pole of a polygon, its exterior ring first and then its holes: the point inside farthest
 * from every edge, to within a hundredth of the box's shorter side. Polylabel's method: square
 * cells, the most promising first, split while they could still beat the best found. None for
 * an exterior ring that encloses no area.
 */
export function poleOf(rings: Rings, measure: RoomAt = roomsAmong): Pole | undefined {
  const [exterior = []] = rings;
  if (ringArea(exterior) === 0) return undefined;
  const xs = exterior.map((p) => p.x);
  const ys = exterior.map((p) => p.y);
  const min = { x: Math.min(...xs), y: Math.min(...ys) };
  const max = { x: Math.max(...xs), y: Math.max(...ys) };
  const side = Math.min(max.x - min.x, max.y - min.y);
  const room = measure(rings);
  const queue = coverOf(min, max, side / 2, room);
  let best = cellAt({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 }, 0, room);
  while (queue.length > 0) {
    const cell = takeMostPromising(queue);
    if (!cell) break;
    if (cell.room > best.room) best = cell;
    if (cell.reach - best.room <= side / 100) continue;
    const half = cell.half / 2;
    const { x, y } = cell.at;
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      queue.push(cellAt({ x: x + dx * half, y: y + dy * half }, half, room));
    }
  }
  return { at: best.at, room: best.room };
}

/** Where an area item's label goes and what to test it against. */
export interface AreaPlace {
  at: Vec2;
  /** The distance from `at` to the nearest edge; none for a line. */
  room?: number;
  /** What the exterior ring of its largest polygon covers; none for a line. */
  footprint?: string;
}

const projected = (ring: readonly LonLat[], project: ProjectFn): Vec2[] =>
  ring.map((at) => project(at[1], at[0]));

/** The polygon part with the largest exterior ring, measured on the plane. */
function largestPolygon(parts: readonly ItemPart[], project: ProjectFn) {
  let best: { rings: LonLat[][]; exterior: Vec2[]; area: number } | undefined;
  for (const { geometry } of parts) {
    if (geometry.type !== 'Polygon') continue;
    const exterior = projected(geometry.coordinates[0] ?? [], project);
    const area = ringArea(exterior);
    if (!best || area > best.area) best = { rings: geometry.coordinates, exterior, area };
  }
  return best;
}

/**
 * Where an item's label goes. A polygon item has it at the pole of its largest polygon part, the
 * rings joined by straight chords once projected. An item of lines has it at the middle of its
 * first part's geodesic. None for an item with neither.
 */
export function areaPlaceOf(item: ChartItem, project: ProjectFn): AreaPlace | undefined {
  const largest = largestPolygon(item.parts, project);
  const holes = largest?.rings.slice(1).map((ring) => projected(ring, project));
  const pole = largest && holes && poleOf([largest.exterior, ...holes]);
  if (largest && pole) return { ...pole, footprint: footprintOf(largest.rings[0] ?? []) };
  const line = item.parts[0]?.geometry;
  if (line?.type !== 'LineString') return undefined;
  const path = geodesicLine(line.coordinates, project);
  const middle = midpointOf(path);
  return middle && { at: middle.at };
}
