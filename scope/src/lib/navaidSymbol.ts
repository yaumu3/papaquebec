import { type Disc, type Figure, polygonPoints, type Stroke } from './figure';
import type { Vec2 } from './geo';

const ORIGIN: Vec2 = { x: 0, y: 0 };
const OUTLINE_WIDTH = 1.1;
const CENTRE_DOT_RADIUS = 0.9;
const STIPPLE_DOT_RADIUS = 0.6;
const CIRCLE_STEPS = 24;
const SIN_60 = Math.sin(Math.PI / 3);

const outline = (points: Vec2[]): Stroke => ({
  points,
  closed: true,
  width: OUTLINE_WIDTH,
});

const circle = (radius: number): Stroke => outline(polygonPoints(ORIGIN, radius, CIRCLE_STEPS));

const hexagon = (radius: number): Stroke => outline(polygonPoints(ORIGIN, radius, 6));

const disc = (at: Vec2, radius: number): Disc => ({ at, radius });

const centreDot = disc(ORIGIN, CENTRE_DOT_RADIUS);

/** The rectangle of DME and VOR/DME: half-height and half-width off the hexagon of radius `0.82 r`. */
function rectangle(r: number): Stroke {
  const hexRadius = 0.82 * r;
  const w = hexRadius * 1.22;
  const h = hexRadius * SIN_60;
  return outline([
    { x: -w, y: -h },
    { x: w, y: -h },
    { x: w, y: h },
    { x: -w, y: h },
  ]);
}

/**
 * The hexagon of TACAN and VORTAC with a lobe out of its upper left, upper right and bottom
 * sides: as long as the side and 0.55 of the vertex radius deep along its normal. The side under
 * a lobe is not drawn. Also each lobe's midline, as wide as the lobe is deep, to fill it.
 */
function lobedHexagon(radius: number): { outline: Stroke; fills: Stroke[] } {
  const corners = polygonPoints(ORIGIN, radius, 6);
  const depth = 0.55 * radius;
  const points: Vec2[] = [];
  const fills: Stroke[] = [];
  corners.forEach((a, k) => {
    const b = corners[(k + 1) % 6];
    points.push(a);
    if (k % 2 === 0 || !b) return;
    const angle = ((k + 0.5) * Math.PI) / 3;
    const out = { x: Math.cos(angle) * depth, y: Math.sin(angle) * depth };
    const lobe = [
      { x: a.x + out.x, y: a.y + out.y },
      { x: b.x + out.x, y: b.y + out.y },
    ];
    points.push(...lobe);
    fills.push({
      points: lobe.map((p) => ({ x: p.x - out.x / 2, y: p.y - out.y / 2 })),
      closed: false,
      width: depth,
    });
  });
  return { outline: outline(points), fills };
}

/** Dots evenly spaced on a circle. */
const stipple = (radius: number, count: number): Disc[] =>
  polygonPoints(ORIGIN, radius, count).map((at) => disc(at, STIPPLE_DOT_RADIUS));

const figureOf = (strokes: Stroke[], discs: Disc[] = []): Figure => ({
  strokes,
  discs: [...discs, centreDot],
});

/**
 * A navaid's symbol by kind, after the ICAO chart symbols (Annex 4), for a marker of `size` CSS
 * px: VOR a hexagon, DME a rectangle, VOR/DME the hexagon in the rectangle, TACAN a hexagon whose
 * alternate sides carry lobes, VORTAC the same with the lobes filled, NDB a stippled disc with a
 * small ring at its centre. Any other kind, or none, is a circle. Kinds are matched exactly as
 * the map set format spells them.
 */
export function navaidSymbol(kind: string | undefined, size: number): Figure {
  const r = size / 2;
  switch (kind) {
    case 'VOR':
      return figureOf([hexagon(0.85 * r)]);
    case 'DME':
      return figureOf([rectangle(r)]);
    case 'VOR/DME':
      return figureOf([rectangle(r), hexagon(0.82 * r)]);
    case 'TACAN':
      return figureOf([lobedHexagon(0.6 * r).outline]);
    case 'VORTAC': {
      const { outline: lobed, fills } = lobedHexagon(0.6 * r);
      return figureOf([lobed, ...fills]);
    }
    case 'NDB':
      return figureOf([circle(0.3 * r)], [...stipple(r, 14), ...stipple(0.68 * r, 9)]);
    default:
      return figureOf([circle(0.75 * r)]);
  }
}
