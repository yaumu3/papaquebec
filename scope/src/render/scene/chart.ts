import { type ChartItem, type ItemPart, outlinesOf } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import type { StyledLayer } from '../../lib/layers';
import type { Topology } from '../../lib/topology';
import { LABEL_DENSITIES, type LabelDensity } from '../../state/settingsDefaults';
import type { AtlasInfo } from '../protocol';
import type { SliceBatches } from '../slots';
import { isPointStyle, LAYER_STYLES, type LayerStyle } from './layerStyles';
import { type Anchor, LineBatch, MarkerBatch, TextBatch } from './pack';
import { route } from './paths';
import { drawRuns } from './runs';

export interface ChartInput {
  topology: Topology;
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

/** The outlines of a geometry on the scope plane: a polygon's exterior ring and its holes. */
const pathsOf = (geometry: ItemPart['geometry'], project: ProjectFn): Anchor[][] =>
  outlinesOf(geometry).map((outline) => route(outline, project));

const nameOf = ({ properties: p }: ItemPart): string | undefined =>
  'id' in p ? p.id : 'name' in p ? p.name : undefined;

/** Names an item once, from the first path of its first part, if the density reaches its layer. */
function labelItem(
  item: ChartItem,
  style: LayerStyle,
  project: ProjectFn,
  density: LabelDensity,
  out: ChartBatches,
) {
  const { label } = style;
  const [first] = item.parts;
  const name = first && nameOf(first);
  if (!label || !first || name === undefined) return;
  if (LABEL_DENSITIES.indexOf(density) < LABEL_DENSITIES.indexOf(label.from)) return;
  const path = route(outlinesOf(first.geometry)[0] ?? [], project);
  const at = label.at === 'middle' ? path[Math.floor(path.length / 2)] : path[0];
  if (!at) return;
  const { px, py, size, color, baseline } = label;
  out.labels.text(name, { ...at, px, py }, size, color, { baseline });
}

/** A marker at each anchor of a point item's parts, in the layer's style. */
function markItem(item: ChartItem, style: LayerStyle, project: ProjectFn, markers: MarkerBatch) {
  if (!isPointStyle(style)) return;
  for (const part of item.parts) {
    for (const at of pathsOf(part.geometry, project).flat()) {
      markers.marker(at, style.shape, style.size, style.color);
    }
  }
}

/** The parts of the items on the layers, which are the parts to draw. */
function partsOn(topology: Topology, layers: readonly StyledLayer[]): Set<ItemPart> {
  const shown = new Set<string>(layers);
  return new Set(topology.chart.filter((i) => shown.has(i.layer)).flatMap((i) => i.parts));
}

/** The chart's lines, point markers and labels, each back to front through the stack. */
export function buildChart({
  topology,
  project,
  layers,
  labelDensity,
  atlas,
}: ChartInput): SliceBatches {
  const out = { lines: new LineBatch(), markers: new MarkerBatch(), labels: new TextBatch(atlas) };
  const drawn = partsOn(topology, layers);
  drawRuns(topology.areas, drawn, project, out.lines);
  drawRuns(topology.routes, drawn, project, out.lines);
  for (const layer of layers.toReversed()) {
    const style = LAYER_STYLES[layer];
    for (const item of topology.chart.filter((i) => i.layer === layer)) {
      markItem(item, style, project, out.markers);
      labelItem(item, style, project, labelDensity, out);
    }
  }
  return { lines: out.lines.finish(), markers: out.markers.finish(), labels: out.labels.finish() };
}
