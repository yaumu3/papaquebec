import { type ChartItem, type ItemPart, outlinesOf } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import type { StyledLayer } from '../../lib/layers';
import { NO_CUTS } from '../../lib/stops';
import type { ChartPoint, Topology } from '../../lib/topology';
import { LABEL_DENSITIES, type LabelDensity } from '../../state/settingsDefaults';
import type { AtlasInfo } from '../protocol';
import type { SliceBatches } from '../slots';
import {
  isPointStyle,
  LAYER_STYLES,
  type LabelStyle,
  type LineLayerStyle,
  type PointLayerStyle,
} from './layerStyles';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { route } from './paths';
import { drawRuns, routeCuts } from './runs';

export interface ChartInput {
  topology: Topology;
  /** The points that draw; read only when a point or a route layer is among `layers`. */
  drawnPoints: () => readonly ChartPoint[];
  project: ProjectFn;
  /** The layers to draw, front first, as in the draw stack. */
  layers: readonly StyledLayer[];
  labelDensity: LabelDensity;
  atlas: AtlasInfo;
}

interface ChartBatches {
  lines: LineBatch;
  markers: MarkerBatch;
  labels: TextBatch;
}

const nameOf = ({ properties: p }: ItemPart): string | undefined =>
  'name' in p ? p.name : undefined;

const reaches = (label: LabelStyle, density: LabelDensity) =>
  LABEL_DENSITIES.indexOf(density) >= LABEL_DENSITIES.indexOf(label.from);

function putLabel(name: string, at: Anchor, label: LabelStyle, labels: TextBatch) {
  const { px, py, size, color, baseline } = label;
  labels.text(name, { ...at, px, py }, size, color, { baseline });
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
  if (!label || !first || name === undefined || !reaches(label, density)) return;
  const path = route(outlinesOf(first.geometry)[0] ?? [], project);
  const at = label.at === 'middle' ? path[Math.floor(path.length / 2)] : path[0];
  if (at) putLabel(name, at, label, labels);
}

/** A point's marker and, if the density reaches its layer, its ident. */
function drawPoint(
  { id, at: [lon, lat] }: ChartPoint,
  style: PointLayerStyle,
  project: ProjectFn,
  density: LabelDensity,
  out: ChartBatches,
) {
  const anchor = project(lat, lon);
  out.markers.marker(anchor, style.shape, style.size, style.color);
  if (reaches(style.label, density)) putLabel(id, anchor, style.label, out.labels);
}

/** The parts of the items on the layers, which are the parts to draw. */
function partsOn(topology: Topology, layers: readonly StyledLayer[]): Set<ItemPart> {
  const shown = new Set<string>(layers);
  return new Set(topology.chart.filter((i) => shown.has(i.layer)).flatMap((i) => i.parts));
}

/** The chart's lines, point markers and labels, each back to front through the stack. */
export function buildChart({
  topology,
  drawnPoints,
  project,
  layers,
  labelDensity,
  atlas,
}: ChartInput): SliceBatches {
  const out = { lines: new LineBatch(), markers: new MarkerBatch(), labels: new TextBatch(atlas) };
  const drawn = partsOn(topology, layers);
  drawRuns(topology.areas, drawn, NO_CUTS, project, out.lines);
  drawRuns(topology.routes, drawn, routeCuts(layers, drawnPoints), project, out.lines);
  for (const layer of layers.toReversed()) {
    const style = LAYER_STYLES[layer];
    if (isPointStyle(style)) {
      for (const point of drawnPoints().filter((p) => p.layer === layer)) {
        drawPoint(point, style, project, labelDensity, out);
      }
    } else {
      for (const item of topology.chart.filter((i) => i.layer === layer)) {
        labelItem(item, style, project, labelDensity, out.labels);
      }
    }
  }
  return { lines: out.lines.finish(), markers: out.markers.finish(), labels: out.labels.finish() };
}
