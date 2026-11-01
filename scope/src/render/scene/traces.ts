import { type ChartItem, outlinesOf } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import { geodesicLine } from '../../lib/geodesic';
import { isPointLayer } from '../../lib/mapsetFormat';
import type { Batch } from '../protocol';
import { type FigureOut, putPointMark } from './figures';
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

/** What a trace draws into: the lines of routes and areas, and the strokes and markers of symbols. */
interface TraceOut {
  lines: LineBatch;
  symbols: FigureOut;
}

/**
 * An item's full geometry: every outline of every part, not cut back at stops, and a point as
 * its layer's own symbol, a navaid's in the kind of each part. A hold has no trace until its
 * racetrack comes with the symbols.
 */
function traceItem(item: ChartItem, color: string, project: ProjectFn, out: TraceOut): void {
  if (item.layer === 'hold') return;
  for (const { geometry, properties } of item.parts) {
    if (geometry.type === 'Point') {
      const [lon, lat] = geometry.coordinates;
      const style = LAYER_STYLES[item.layer];
      const { kind } = properties;
      if (isPointStyle(style)) putPointMark(out.symbols, project(lat, lon), style, kind, color);
      continue;
    }
    for (const outline of outlinesOf(geometry)) {
      out.lines.polyline(geodesicLine(outline, project), color, { width: TRACE_WIDTH_PX });
    }
  }
}

/** One trace of `items`: the lines of routes and areas, then the strokes and the markers of points. */
function trace(
  items: readonly ChartItem[],
  color: string,
  project: ProjectFn,
): [Batch, Batch, Batch] {
  const out = {
    lines: new LineBatch(1),
    symbols: { lines: new LineBatch(1), markers: new MarkerBatch(1) },
  };
  for (const item of items) traceItem(item, color, project, out);
  return [out.lines.finish(), out.symbols.lines.finish(), out.symbols.markers.finish()];
}

/** The batches of the two slots of the traces. */
interface TraceSlots {
  traces: [Batch, Batch, ...Batch[]];
  tracedPoints: [Batch, Batch, Batch, Batch, ...Batch[]];
}

/**
 * What the search names at half strength, then what the tree points at over it at full strength,
 * and over that the highlight of its label, in two slots. The traces hold the lines and the
 * highlight of a route or an area, under the chart's points; the traced points hold the symbols
 * and the highlight of a point, over the chart's own. The search gets no label.
 */
export function buildTraces({ pointedAt, searched, highlight, project }: TracesInput): TraceSlots {
  const [searchLines, searchStrokes, searchMarkers] = trace(searched, THEME.hoverFaint, project);
  const [pointedLines, pointedStrokes, pointedMarkers] = trace(
    pointedAt ? [pointedAt] : [],
    THEME.hover,
    project,
  );
  const lit = pointedAt && isPointLayer(pointedAt.layer);
  return {
    traces: [searchLines, pointedLines, ...(lit ? [] : highlight)],
    tracedPoints: [
      searchStrokes,
      searchMarkers,
      pointedStrokes,
      pointedMarkers,
      ...(lit ? highlight : []),
    ],
  };
}
