/**
 * Drawings that keep their size on the screen: outlines and discs in CSS px about an anchor, x to
 * the right and y down. The scope draws one as line segments and markers, the tree row as SVG.
 */

import type { Vec2 } from './geo';

/** A polyline, closed back to its first point or open, `width` CSS px wide. */
export interface Stroke {
  points: readonly Vec2[];
  closed: boolean;
  width: number;
}

/** A filled circle. */
export interface Disc {
  at: Vec2;
  radius: number;
}

/** A drawing: its strokes, then its discs. */
export interface Figure {
  strokes: readonly Stroke[];
  discs: readonly Disc[];
}

/** `steps` + 1 points on the circle of `radius` about `centre` from one angle to the other, in degrees from +x towards +y. */
export function arcPoints(
  centre: Vec2,
  radius: number,
  fromDeg: number,
  toDeg: number,
  steps: number,
): Vec2[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const angle = ((fromDeg + ((toDeg - fromDeg) * i) / steps) * Math.PI) / 180;
    return { x: centre.x + radius * Math.cos(angle), y: centre.y + radius * Math.sin(angle) };
  });
}

/** The corners of a regular polygon of `sides` sides, the first on +x, in order towards +y. */
export function polygonPoints(centre: Vec2, radius: number, sides: number): Vec2[] {
  return arcPoints(centre, radius, 0, 360, sides).slice(0, sides);
}
