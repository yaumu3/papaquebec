import {
  type Chart,
  type ChartItem,
  isUpperStratum,
  type ItemPart,
  outlinesOf,
} from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import type { StyledLayer } from '../../lib/layers';
import { LABEL_DENSITIES, type LabelDensity } from '../../state/settingsDefaults';
import type { AtlasInfo } from '../protocol';
import type { SliceBatches } from '../slots';
import { isPointStyle, LAYER_STYLES, type LayerStyle, type LineLayerStyle } from './layerStyles';
import { type Anchor, LineBatch, type LineStyle, MarkerBatch, TextBatch } from './pack';
import { route } from './paths';

const NAVAID_MAX_RANGE = 120;

/** Navaids clutter a wide range; they show only out to `NAVAID_MAX_RANGE`. */
export function navaidsShownAt(rangeNm: number): boolean {
  return rangeNm <= NAVAID_MAX_RANGE;
}

/**
 * The layers to build: those shown, and the navaids only when the range allows. The range is
 * read only for a shown navaid layer, so a rebuild follows it only then.
 */
export function visibleLayers(
  layers: readonly StyledLayer[],
  shown: (layer: StyledLayer) => boolean,
  navaidsInRange: () => boolean,
): StyledLayer[] {
  return layers.filter((l) => shown(l) && (l !== 'navaid' || navaidsInRange()));
}

export interface ChartInput {
  chart: Chart;
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
function pathsOf(geometry: ItemPart['geometry'], project: ProjectFn): Anchor[][] {
  return outlinesOf(geometry).map((outline) => route(outline, project));
}

/** A line's form in the layer's style, refined by the part's kind and stratum. */
function lineLook(style: LineLayerStyle, part: ItemPart): LineStyle {
  const { kind } = part.properties;
  const byKind = kind === undefined ? undefined : style.kinds?.get(kind);
  const upper = isUpperStratum(part) ? style.upper : undefined;
  return { ...style, ...byKind, ...upper };
}

/**
 * Draws a part in its layer's style: a marker at each anchor of a point, else its outlines.
 * Returns the outlines, for the item's label.
 */
function drawPart(part: ItemPart, style: LayerStyle, project: ProjectFn, out: ChartBatches) {
  const paths = pathsOf(part.geometry, project);
  if (isPointStyle(style)) {
    for (const at of paths.flat()) out.markers.marker(at, style.shape, style.size, style.color);
  } else {
    for (const path of paths) out.lines.polyline(path, style.color, lineLook(style, part));
  }
  return paths;
}

const nameOf = ({ properties: p }: ItemPart): string | undefined =>
  'id' in p ? p.id : 'name' in p ? p.name : undefined;

/** Names an item once, from the first path of its first part, if the density reaches its layer. */
function labelItem(
  item: ChartItem,
  style: LayerStyle,
  path: Anchor[],
  density: LabelDensity,
  out: ChartBatches,
) {
  const { label } = style;
  const name = item.parts[0] && nameOf(item.parts[0]);
  if (!label || name === undefined) return;
  if (LABEL_DENSITIES.indexOf(density) < LABEL_DENSITIES.indexOf(label.from)) return;
  const at = label.at === 'middle' ? path[Math.floor(path.length / 2)] : path[0];
  if (!at) return;
  const { px, py, size, color, baseline } = label;
  out.labels.text(name, { ...at, px, py }, size, color, { baseline });
}

/** The chart's lines, point markers and labels, each back to front through the stack. */
export function buildChart({
  chart,
  project,
  layers,
  labelDensity,
  atlas,
}: ChartInput): SliceBatches {
  const out = { lines: new LineBatch(), markers: new MarkerBatch(), labels: new TextBatch(atlas) };
  for (const layer of layers.toReversed()) {
    const style = LAYER_STYLES[layer];
    for (const item of chart.filter((i) => i.layer === layer)) {
      const [first] = item.parts.map((part) => drawPart(part, style, project, out));
      labelItem(item, style, first?.[0] ?? [], labelDensity, out);
    }
  }
  return { lines: out.lines.finish(), markers: out.markers.finish(), labels: out.labels.finish() };
}
