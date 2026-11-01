import { type ChartItem, outlinesOf } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import type { AtlasInfo, Batch } from '../protocol';
import { type DrawnLabel, redrawLabel } from './drawnLabels';
import { isPointStyle, LAYER_STYLES } from './layerStyles';
import { LineBatch, MarkerBatch, TextBatch } from './pack';
import { THEME } from './rules';

interface TracesInput {
  /** The item the tree points at, whether it draws or not. */
  pointedAt: ChartItem | null;
  /** The items the search names on their own rows. */
  searched: readonly ChartItem[];
  /** What the label of the pointed item drew on the chart, if it drew. */
  pointedLabel: DrawnLabel | undefined;
  project: ProjectFn;
  atlas: AtlasInfo;
}

const TRACE_WIDTH_PX = 2;

/**
 * An item's full geometry: every outline of every part, not cut back at stops, and a point as
 * its layer's own symbol. A hold has no trace until its racetrack comes with the symbols.
 */
function traceItem(
  item: ChartItem,
  color: string,
  project: ProjectFn,
  lines: LineBatch,
  markers: MarkerBatch,
): void {
  if (item.layer === 'hold') return;
  for (const { geometry } of item.parts) {
    if (geometry.type === 'Point') {
      const [lon, lat] = geometry.coordinates;
      const style = LAYER_STYLES[item.layer];
      if (isPointStyle(style)) markers.marker(project(lat, lon), style.shape, style.size, color);
      continue;
    }
    for (const outline of outlinesOf(geometry)) {
      lines.polyline(geodesicLine(outline, project), color, { width: TRACE_WIDTH_PX });
    }
  }
}

/** One trace of `items`: their lines, then their markers. */
function trace(items: readonly ChartItem[], color: string, project: ProjectFn): [Batch, Batch] {
  const lines = new LineBatch(1);
  const markers = new MarkerBatch(1);
  for (const item of items) traceItem(item, color, project, lines, markers);
  return [lines.finish(), markers.finish()];
}

/** A label drawn again in the hover grey: its gaps, then its text, then its segments. */
function highlight(label: DrawnLabel | undefined, atlas: AtlasInfo): [Batch, Batch, Batch] {
  const out = { gaps: new LineBatch(1), text: new TextBatch(atlas, 1), strokes: new LineBatch(1) };
  if (label) redrawLabel(label, THEME.hover, out);
  return [out.gaps.finish(), out.text.finish(), out.strokes.finish()];
}

/**
 * What the search names at half strength, then what the tree points at over it at full strength,
 * and over that its label drawn again as the chart drew it: all over the chart's labels and under
 * the targets. The search gets no label.
 */
export function buildTraces({
  pointedAt,
  searched,
  pointedLabel,
  project,
  atlas,
}: TracesInput): [Batch, Batch, Batch, Batch, Batch, Batch, Batch] {
  return [
    ...trace(searched, THEME.hoverFaint, project),
    ...trace(pointedAt ? [pointedAt] : [], THEME.hover, project),
    ...highlight(pointedLabel, atlas),
  ];
}
