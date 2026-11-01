import type { Figure } from '../../lib/figure';
import type { Vec2 } from '../../lib/geo';
import { Shape } from '../protocol';
import type { LineBatch, MarkerBatch } from './pack';

/** The batches a figure draws into. */
interface FigureOut {
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
