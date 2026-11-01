import { type ChartItem, type ItemPart, nameOf, outlinesOf } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import type { StyledLayer } from '../../lib/layers';
import { NO_CUTS } from '../../lib/stops';
import type { ChartPoint, Topology } from '../../lib/topology';
import type { LabelDensity } from '../../state/settingsDefaults';
import type { AtlasInfo, Batch } from '../protocol';
import type { ShapeBatches } from '../slots';
import {
  isPointStyle,
  LAYER_STYLES,
  type LabelStyle,
  labelReaches,
  type LineLayerStyle,
} from './layerStyles';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { drawRuns, routeCuts } from './runs';

export interface ShapesInput {
  topology: Topology;
  /** The points that draw; read only for a point layer among `layers`, or when a route item draws. */
  drawnPoints: () => readonly ChartPoint[];
  project: ProjectFn;
  /** The slice's layers, front first, as in the draw stack. */
  layers: readonly StyledLayer[];
  /** The items to draw, of `layers`. */
  drawnItems: readonly ChartItem[];
}

export interface LabelsInput extends Omit<ShapesInput, 'topology'> {
  labelDensity: LabelDensity;
  atlas: AtlasInfo;
}

function putLabel(name: string, at: Anchor, label: LabelStyle, labels: TextBatch) {
  const { px, py, size, color, baseline } = label;
  labels.text(name, { ...at, px, py }, size, color, { baseline, halo: true });
}

/** Names a line item once, from the first outline of its first part, if the density reaches it. */
function labelItem(
  item: ChartItem,
  style: LineLayerStyle,
  project: ProjectFn,
  density: LabelDensity,
  labels: TextBatch,
) {
  const { label } = style;
  const [first] = item.parts;
  const name = first && nameOf(first);
  if (!label || !first || name === undefined || !labelReaches(label, density)) return;
  const path = geodesicLine(outlinesOf(first.geometry)[0] ?? [], project);
  const at = label.at === 'middle' ? path[Math.floor(path.length / 2)] : path[0];
  if (at) putLabel(name, at, label, labels);
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

/** The parts of the items to draw. */
const partsOf = (items: readonly ChartItem[]): Set<ItemPart> =>
  new Set(items.flatMap((item) => item.parts));

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

/** The chart's labels, each back to front through the stack. */
export function buildLabels({
  drawnPoints,
  project,
  layers,
  drawnItems,
  labelDensity,
  atlas,
}: LabelsInput): Batch[] {
  const labels = new TextBatch(atlas);
  for (const layer of layers.toReversed()) {
    const style = LAYER_STYLES[layer];
    if (isPointStyle(style)) {
      if (!labelReaches(style.label, labelDensity)) continue;
      for (const { id, at } of pointsIn(layer, drawnPoints, project)) {
        putLabel(id, at, style.label, labels);
      }
    } else {
      for (const item of drawnItems.filter((i) => i.layer === layer)) {
        labelItem(item, style, project, labelDensity, labels);
      }
    }
  }
  return [labels.finish()];
}
