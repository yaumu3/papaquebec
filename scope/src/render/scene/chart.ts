import type { ChartItem } from '../../lib/chart';
import type { ShownMemory } from '../../lib/fits';
import type { ProjectFn } from '../../lib/geo';
import type { StyledLayer } from '../../lib/layers';
import type { AreaPlace } from '../../lib/pole';
import { NO_CUTS } from '../../lib/stops';
import type { ChartPoint, Topology } from '../../lib/topology';
import type { LabelDensity } from '../../state/settingsDefaults';
import type { AtlasInfo, Batch } from '../protocol';
import type { CHART_SLICES, ShapeBatches } from '../slots';
import { buildAreaLabels } from './areaLabels';
import { isPointStyle, LAYER_STYLES, labelReaches } from './layerStyles';
import { LineBatch, MarkerBatch, TextBatch } from './pack';
import { buildRouteLabels } from './routeLabels';
import { drawRuns, partsOf, routeCuts } from './runs';

interface ShapesInput {
  topology: Topology;
  /** The points that draw; read only for a point layer among `layers`, or when a route item draws. */
  drawnPoints: () => readonly ChartPoint[];
  project: ProjectFn;
  /** The slice's layers, front first, as in the draw stack. */
  layers: readonly StyledLayer[];
  /** The items to draw, of `layers`. */
  drawnItems: readonly ChartItem[];
}

export interface LabelsInput extends ShapesInput {
  labelDensity: LabelDensity;
  atlas: AtlasInfo;
}

/** What an area label reads: where the item's label goes, if it has a place. */
export interface PlaceInput {
  placeOf: (item: ChartItem) => AreaPlace | undefined;
}

/** What a label that must fit reads: the settled scale (px per NM) and what was shown before. */
export interface FitInput {
  /** Read only by labels that test their room, so only they follow a settled zoom. */
  settledScale: () => number;
  shown: ShownMemory;
}

/** The drawn points of a layer, each at its place on the plane. */
const pointsIn = (
  layer: StyledLayer,
  drawnPoints: ShapesInput['drawnPoints'],
  project: ProjectFn,
) =>
  drawnPoints()
    .filter((p) => p.layer === layer)
    .map(({ id, at: [lon, lat] }) => ({ id, at: project(lat, lon) }));

/** The chart's lines and point markers, each back to front through the stack. */
export function buildShapes({
  topology,
  drawnPoints,
  project,
  layers,
  drawnItems,
}: ShapesInput): ShapeBatches {
  const lines = new LineBatch();
  const markers = new MarkerBatch();
  const drawn = partsOf(drawnItems);
  drawRuns(topology.areas, drawn, NO_CUTS, project, lines);
  drawRuns(topology.routes, drawn, routeCuts(drawnItems, drawnPoints), project, lines);
  for (const layer of layers.toReversed()) {
    const style = LAYER_STYLES[layer];
    if (!isPointStyle(style)) continue;
    for (const { at } of pointsIn(layer, drawnPoints, project)) {
      markers.marker(at, style.shape, style.size, style.color);
    }
  }
  return { lines: lines.finish(), markers: markers.finish() };
}

/** The idents of the drawn points, each back to front through the stack. */
export function buildPointLabels({
  drawnPoints,
  project,
  layers,
  labelDensity,
  atlas,
}: LabelsInput): Batch[] {
  const labels = new TextBatch(atlas);
  for (const layer of layers.toReversed()) {
    const style = LAYER_STYLES[layer];
    if (!isPointStyle(style) || !labelReaches(style.label, labelDensity)) continue;
    const { px, py, size, color, baseline } = style.label;
    for (const { id, at } of pointsIn(layer, drawnPoints, project)) {
      labels.text(id, { ...at, px, py }, size, color, { baseline, halo: true });
    }
  }
  return [labels.finish()];
}

/** The labels of a slice, each kind as it is placed: routes by span, areas at their pole, points by their marker. */
export function buildSliceLabels(
  slice: (typeof CHART_SLICES)[number],
  input: LabelsInput & FitInput & PlaceInput,
): Batch[] {
  if (slice.labels === 'routeLabels') return buildRouteLabels(input);
  return slice.labels === 'areaLabels' ? buildAreaLabels(input) : buildPointLabels(input);
}
