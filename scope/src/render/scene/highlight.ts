/** The label to light up for the item the tree points at, drawn or not. */

import { CHART_COLORS, PALETTE } from '../../design/palette';
import type { ChartItem } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import { LAYER_TABLE } from '../../lib/layers';
import { isPointLayer, isRouteLayer } from '../../lib/mapsetFormat';
import { type ChartPoint, pointsAlong } from '../../lib/topology';
import type { Batch } from '../protocol';
import { putAreaLabel } from './areaLabels';
import {
  type FitInput,
  type LabelsInput,
  placedPoint,
  type PlaceInput,
  putPointLabel,
} from './chart';
import { type FigureOut, putPointMark } from './figures';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { itemLabels, putLabel, type RouteLabelOut, type SpanLabel } from './spanDesignators';

/** What the highlight reads: the chart as the scene holds it, and where its labels went. */
type HighlightInput = Pick<LabelsInput, 'topology' | 'project' | 'routeSpans' | 'atlas'> &
  Pick<FitInput, 'settledScale' | 'shown'> &
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

/** Puts the span labels of a route, whole, with its designator lit. */
function putRouteLabels(
  item: ChartItem,
  { topology, routeSpans, spanLabels, settledScale, shown }: HighlightInput,
  out: RouteLabelOut,
) {
  const stage = { topology, routeSpans, scale: settledScale(), text: out.text, shown };
  for (const label of itemLabels(item, stage, spanLabels)) {
    putLabel(label, out, { key: item.key, color: PALETTE.hover });
  }
}

/** Puts the ident of each of `points`, drawn or not, and its symbol when `symbols` is given. */
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
 * and the points it passes. A route's label is the chart's, by span, where the span has room for
 * it; a point's is its ident as the chart would place it. An area's says what DENSE says at any
 * density: on the name the chart drew, else centred on its place, with no room test and no
 * density gate.
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
