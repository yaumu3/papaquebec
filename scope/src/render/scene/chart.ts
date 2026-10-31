import { type Chart, isUpperStratum, type ItemPart } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import type { StyledLayer } from '../../lib/layers';
import type { Batch } from '../protocol';
import { isPointStyle, LAYER_STYLES, type LayerStyle, type LineLayerStyle } from './layerStyles';
import { type Anchor, LineBatch, MarkerBatch, type LineStyle } from './pack';
import { route } from './paths';

export interface ChartInput {
  chart: Chart;
  project: ProjectFn;
  /** The layers to draw, front first, as in the draw stack. */
  layers: readonly StyledLayer[];
}

/** The outlines of a geometry on the scope plane: a polygon's exterior ring and its holes. */
function pathsOf(geometry: ItemPart['geometry'], project: ProjectFn): Anchor[][] {
  switch (geometry.type) {
    case 'Point':
      return [route([geometry.coordinates], project)];
    case 'LineString':
      return [route(geometry.coordinates, project)];
    case 'Polygon':
      return geometry.coordinates.map((ring) => route(ring, project));
  }
}

/** A line's form in the layer's style, refined by the part's kind and stratum. */
function lineLook(style: LineLayerStyle, part: ItemPart): LineStyle {
  const { kind } = part.properties;
  const byKind = kind === undefined ? undefined : style.kinds?.get(kind);
  const upper = isUpperStratum(part) ? style.upper : undefined;
  return { ...style, ...byKind, ...upper };
}

interface Drawn {
  lines: LineBatch;
  markers: MarkerBatch;
}

/** Draws a part in its layer's style: a marker at each anchor of a point, else its outlines. */
function drawPart(part: ItemPart, style: LayerStyle, project: ProjectFn, out: Drawn): void {
  const paths = pathsOf(part.geometry, project);
  if (isPointStyle(style)) {
    for (const at of paths.flat()) out.markers.marker(at, style.shape, style.size, style.color);
  } else {
    for (const path of paths) out.lines.polyline(path, style.color, lineLook(style, part));
  }
}

/** The chart's lines and point markers, back to front through the stack. */
export function buildChart({ chart, project, layers }: ChartInput): {
  lines: Batch;
  markers: Batch;
} {
  const out = { lines: new LineBatch(), markers: new MarkerBatch() };
  for (const layer of layers.toReversed()) {
    const style = LAYER_STYLES[layer];
    for (const item of chart.filter((i) => i.layer === layer)) {
      for (const part of item.parts) drawPart(part, style, project, out);
    }
  }
  return { lines: out.lines.finish(), markers: out.markers.finish() };
}
