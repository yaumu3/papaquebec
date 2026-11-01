import type { ChartItem, ItemPart } from '../../lib/chart';
import { LAYER_TABLE, type LineLayerStyle } from '../../lib/layers';
import type { RouteSpan, SpansOf } from '../../lib/routeSpans';
import { isUpperStratum } from '../../lib/stratum';
import { type Network, ownersOf, runsOf, type Stretch } from '../../lib/topology';
import type { LineBatch, LineStyle, SpanPlace } from './pack';

/** A line's form in the layer's style, refined by the part's kind and stratum. */
function lineLook(style: LineLayerStyle, part: ItemPart): LineStyle {
  const { kind } = part.properties;
  const byKind = kind === undefined ? undefined : style.kinds?.get(kind);
  const upper = isUpperStratum(part) ? style.upper : undefined;
  return { ...style, ...byKind, ...upper };
}

/** A run's points, from the edges the span has walked: the dash runs on across its vertices. */
const runPoints = (span: RouteSpan, { from, to }: Stretch) =>
  span.edges
    .slice(from - span.from, to - span.from)
    .flatMap((edge, i) => (i === 0 ? edge : edge.slice(1)));

/** Where a run sits in a span cut back at a stop; none in a span that is not. */
function placeIn(span: RouteSpan, { from }: Stretch): SpanPlace | undefined {
  const { cutBack, cutAhead, length } = span;
  if (cutBack === 0 && cutAhead === 0) return undefined;
  return { back: span.reach[from - span.from] ?? 0, length, cutBack, cutAhead };
}

/**
 * Draws the drawn parts of a network back to front, each edge once: a part draws its runs, each
 * as one polyline in its layer's style, cut back in the line shader at the stops of its spans.
 */
export function drawRuns(
  network: Network,
  drawn: ReadonlySet<ItemPart>,
  spansOf: SpansOf,
  lines: LineBatch,
): void {
  const owners = ownersOf(network, drawn);
  for (const path of network.paths.toReversed()) {
    if (!drawn.has(path.part)) continue;
    const style = LAYER_TABLE[path.layer].style;
    const look = lineLook(style, path.part);
    for (const span of spansOf(path)) {
      for (const run of runsOf(path, owners, span)) {
        lines.polyline(runPoints(span, run), style.color, look, placeIn(span, run));
      }
    }
  }
}

/** The parts of the items to draw. */
export const partsOf = (items: readonly ChartItem[]): Set<ItemPart> =>
  new Set(items.flatMap((item) => item.parts));
