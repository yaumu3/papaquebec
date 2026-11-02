/** The label to light up for the item the tree points at, drawn or not. */

import { CHART_COLORS, PALETTE } from '../../design/palette';
import type { ChartItem } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import { isProcedureLayer, LAYER_TABLE } from '../../lib/layers';
import { isPointLayer, isRouteLayer } from '../../lib/mapsetFormat';
import { type ChartPoint, pointsAlong } from '../../lib/topology';
import type { Batch } from '../protocol';
import { putAreaLabel } from './areaLabels';
import { type LabelsInput, placedPoint, type PlaceInput, putPointLabel } from './chart';
import { type FigureOut, putPointMark } from './figures';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { itemLabels, putLabel, type RouteLabelOut, type SpanLabel } from './spanDesignators';

/** What the highlight reads: the chart as the scene holds it, and where its labels went. */
type HighlightInput = Pick<LabelsInput, 'topology' | 'project' | 'routeSpans' | 'atlas'> &
  PlaceInput & {
    /** The span labels the chart draws for routes, by span identity. */
    spanLabels: ReadonlyMap<string, SpanLabel>;
    /** Where the chart drew each area item's name. */
    areaNames: ReadonlyMap<string, Anchor>;
  };

/** What lights an item, a slot's worth each. */
export interface Highlight {
  /** A route's or an area's label, under the chart's points: gaps, text, then segments. */
  label: [Batch, Batch, Batch];
  /** The points lit, over the chart's own: the strokes and markers of symbols, then idents. */
  points: [Batch, Batch, Batch];
}

/** The labels a procedure is lit on: those its chart label lists, else its first span's. */
function namedOnce(labels: SpanLabel[], key: string, spanLabels: HighlightInput['spanLabels']) {
  const listed = labels.filter((l) => spanLabels.get(l.id)?.designators.some((d) => d.key === key));
  return listed.length > 0 ? listed : labels.slice(0, 1);
}

/**
 * Puts the span labels a route's designator is on, whole, with it lit: on every span of an airway,
 * and for a procedure on the spans whose chart label lists it, else on its first span only.
 */
function putRouteLabels(
  item: ChartItem,
  { topology, routeSpans, spanLabels }: HighlightInput,
  out: RouteLabelOut,
) {
  const labels = itemLabels(item, { topology, routeSpans }, spanLabels);
  const shown = isProcedureLayer(item.layer) ? namedOnce(labels, item.key, spanLabels) : labels;
  for (const label of shown) putLabel(label, out, { key: item.key, color: PALETTE.hover });
}

/** Puts the ident of each of `points`, drawn or not, and its symbol when `symbols` are asked for. */
function putPoints(
  points: readonly ChartPoint[],
  project: ProjectFn,
  idents: TextBatch,
  symbols?: FigureOut,
) {
  for (const point of points) {
    const { style } = LAYER_TABLE[point.layer];
    const placed = placedPoint(point, project);
    putPointLabel(idents, placed, style.label, CHART_COLORS.pointHover);
    if (symbols) putPointMark(symbols, placed.at, style, point.kind, CHART_COLORS.pointHover);
  }
}

/**
 * The batches that light an item, in the hover grey and a point brighter. A route lights its label
 * and the points it passes. A route's label is the chart's, by span; a point's is its ident as the
 * chart would place it. An area's says what DENSE says at any density: on the name the chart drew,
 * else centred on its place, with no room test and no density gate.
 */
export function buildHighlight(item: ChartItem, input: HighlightInput): Highlight {
  const out = {
    gaps: new LineBatch(1),
    text: new TextBatch(input.atlas, 1),
    strokes: new LineBatch(1),
  };
  const symbols = { lines: new LineBatch(1), markers: new MarkerBatch(1) };
  const idents = new TextBatch(input.atlas, 1);
  const { topology, project } = input;
  if (isRouteLayer(item.layer)) {
    putRouteLabels(item, input, out);
    putPoints(pointsAlong(item, topology), project, idents, symbols);
  } else if (isPointLayer(item.layer)) {
    putPoints(
      topology.points.filter((p) => p.key === item.key),
      project,
      idents,
    );
  } else putAreaLabel(item, input.areaNames.get(item.key), input.placeOf, out, PALETTE.hover);
  return {
    label: [out.gaps.finish(), out.text.finish(), out.strokes.finish()],
    points: [symbols.lines.finish(), symbols.markers.finish(), idents.finish()],
  };
}
