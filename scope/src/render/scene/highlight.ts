/** The label to light up for the item the tree points at, drawn or not. */

import type { ChartItem } from '../../lib/chart';
import { isProcedureLayer, isStyled } from '../../lib/layers';
import { isPointLayer, isRouteLayer } from '../../lib/mapsetFormat';
import { putAreaLabel } from './areaLabels';
import { placedPoint, putPointLabel } from './chart';
import type { LabelsInput, PlaceInput } from './chart';
import { copyOf, type DrawnLabel, type LabelOut } from './drawnLabels';
import { isPointStyle, LAYER_STYLES, type LayerStyle } from './layerStyles';
import { LineBatch, TextBatch } from './pack';
import { putLabel, type RouteLabelOut } from './routeLabels';
import { routeCuts } from './runs';
import { soleLabels } from './spanDesignators';

/** What the highlight reads: the chart as the scene holds it, and where an area's label goes. */
type HighlightInput = Pick<
  LabelsInput,
  'topology' | 'drawnPoints' | 'project' | 'labelDensity' | 'atlas'
> &
  PlaceInput;

/**
 * An item's label as the highlight draws it. Where the chart drew the label that is its record;
 * elsewhere the label is placed as the chart would place it, with no room test and no density
 * gate, its rows those of the label density. A route's designator is added on every span the
 * record leaves out, alone, and a procedure is named once, on its first span.
 */
export function highlightOf(
  item: ChartItem,
  drawn: DrawnLabel | undefined,
  input: HighlightInput,
): DrawnLabel | undefined {
  if (!isStyled(item.layer)) return undefined;
  if (drawn && !isRouteLayer(item.layer)) return drawn;
  const out = {
    gaps: new LineBatch(),
    text: new TextBatch(input.atlas),
    strokes: new LineBatch(),
    drawn: new Map<string, DrawnLabel>(),
  };
  if (isRouteLayer(item.layer)) putRouteLabels(item, drawn, input, out);
  else if (isPointLayer(item.layer)) putPointLabels(item, LAYER_STYLES[item.layer], input, out);
  else putAreaLabel(item, input.labelDensity, input.placeOf, out);
  return out.drawn.get(item.key);
}

/**
 * Puts a route's designator, alone, on each span the record leaves out; a procedure is named once,
 * on its first span, and only if the chart did not name it.
 */
function putRouteLabels(
  item: ChartItem,
  drawn: DrawnLabel | undefined,
  { topology, drawnPoints, project }: HighlightInput,
  out: RouteLabelOut,
) {
  if (drawn) out.drawn.set(item.key, copyOf(drawn));
  const cuts = routeCuts([item], drawnPoints);
  const sole = soleLabels(item, { topology, cuts, project });
  const added = isProcedureLayer(item.layer)
    ? drawn
      ? []
      : sole.slice(0, 1)
    : sole.filter((spanLabel) => !drawn?.spans.includes(spanLabel.id));
  for (const spanLabel of added) putLabel(spanLabel, out);
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
