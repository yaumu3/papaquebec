import { isUpperStratum, type ItemPart } from '../../lib/chart';
import type { ProjectFn } from '../../lib/geo';
import { type Network, ownersOf, runsOf } from '../../lib/topology';
import { LAYER_STYLES, type LineLayerStyle } from './layerStyles';
import type { LineBatch, LineStyle } from './pack';
import { route } from './paths';

/** A line's form in the layer's style, refined by the part's kind and stratum. */
function lineLook(style: LineLayerStyle, part: ItemPart): LineStyle {
  const { kind } = part.properties;
  const byKind = kind === undefined ? undefined : style.kinds?.get(kind);
  const upper = isUpperStratum(part) ? style.upper : undefined;
  return { ...style, ...byKind, ...upper };
}

/**
 * Draws the drawn parts of a network back to front, each edge once: a part draws its runs,
 * each as one polyline in its layer's style.
 */
export function drawRuns(
  network: Network,
  drawn: ReadonlySet<ItemPart>,
  project: ProjectFn,
  lines: LineBatch,
): void {
  const owners = ownersOf(network, drawn);
  for (const path of network.paths.toReversed()) {
    const style = LAYER_STYLES[path.layer];
    const look = lineLook(style, path.part);
    for (const { from, to } of runsOf(path, owners)) {
      lines.polyline(route(path.coordinates.slice(from, to + 1), project), style.color, look);
    }
  }
}
