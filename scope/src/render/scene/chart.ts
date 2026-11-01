import type { ChartItem, ItemPart } from '../../lib/chart';
import type { ShownMemory } from '../../lib/fits';
import type { ProjectFn } from '../../lib/geo';
import {
  DRAW_STACK,
  isPointStyle,
  type LabelDensity,
  labelReaches,
  LAYER_TABLE,
  type PointLayerStyle,
} from '../../lib/layers';
import { isChartLayer, type Layer } from '../../lib/mapsetFormat';
import type { AreaPlace } from '../../lib/pole';
import { pathSpans, type SpansOf } from '../../lib/routeSpans';
import { NO_CUTS } from '../../lib/stops';
import type { ChartPoint, Topology } from '../../lib/topology';
import type { Declination } from '../../lib/wmm';
import type { AtlasInfo, Batch } from '../protocol';
import type { SlotName, Slots } from '../slots';
import { buildAreaLabels } from './areaLabels';
import { putPart, putPointMark } from './figures';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { drawRuns, partsOf } from './runs';
import { buildRouteLabels, type SpanLabel } from './spanDesignators';

interface ShapesInput {
  topology: Topology;
  /** The points that draw; read only for a point layer among `layers`. */
  drawnPoints: () => readonly ChartPoint[];
  project: ProjectFn;
  /** The spans of the routes; reading a drawn route's follows the points that stop it. */
  routeSpans: SpansOf;
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

/** A build's batches, back to front, and what the highlight finds its labels by. */
export interface BuiltLabels {
  batches: Batch[];
  /** Where the chart drew each area item's name. */
  areaNames?: ReadonlyMap<string, Anchor>;
  /** The span labels a route build drew, by span identity. */
  spanLabels?: ReadonlyMap<string, SpanLabel>;
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

/** Puts a point's ident beside its marker, in its layer's label style or in `color`. */
export function putPointLabel(
  text: TextBatch,
  { id, at }: ReturnType<typeof placedPoint>,
  { px, py, size, color, baseline }: PointLayerStyle['label'],
  override = color,
) {
  text.text(id, { ...at, px, py }, size, override, { baseline, halo: true });
}

/** The idents of the drawn points, each back to front through the stack. */
function buildPointLabels({
  drawnPoints,
  project,
  layers,
  labelDensity,
  atlas,
}: LabelsInput): BuiltLabels {
  const text = new TextBatch(atlas);
  for (const layer of layers.toReversed()) {
    const { style } = LAYER_TABLE[layer];
    if (!isPointStyle(style) || !labelReaches(style.label, labelDensity)) continue;
    for (const point of pointsIn(layer, drawnPoints, project)) {
      putPointLabel(text, point, style.label);
    }
  }
  return { batches: [text.finish()] };
}

/** The layers from `first` to `last` of the draw stack, front first. */
const stackSlice = (first: Layer, last: Layer) =>
  DRAW_STACK.slice(LAYER_TABLE[first].rank, LAYER_TABLE[last].rank + 1).filter(isChartLayer);

/** What each slice's labels are built from. */
type SliceLabelsInput = LabelsInput & FitInput & PlaceInput;

interface Slice {
  layers: readonly Layer[];
  /** The slot of its lines and markers. */
  shapes: SlotName;
  /** The slot of its labels, each kind placed its own way. */
  labels: SlotName;
  buildLabels: (input: SliceLabelsInput) => BuiltLabels;
}

/**
 * The chart is built in three slices of the draw stack, so a toggle rebuilds only the slices that
 * read its layer. Each fills a slot for its lines and markers and one for its labels.
 */
export const CHART_SLICES: readonly Slice[] = [
  {
    layers: stackSlice('ctr', 'asr'),
    shapes: 'areaLines',
    labels: 'areaLabels',
    buildLabels: buildAreaLabels,
  },
  {
    layers: stackSlice('sid', 'hold'),
    shapes: 'routeLines',
    labels: 'routeLabels',
    buildLabels: buildRouteLabels,
  },
  {
    layers: stackSlice('ad', 'vfr'),
    shapes: 'pointMarkers',
    labels: 'pointLabels',
    buildLabels: buildPointLabels,
  },
];

/** The slice that draws a layer. */
export function sliceOf(layer: Layer): Slice {
  const slice = CHART_SLICES.find(({ layers }) => layers.includes(layer));
  if (!slice) throw new Error(`no slice draws ${layer}`);
  return slice;
}

/** The colour of a hold: its kind's. */
function holdColor({ properties }: ItemPart): string {
  const { color, rnavColor } = LAYER_TABLE.hold.style;
  return properties.kind === 'RNAV' ? rnavColor : color;
}

/** The chart's lines and point markers of a slice, each back to front through the stack. */
export function buildShapes(
  { shapes }: Slice,
  { topology, drawnPoints, project, routeSpans, layers, drawnItems }: ShapesInput,
  declinationAt: () => Declination,
): Slots {
  const lines = new LineBatch();
  const markers = new MarkerBatch();
  const symbols = { lines, markers };
  const drawn = partsOf(drawnItems);
  drawRuns(topology.areas, drawn, pathSpans(NO_CUTS, project), lines);
  for (const { layer, parts } of drawnItems.filter((item) => item.layer === 'hold')) {
    for (const part of parts) {
      putPart(layer, part, holdColor(part), { project, declinationAt }, { lines, symbols });
    }
  }
  drawRuns(topology.routes, drawn, routeSpans, lines);
  for (const layer of layers.toReversed()) {
    const { style } = LAYER_TABLE[layer];
    if (!isPointStyle(style)) continue;
    for (const { at, kind } of pointsIn(layer, drawnPoints, project)) {
      putPointMark(symbols, at, style, kind, style.color);
    }
  }
  return { [shapes]: [lines.finish(), markers.finish()] };
}
