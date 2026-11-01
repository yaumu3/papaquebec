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
export interface Pole {
  at: Vec2;
  room: number;
}

interface Cell extends Pole {
  half: number;
  /** The best room anything in the cell could have. */
  reach: number;
}

const edgesOf = (rings: readonly (readonly Vec2[])[]): Segment[] =>
  rings.flatMap((ring) => ring.map((a, i): Segment => [a, ring[(i + 1) % ring.length] ?? a]));

/** Distance from `p` to the nearest edge, negative outside; a hole is outside. */
function roomAt(p: Vec2, edges: readonly Segment[]): number {
  let crossings = 0;
  let nearest = Infinity;
  for (const [a, b] of edges) {
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      crossings++;
    }
    nearest = Math.min(nearest, distanceToSegment(p, a, b));
  }
  return crossings % 2 === 1 ? nearest : -nearest;
}

function cellAt(at: Vec2, half: number, edges: readonly Segment[]): Cell {
  const room = roomAt(at, edges);
  return { at, room, half, reach: room + half * Math.SQRT2 };
}

/** The cells of a given half-size that cover a box, row by row. */
function coverOf(min: Vec2, max: Vec2, half: number, edges: readonly Segment[]): Cell[] {
  const cells: Cell[] = [];
  for (let x = min.x; x < max.x; x += half * 2) {
    for (let y = min.y; y < max.y; y += half * 2) {
      cells.push(cellAt({ x: x + half, y: y + half }, half, edges));
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
export function poleOf(rings: readonly (readonly Vec2[])[]): Pole | undefined {
  const [exterior = []] = rings;
  if (ringArea(exterior) === 0) return undefined;
  const xs = exterior.map((p) => p.x);
  const ys = exterior.map((p) => p.y);
  const min = { x: Math.min(...xs), y: Math.min(...ys) };
  const max = { x: Math.max(...xs), y: Math.max(...ys) };
  const side = Math.min(max.x - min.x, max.y - min.y);
  const edges = edgesOf(rings);
  const queue = coverOf(min, max, side / 2, edges);
  let best = cellAt({ x: (min.x + max.x) / 2, y: (min.y + max.y) / 2 }, 0, edges);
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
      queue.push(cellAt({ x: x + dx * half, y: y + dy * half }, half, edges));
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
  ring.map(([lon, lat]) => project(lat, lon));

/** The polygon part with the largest exterior ring, measured on the plane. */
function largestPolygon(parts: readonly ItemPart[], project: ProjectFn) {
  let best: { rings: LonLat[][]; area: number } | undefined;
  for (const { geometry } of parts) {
    if (geometry.type !== 'Polygon') continue;
    const area = ringArea(projected(geometry.coordinates[0] ?? [], project));
    if (!best || area > best.area) best = { rings: geometry.coordinates, area };
  }
  return best?.rings;
}

/**
 * Where an item's label goes. A polygon item has it at the pole of its largest polygon part, the
 * rings joined by straight chords once projected. An item of lines has it at the middle of its
 * first part's geodesic. None for an item with neither.
 */
export function areaPlaceOf(item: ChartItem, project: ProjectFn): AreaPlace | undefined {
  const rings = largestPolygon(item.parts, project);
  const pole = rings && poleOf(rings.map((ring) => projected(ring, project)));
  if (rings && pole) return { ...pole, footprint: footprintOf(rings[0] ?? []) };
  const line = item.parts[0]?.geometry;
  if (line?.type !== 'LineString') return undefined;
  const path = geodesicLine(line.coordinates, project);
  const middle = midpointOf(path);
  return middle && { at: middle.at };
}
