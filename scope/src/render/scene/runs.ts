import { isUpperStratum, type ItemPart } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import type { StyledLayer } from '../../lib/layers';
import { isRouteLayer } from '../../lib/mapsetFormat';
import { type Cuts, NO_CUTS, type Span, spansOf, stopCuts } from '../../lib/stops';
import {
  type ChartPath,
  type ChartPoint,
  type Network,
  ownersOf,
  runsOf,
  type Stretch,
} from '../../lib/topology';
import { LAYER_STYLES, type LineLayerStyle } from './layerStyles';
import { type Anchor, chordOf, type LineBatch, type LineStyle, type SpanPlace } from './pack';
import { route } from './paths';

/** A line's form in the layer's style, refined by the part's kind and stratum. */
function lineLook(style: LineLayerStyle, part: ItemPart): LineStyle {
  const { kind } = part.properties;
  const byKind = kind === undefined ? undefined : style.kinds?.get(kind);
  const upper = isUpperStratum(part) ? style.upper : undefined;
  return { ...style, ...byKind, ...upper };
}

const lengthOf = (points: readonly Anchor[]): number =>
  points.slice(1).reduce((sum, p, i) => sum + chordOf(points[i] ?? p, p), 0);

/**
 * The polylines of a span's runs, each with its place in the span: the geodesic of every edge of
 * the span is subdivided once, so the distances back and ahead run across vertices and across
 * the runs another part owns.
 */
function placedRuns(path: ChartPath, span: Span, runs: Stretch[], project: ProjectFn) {
  const edges = path.coordinates
    .slice(span.from, span.to)
    .map((at, i) => route([at, path.coordinates[span.from + i + 1] ?? at], project));
  const reach = [0];
  for (const e of edges) reach.push((reach.at(-1) ?? 0) + lengthOf(e));
  const length = reach.at(-1) ?? 0;
  return runs.map(({ from, to }) => {
    const pieces = edges.slice(from - span.from, to - span.from);
    const points = pieces.flatMap((e, i) => (i === 0 ? e : e.slice(1)));
    const place: SpanPlace = {
      back: reach[from - span.from] ?? 0,
      length,
      cutBack: span.cutBack,
      cutAhead: span.cutAhead,
    };
    return { points, place };
  });
}

/** The polylines a span's runs draw: placed in the span when it is cut back, else just routed. */
function polylinesOf(
  path: ChartPath,
  span: Span,
  runs: Stretch[],
  project: ProjectFn,
): { points: Anchor[]; place?: SpanPlace }[] {
  if (runs.length === 0) return [];
  if (span.cutBack === 0 && span.cutAhead === 0) {
    return runs.map(({ from, to }) => ({
      points: route(path.coordinates.slice(from, to + 1), project),
    }));
  }
  return placedRuns(path, span, runs, project);
}

/**
 * Draws the drawn parts of a network back to front, each edge once: a part draws its runs, each
 * as one polyline in its layer's style. A route's spans between stops are cut back in the line
 * shader from the stops `cuts` names.
 */
export function drawRuns(
  network: Network,
  drawn: ReadonlySet<ItemPart>,
  cuts: Cuts,
  project: ProjectFn,
  lines: LineBatch,
): void {
  const owners = ownersOf(network, drawn);
  for (const path of network.paths.toReversed()) {
    const style = LAYER_STYLES[path.layer];
    const look = lineLook(style, path.part);
    for (const span of spansOf(path, cuts)) {
      const runs = runsOf(path, owners, span);
      for (const { points, place } of polylinesOf(path, span, runs, project)) {
        lines.polyline(points, style.color, look, place);
      }
    }
  }
}

/** The stops of the routes: where the drawn points stand, if a route layer is among those to draw. */
export function routeCuts(
  layers: readonly StyledLayer[],
  drawnPoints: () => readonly ChartPoint[],
): Cuts {
  const routed = layers.some(isRouteLayer);
  return routed ? stopCuts(drawnPoints(), (layer) => LAYER_STYLES[layer].size) : NO_CUTS;
}
