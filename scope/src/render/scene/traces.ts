import { type ChartItem, outlinesOf } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import { type Batch, Shape } from '../protocol';
import { LineBatch, MarkerBatch } from './pack';
import { THEME } from './rules';

interface TracesInput {
  /** The item the tree points at, whether it draws or not. */
  pointedAt: ChartItem | null;
  /** The items the search names on their own rows. */
  searched: readonly ChartItem[];
  project: ProjectFn;
}

const TRACE_WIDTH_PX = 2;
const POINTED_RING_PX = 9;
const SEARCH_RING_PX = 8;

/**
 * An item's full geometry: every outline of every part, not cut back at stops, and a point as a
 * ring. A hold has no trace until its racetrack comes with the symbols.
 */
function traceItem(
  item: ChartItem,
  color: string,
  ringPx: number,
  project: ProjectFn,
  lines: LineBatch,
  markers: MarkerBatch,
): void {
  if (item.layer === 'hold') return;
  for (const { geometry } of item.parts) {
    if (geometry.type === 'Point') {
      const [lon, lat] = geometry.coordinates;
      markers.marker(project(lat, lon), Shape.TraceRing, ringPx * 2, color);
      continue;
    }
    for (const outline of outlinesOf(geometry)) {
      lines.polyline(geodesicLine(outline, project), color, { width: TRACE_WIDTH_PX });
    }
  }
}

/** One trace of `items`: their lines, then their markers. */
function trace(
  items: readonly ChartItem[],
  color: string,
  ringPx: number,
  project: ProjectFn,
): [Batch, Batch] {
  const lines = new LineBatch(1);
  const markers = new MarkerBatch(1);
  for (const item of items) traceItem(item, color, ringPx, project, lines, markers);
  return [lines.finish(), markers.finish()];
}

/**
 * What the search names at half strength, then what the tree points at over it at full
 * strength, drawn over the chart's labels and under the targets.
 */
export function buildTraces({
  pointedAt,
  searched,
  project,
}: TracesInput): [Batch, Batch, Batch, Batch] {
  return [
    ...trace(searched, THEME.hoverFaint, SEARCH_RING_PX, project),
    ...trace(pointedAt ? [pointedAt] : [], THEME.hover, POINTED_RING_PX, project),
  ];
}
