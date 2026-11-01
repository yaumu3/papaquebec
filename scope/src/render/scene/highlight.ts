/** The label to light up for the item the tree points at, drawn or not. */

import type { ChartItem } from '../../lib/chart';
import { isProcedureLayer, isStyled } from '../../lib/layers';
import { isPointLayer, isRouteLayer } from '../../lib/mapsetFormat';
import type { Batch } from '../protocol';
import { putAreaLabel } from './areaLabels';
import { placedPoint, putPointLabel } from './chart';
import type { LabelsInput, PlaceInput } from './chart';
import { type DrawnLabel, type LabelOut, redrawLabel } from './drawnLabels';
import { isPointStyle, LAYER_STYLES, type LayerStyle } from './layerStyles';
import { LineBatch, TextBatch } from './pack';
import { putLabel, type RouteLabelOut } from './routeLabels';
import { THEME } from './rules';
import { routeCuts } from './runs';
import { itemLabels, type SpanLabel } from './spanDesignators';

/** What the highlight reads: the chart as the scene holds it, and where an area's label goes. */
type HighlightInput = Pick<LabelsInput, 'topology' | 'drawnPoints' | 'project' | 'atlas'> &
  PlaceInput & {
    /** The span labels the chart draws for routes, by span identity. */
    spanLabels: ReadonlyMap<string, SpanLabel>;
  };

/**
 * An area's or a point's label as the highlight draws it. A point's is the chart's record, or
 * its ident placed as the chart would place it. An area's says what DENSE says at any density:
 * on the name the chart drew, else centred on its place, with no room test and no density gate.
 */
export function highlightOf(
  item: ChartItem,
  drawn: DrawnLabel | undefined,
  input: HighlightInput,
): DrawnLabel | undefined {
  if (!isStyled(item.layer)) return undefined;
  const out = { text: new TextBatch(input.atlas), strokes: new LineBatch(), drawn: new Map() };
  if (isPointLayer(item.layer)) {
    if (drawn) return drawn;
    putPointLabels(item, LAYER_STYLES[item.layer], input, out);
  } else putAreaLabel(item, drawn, input.placeOf, out);
  return out.drawn.get(item.key);
}

/** The label with the designators of the item `key` in the hover grey. */
const lit = (label: SpanLabel, key: string): SpanLabel => ({
  ...label,
  designators: label.designators.map((d) =>
    d.key === key ? { ...d, label: { ...d.label, color: THEME.hover } } : d,
  ),
});

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
  { topology, drawnPoints, project, spanLabels }: HighlightInput,
  out: RouteLabelOut,
) {
  const cuts = routeCuts([item], drawnPoints);
  const labels = itemLabels(item, { topology, cuts, project }, spanLabels);
  const shown = isProcedureLayer(item.layer) ? namedOnce(labels, item.key, spanLabels) : labels;
  for (const label of shown) {
    putLabel(lit(label, item.key), out);
  }
}

/** Puts the ident beside every part of a point item, drawn or not. */
function putPointLabels(
  item: ChartItem,
  style: LayerStyle,
  { topology, project }: HighlightInput,
  out: LabelOut,
) {
  if (!isPointStyle(style)) return;
  for (const point of topology.points.filter((p) => p.key === item.key)) {
    putPointLabel(out, placedPoint(point, project), style.label);
  }
}

/** The batches that light an item's label in the hover grey: gaps, then text, then segments. */
export function buildHighlight(
  item: ChartItem,
  drawn: DrawnLabel | undefined,
  input: HighlightInput,
): [Batch, Batch, Batch] {
  const out = {
    gaps: new LineBatch(1),
    text: new TextBatch(input.atlas, 1),
    strokes: new LineBatch(1),
  };
  if (isRouteLayer(item.layer)) putRouteLabels(item, input, out);
  else {
    const label = highlightOf(item, drawn, input);
    if (label) redrawLabel(label, THEME.hover, out);
  }
  return [out.gaps.finish(), out.text.finish(), out.strokes.finish()];
}
