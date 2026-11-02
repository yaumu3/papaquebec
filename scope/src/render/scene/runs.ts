import type { ChartItem, ItemPart } from '../../lib/chart';
import { LAYER_TABLE, type LineLayerStyle } from '../../lib/layers';
import type { LineSpan, SpansOf } from '../../lib/routeSpans';
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

/** Where a run sits in a span cut back at a stop; none in a span that is not. */
function placeIn(span: LineSpan, { from }: Stretch): SpanPlace | undefined {
  const { cutBack, cutAhead, line } = span;
  if (cutBack === 0 && cutAhead === 0) return undefined;
  const start = line.reach[span.from] ?? 0;
  const [back, end] = [line.reach[from] ?? 0, line.reach[span.to] ?? 0];
  return { back: back - start, length: end - start, cutBack, cutAhead };
}

/**
 * Draws the drawn parts of a network back to front, each edge once: a part draws its runs, each
 * as one polyline in its layer's style, cut back in the line shader at the stops of its spans.
 */
export function drawRuns<S extends LineSpan>(
  network: Network,
  drawn: ReadonlySet<ItemPart>,
  spansOf: SpansOf<S>,
  lines: LineBatch,
): void {
  const owners = ownersOf(network, drawn);
  for (const path of network.paths.toReversed()) {
    if (!drawn.has(path.part)) continue;
    const style = LAYER_TABLE[path.layer].style;
    const look = lineLook(style, path.part);
    for (const span of spansOf(path)) {
      for (const run of runsOf(path, owners, span)) {
        // One stretch of the line: the dash runs on across its vertices.
        const { points, at } = span.line;
        const [from, to] = [at[run.from] ?? 0, at[run.to] ?? 0];
        lines.stretch(points, from, to, style.color, look, placeIn(span, run));
      }
    }
  }
}

/** The parts of the items to draw. */
export const partsOf = (items: readonly ChartItem[]): Set<ItemPart> =>
  new Set(items.flatMap((item) => item.parts));
