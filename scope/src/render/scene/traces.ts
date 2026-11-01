import { type ChartItem, outlinesOf } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import { isPointLayer } from '../../lib/mapsetFormat';
import type { Batch } from '../protocol';
import { isPointStyle, LAYER_STYLES } from './layerStyles';
import { LineBatch, MarkerBatch } from './pack';
import { THEME } from './rules';

interface TracesInput {
  /** The item the tree points at, whether it draws or not. */
  pointedAt: ChartItem | null;
  /** The items the search names on their own rows. */
  searched: readonly ChartItem[];
  /** The pointed item's label lit, ready to draw over its trace. */
  highlight: readonly Batch[];
  project: ProjectFn;
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

/** The batches of the two slots of the traces. */
interface TraceSlots {
  traces: [Batch, Batch, ...Batch[]];
  tracedPoints: [Batch, Batch, ...Batch[]];
}

/**
 * What the search names at half strength, then what the tree points at over it at full strength,
 * and over that the highlight of its label, in two slots. The traces hold the lines and the
 * highlight of a route or an area, under the chart's points; the traced points hold the symbols
 * and the highlight of a point, over the chart's own. The search gets no label.
 */
export function buildTraces({ pointedAt, searched, highlight, project }: TracesInput): TraceSlots {
  const [searchLines, searchMarkers] = trace(searched, THEME.hoverFaint, project);
  const [pointedLines, pointedMarkers] = trace(pointedAt ? [pointedAt] : [], THEME.hover, project);
  const lit = pointedAt && isPointLayer(pointedAt.layer);
  return {
    traces: [searchLines, pointedLines, ...(lit ? [] : highlight)],
    tracedPoints: [searchMarkers, pointedMarkers, ...(lit ? highlight : [])],
  };
}
