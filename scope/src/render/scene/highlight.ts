/** The label to light up for the item the tree points at, drawn or not. */

import { CHART_COLORS, PALETTE } from '../../design/palette';
import type { ChartItem } from '../../lib/chart';
import { isPointStyle, isProcedureLayer, LAYER_TABLE } from '../../lib/layers';
import { isPointLayer, isRouteLayer } from '../../lib/mapsetFormat';
import type { Batch } from '../protocol';
import { putAreaLabel } from './areaLabels';
import { type LabelsInput, placedPoint, type PlaceInput, putPointLabel } from './chart';
import { type Anchor, LineBatch, TextBatch } from './pack';
import { itemLabels, putLabel, type RouteLabelOut, type SpanLabel } from './spanDesignators';

/** What the highlight reads: the chart as the scene holds it, and where its labels went. */
type HighlightInput = Pick<LabelsInput, 'topology' | 'project' | 'routeSpans' | 'atlas'> &
  PlaceInput & {
    /** The span labels the chart draws for routes, by span identity. */
    spanLabels: ReadonlyMap<string, SpanLabel>;
    /** Where the chart drew each area item's name. */
    areaNames: ReadonlyMap<string, Anchor>;
  };

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

/** Puts the ident beside every part of a point item, drawn or not. */
function putPointLabels(
  { key, layer }: ChartItem,
  { topology, project }: HighlightInput,
  text: TextBatch,
) {
  const { style } = LAYER_TABLE[layer];
  if (!isPointStyle(style)) return;
  for (const point of topology.points.filter((p) => p.key === key)) {
    putPointLabel(text, placedPoint(point, project), style.label, CHART_COLORS.pointHover);
  }
}

/**
 * The batches that light an item's label: gaps, then text, then segments, in the hover grey and
 * a point's brighter. A route's label is the chart's, by span; a point's is its ident as the chart
 * would place it. An area's says what DENSE says at any density: on the name the chart drew, else
 * centred on its place, with no room test and no density gate.
 */
export function buildHighlight(item: ChartItem, input: HighlightInput): [Batch, Batch, Batch] {
  const out = {
    gaps: new LineBatch(1),
    text: new TextBatch(input.atlas, 1),
    strokes: new LineBatch(1),
  };
  if (isRouteLayer(item.layer)) putRouteLabels(item, input, out);
  else if (isPointLayer(item.layer)) putPointLabels(item, input, out.text);
  else putAreaLabel(item, input.areaNames.get(item.key), input.placeOf, out, PALETTE.hover);
  return [out.gaps.finish(), out.text.finish(), out.strokes.finish()];
}
