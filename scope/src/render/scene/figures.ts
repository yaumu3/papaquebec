import type { Figure } from '../../lib/figure';
import type { Vec2 } from '../../lib/geo';
import { navaidSymbol } from '../../lib/navaidSymbol';
import { Shape } from '../protocol';
import type { PointLayerStyle } from './layerStyles';
import type { LineBatch, MarkerBatch } from './pack';

/** The batches a figure draws into. */
export interface FigureOut {
  lines: LineBatch;
  markers: MarkerBatch;
}

/**
 * A figure at a point of the plane, at its own size on the screen: each stroke as segments
 * between anchors that share the point and differ in their px offsets, each disc as a marker.
 */
export function putFigure(
  { lines, markers }: FigureOut,
  at: Vec2,
  { strokes, discs }: Figure,
  color: string,
): void {
  for (const { points, closed, width } of strokes) {
    const anchors = (closed ? [...points, points[0]] : points).flatMap((p) =>
      p ? [{ ...at, px: p.x, py: p.y }] : [],
    );
    lines.polyline(anchors, color, { width });
  }
  for (const { at: offset, radius } of discs) {
    markers.marker({ ...at, px: offset.x, py: offset.y }, Shape.Disc, 2 * radius, color);
  }
}

/** A point's mark: its layer's marker, or the navaid symbol of `kind`. */
export function putPointMark(
  out: FigureOut,
  at: Vec2,
  { shape, size }: Pick<PointLayerStyle, 'shape' | 'size'>,
  kind: string | undefined,
  color: string,
): void {
  if (shape === 'symbol') putFigure(out, at, navaidSymbol(kind, size), color);
  else out.markers.marker(at, shape, size, color);
}
