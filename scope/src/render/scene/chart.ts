import type { ChartItem } from '../../lib/chart';
import type { ShownMemory } from '../../lib/fits';
import type { ProjectFn } from '../../lib/geo';
import type { Layer } from '../../lib/mapsetFormat';
import type { AreaPlace } from '../../lib/pole';
import { NO_CUTS } from '../../lib/stops';
import type { ChartPoint, Topology } from '../../lib/topology';
import type { Declination } from '../../lib/wmm';
import type { LabelDensity } from '../../state/settingsDefaults';
import type { AtlasInfo } from '../protocol';
import type { CHART_SLICES, ShapeBatches } from '../slots';
import { buildAreaLabels } from './areaLabels';
import { type BuiltLabels, type LabelOut, putText } from './drawnLabels';
import { putPointMark } from './figures';
import { drawHolds } from './holds';
import { isPointStyle, LAYER_STYLES, labelReaches, type PointLayerStyle } from './layerStyles';
import { LineBatch, MarkerBatch, TextBatch } from './pack';
import { buildRouteLabels } from './routeLabels';
import { drawRuns, partsOf, routeCuts } from './runs';

interface ShapesInput {
  topology: Topology;
  /** The points that draw; read only for a point layer among `layers`, or when a route item draws. */
  drawnPoints: () => readonly ChartPoint[];
  project: ProjectFn;
  /** The slice's layers, front first, as in the draw stack. */
  layers: readonly Layer[];
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

/** A point at its place on the plane. */
export const placedPoint = ({ key, id, kind, at: [lon, lat] }: ChartPoint, project: ProjectFn) => ({
  key,
  id,
  kind,
  at: project(lat, lon),
});

/** The drawn points of a layer, each at its place on the plane. */
const pointsIn = (layer: Layer, drawnPoints: ShapesInput['drawnPoints'], project: ProjectFn) =>
  drawnPoints()
    .filter((p) => p.layer === layer)
    .map((p) => placedPoint(p, project));

/** The chart's lines and point markers, each back to front through the stack. */
export function buildShapes(
  { topology, drawnPoints, project, layers, drawnItems }: ShapesInput,
  declinationAt: () => Declination,
): ShapeBatches {
  const lines = new LineBatch();
  const markers = new MarkerBatch();
  const drawn = partsOf(drawnItems);
  drawRuns(topology.areas, drawn, NO_CUTS, project, lines);
  drawHolds(drawnItems, project, declinationAt, { lines, markers });
  drawRuns(topology.routes, drawn, routeCuts(drawnItems, drawnPoints), project, lines);
  for (const layer of layers.toReversed()) {
    const style = LAYER_STYLES[layer];
    if (!isPointStyle(style)) continue;
    for (const { at, kind } of pointsIn(layer, drawnPoints, project)) {
      putPointMark({ lines, markers }, at, style, kind, style.color);
    }
  }
  return { lines: lines.finish(), markers: markers.finish() };
}

/** Puts a point's ident beside its marker, in its layer's label style. */
export function putPointLabel(
  out: Pick<LabelOut, 'text' | 'drawn'>,
  { key, id, at }: ReturnType<typeof placedPoint>,
  { px, py, size, color, baseline }: PointLayerStyle['label'],
) {
  const style = { baseline, halo: true } as const;
  putText(out, key, { text: id, at: { ...at, px, py }, size, color, style });
}

/** The idents of the drawn points, each back to front through the stack. */
export function buildPointLabels({
  drawnPoints,
  project,
  layers,
  labelDensity,
  atlas,
}: LabelsInput): BuiltLabels {
  const out = { text: new TextBatch(atlas), drawn: new Map() };
  for (const layer of layers.toReversed()) {
    const style = LAYER_STYLES[layer];
    if (!isPointStyle(style) || !labelReaches(style.label, labelDensity)) continue;
    for (const point of pointsIn(layer, drawnPoints, project)) {
      putPointLabel(out, point, style.label);
    }
  }
  return { batches: [out.text.finish()], drawn: out.drawn };
}

/**
 * The labels of a slice, each kind as it is placed: routes by span, areas at their pole, points by
 * their marker. Also what each item's label drew.
 */
export function buildSliceLabels(
  slice: (typeof CHART_SLICES)[number],
  input: LabelsInput & FitInput & PlaceInput,
): BuiltLabels {
  if (slice.labels === 'routeLabels') return buildRouteLabels(input);
  return slice.labels === 'areaLabels' ? buildAreaLabels(input) : buildPointLabels(input);
}
