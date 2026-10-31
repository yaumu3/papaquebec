/**
 * The topology of a chart: which outlines share which edges. A vertex's identity is its
 * position on the 1e-5 degree grid; an edge is the unordered pair of the vertices of two
 * consecutive positions of a path. Areas and routes are separate networks, so an area edge and
 * a route edge never meet.
 */

import { type Chart, isUpperStratum, type ItemPart, outlinesOf, toGrid } from './chart';
import { DRAW_STACK } from './layers';
import type { LonLat } from './mapdata';
import { isPointLayer, isRouteLayer, type Layer } from './mapsetFormat';

/** One outline of a part, with no two neighbouring positions at one identity. */
export interface ChartPath {
  part: ItemPart;
  layer: Layer;
  coordinates: LonLat[];
  /** The vertex of each coordinate. */
  vertices: Int32Array;
  /** The edge between vertices `i` and `i + 1`, numbered within the network. */
  edges: Int32Array;
  /** The network-wide number of the path's first edge occurrence; later ones follow it. */
  firstOccurrence: number;
}

/** The paths of one class, areas or routes. Owners are chosen within a network. */
export interface Network {
  /** Front of the draw stack first, a lower stratum before an upper, then in chart order. */
  paths: readonly ChartPath[];
  edgeCount: number;
}

export interface Topology {
  chart: Chart;
  areas: Network;
  routes: Network;
}

type Outline = Pick<ChartPath, 'part' | 'layer' | 'coordinates'>;

const EDGE_KEY_BASE = 2 ** 26;
const IDENTITY_KEY_BASE = 2 ** 25;

/** The number a key was first given, handing out the next one to a key not seen before. */
function numberOf(numbers: Map<number, number>, key: number): number {
  const known = numbers.get(key);
  if (known !== undefined) return known;
  numbers.set(key, numbers.size);
  return numbers.size - 1;
}

/** Gives one vertex number to every identity. */
function vertexNumbering() {
  const numbers = new Map<number, number>();
  return ([lon, lat]: LonLat) => numberOf(numbers, toGrid(lon) * IDENTITY_KEY_BASE + toGrid(lat));
}

/** An outline's positions and their vertices, without a position at its neighbour's identity. */
function distinctVertices(outline: LonLat[], vertexOf: (at: LonLat) => number) {
  const coordinates: LonLat[] = [];
  const vertices: number[] = [];
  for (const at of outline) {
    const vertex = vertexOf(at);
    if (vertex === vertices.at(-1)) continue;
    coordinates.push(at);
    vertices.push(vertex);
  }
  return { coordinates, vertices };
}

const stackIndex = (layer: Layer) => DRAW_STACK.indexOf(layer);

const byFront = (a: Outline, b: Outline) =>
  stackIndex(a.layer) - stackIndex(b.layer) ||
  Number(isUpperStratum(a.part)) - Number(isUpperStratum(b.part));

function networkOf(outlines: Outline[], vertexOf: (at: LonLat) => number): Network {
  const edgeNumbers = new Map<number, number>();
  const edgeOf = (a: number, b: number) =>
    numberOf(edgeNumbers, Math.min(a, b) * EDGE_KEY_BASE + Math.max(a, b));
  const paths: ChartPath[] = [];
  let occurrences = 0;
  for (const { part, layer, coordinates: outline } of outlines.toSorted(byFront)) {
    const { coordinates, vertices } = distinctVertices(outline, vertexOf);
    const edges = vertices.slice(1).map((vertex, i) => edgeOf(vertices[i] ?? 0, vertex));
    paths.push({
      part,
      layer,
      coordinates,
      vertices: Int32Array.from(vertices),
      edges: Int32Array.from(edges),
      firstOccurrence: occurrences,
    });
    occurrences += edges.length;
  }
  return { paths, edgeCount: edgeNumbers.size };
}

/** The shared-edge structure of the chart's area outlines and route lines. */
export function topologyOf(chart: Chart): Topology {
  const areas: Outline[] = [];
  const routes: Outline[] = [];
  for (const { layer, parts } of chart) {
    if (isPointLayer(layer) || layer === 'hold') continue;
    const into = isRouteLayer(layer) ? routes : areas;
    for (const part of parts) {
      for (const coordinates of outlinesOf(part.geometry)) into.push({ part, layer, coordinates });
    }
  }
  const vertexOf = vertexNumbering();
  return { chart, areas: networkOf(areas, vertexOf), routes: networkOf(routes, vertexOf) };
}

/** The edges of a path from vertex index `from` to `to`. */
export interface Stretch {
  from: number;
  to: number;
}

/**
 * Per edge of the network, the occurrence that draws it: the first among the drawn parts' paths,
 * which are in front-first order. `-1` where no drawn part has the edge.
 */
export function ownersOf(network: Network, drawn: ReadonlySet<ItemPart>): Int32Array {
  const owners = new Int32Array(network.edgeCount).fill(-1);
  for (const path of network.paths) {
    if (!drawn.has(path.part)) continue;
    path.edges.forEach((edge, i) => {
      if (owners[edge] === -1) owners[edge] = path.firstOccurrence + i;
    });
  }
  return owners;
}

/**
 * The runs of a path within a stretch (the whole path by default): maximal chains of consecutive
 * edges the path owns. A run does not wrap across the start of a ring.
 */
export function runsOf(
  path: ChartPath,
  owners: Int32Array,
  within: Stretch = { from: 0, to: path.edges.length },
): Stretch[] {
  const runs: Stretch[] = [];
  let from = -1;
  for (let i = within.from; i < within.to; i++) {
    const owned = owners[path.edges[i] ?? -1] === path.firstOccurrence + i;
    if (owned && from < 0) from = i;
    if (!owned && from >= 0) {
      runs.push({ from, to: i });
      from = -1;
    }
  }
  if (from >= 0) runs.push({ from, to: within.to });
  return runs;
}
