/** The small drawing of how a layer looks on the scope, in the tree, as a figure. */

import { arcPoints, type Figure, polygonPoints, type Stroke } from './figure';
import type { Vec2 } from './geo';
import {
  DEFAULT_LINE_WIDTH,
  isHoldStyle,
  isPointStyle,
  LAYER_TABLE,
  type LineLayerStyle,
  type PointLayerStyle,
} from './layers';
import type { ScopeLayer } from './mapsetFormat';

export const SWATCH_WIDTH = 24;
export const SWATCH_HEIGHT = 10;

const CENTRE: Vec2 = { x: SWATCH_WIDTH / 2, y: SWATCH_HEIGHT / 2 };
const MARKER_STROKE = 1.2;
const RING_RADIUS = 3.5;
/** Enough sides that the polygon passes for a circle at this size. */
const RING_SIDES = 64;
const TRIANGLE_SIZE = 8;
const HOLD_RADIUS = 2.5;
const HOLD_REACH = 6;
const HALF_CIRCLE_STEPS = 16;
const RING_ARC_RADIUS = 12;
const RING_ARC_REACH = 10;
const RING_ARC_FOOT = 9;

const outline = (points: readonly Vec2[], width = MARKER_STROKE): Stroke => ({
  points,
  closed: true,
  width,
});

const ring = (): Stroke => outline(polygonPoints(CENTRE, RING_RADIUS, RING_SIDES));

/** Scaled from the fix's triangle: a smaller marker gets a smaller one. */
function triangle(size: number): Stroke {
  const scale = size / TRIANGLE_SIZE;
  const { x, y } = CENTRE;
  return outline([
    { x, y: y - 4 * scale },
    { x: x + 3.5 * scale, y: y + 2.5 * scale },
    { x: x - 3.5 * scale, y: y + 2.5 * scale },
  ]);
}

/** Point up, unlike the VOR's symbol, which lies flat. */
const hexagon = (): Stroke => {
  const { x, y } = CENTRE;
  return outline([
    { x, y: y - 4 },
    { x: x + 3.5, y: y - 2 },
    { x: x + 3.5, y: y + 2 },
    { x, y: y + 4 },
    { x: x - 3.5, y: y + 2 },
    { x: x - 3.5, y: y - 2 },
  ]);
};

/** A racetrack lying along the swatch, its legs a line wide. */
const racetrack = (): Stroke => {
  const { x, y } = CENTRE;
  const end = (centreX: number, from: number) =>
    arcPoints({ x: centreX, y }, HOLD_RADIUS, from, from + 180, HALF_CIRCLE_STEPS);
  return outline([...end(x - HOLD_REACH, 90), ...end(x + HOLD_REACH, 270)], DEFAULT_LINE_WIDTH);
};

/** A stretch of a range ring, its ends at the swatch's foot. */
function ringArc(): Stroke {
  const rise = Math.sqrt(RING_ARC_RADIUS ** 2 - RING_ARC_REACH ** 2);
  const centre = { x: CENTRE.x, y: RING_ARC_FOOT + rise };
  const degrees = (Math.atan2(rise, RING_ARC_REACH) * 180) / Math.PI;
  return {
    points: arcPoints(centre, RING_ARC_RADIUS, degrees - 180, -degrees, RING_SIDES),
    closed: false,
    width: DEFAULT_LINE_WIDTH,
  };
}

const MARKERS: Record<PointLayerStyle['marker'], (size: number) => Stroke> = {
  ring,
  triangle,
  navaid: hexagon,
};

const lineAcross = ({ width = DEFAULT_LINE_WIDTH, dash }: LineLayerStyle): Stroke => ({
  points: [
    { x: 0, y: CENTRE.y },
    { x: SWATCH_WIDTH, y: CENTRE.y },
  ],
  closed: false,
  width,
  ...(dash && { dash }),
});

const figureOf = (stroke: Stroke): Figure => ({ strokes: [stroke], discs: [] });

/** A layer's swatch and its colour, from the style the scope draws the layer with. */
export function swatchOf(layer: ScopeLayer): { figure: Figure; color: string } {
  const { style } = LAYER_TABLE[layer];
  if (isHoldStyle(style)) return { figure: figureOf(racetrack()), color: style.rnavColor };
  if (isPointStyle(style)) {
    return { figure: figureOf(MARKERS[style.marker](style.size)), color: style.color };
  }
  const stroke = layer === 'rings' ? ringArc() : lineAcross(style);
  return { figure: figureOf(stroke), color: style.color };
}
