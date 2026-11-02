import { CHART_COLORS, PALETTE } from '../../design/palette';
import type { ChartItem } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import { isPointLayer } from '../../lib/mapsetFormat';
import type { Declination } from '../../lib/wmm';
import type { Batch } from '../protocol';
import type { Slots } from '../slots';
import { putPart } from './figures';
import { LineBatch, MarkerBatch } from './pack';

interface TracesInput {
  /** The item the tree points at, whether it draws or not. */
  pointedAt: ChartItem | null;
  /** The items the search names on their own rows. */
  searched: readonly ChartItem[];
  /** The pointed item's label lit, ready to draw over its trace. */
  highlight: readonly Batch[];
  project: ProjectFn;
  declinationAt: () => Declination;
}

const TRACE_WIDTH_PX = 2;

/** The colours of one strength of trace: a point's stands out from the chart's greys. */
type TraceColors = Record<'line' | 'point', string>;

const POINTED = { line: PALETTE.hover, point: CHART_COLORS.pointHover };
const NAMED = { line: CHART_COLORS.hoverFaint, point: CHART_COLORS.pointHoverFaint };

/** What tracing an item reads besides the item. */
type Tracing = Pick<TracesInput, 'project' | 'declinationAt'>;

/** One trace of `items`: the lines of routes and areas, and the strokes and markers of points. */
function trace(items: readonly ChartItem[], colors: TraceColors, tracing: Tracing) {
  const lines = new LineBatch(1);
  const symbols = { lines: new LineBatch(1), markers: new MarkerBatch(1) };
  for (const { layer, parts } of items) {
    const color = isPointLayer(layer) ? colors.point : colors.line;
    for (const part of parts) {
      putPart(layer, part, color, { ...tracing, traceWidth: TRACE_WIDTH_PX }, { lines, symbols });
    }
  }
  return {
    lines: lines.finish(),
    strokes: symbols.lines.finish(),
    markers: symbols.markers.finish(),
  };
}

/**
 * What the search names at half strength, then what the tree points at over it at full strength,
 * and over that the highlight of its label, in two slots. The traces hold the lines and the
 * highlight of a route or an area, under the chart's points; the traced points hold the symbols
 * and the highlight of a point, over the chart's own. The search gets no label.
 */
export function buildTraces({ pointedAt, searched, highlight, ...tracing }: TracesInput): Slots {
  const named = trace(searched, NAMED, tracing);
  const pointed = trace(pointedAt ? [pointedAt] : [], POINTED, tracing);
  const lit = pointedAt && isPointLayer(pointedAt.layer);
  return {
    traces: [named.lines, pointed.lines, ...(lit ? [] : highlight)],
    tracedPoints: [
      named.strokes,
      named.markers,
      pointed.strokes,
      pointed.markers,
      ...(lit ? highlight : []),
    ],
  };
}
