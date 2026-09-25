/**
 * The app icon: what the scope draws, not an aircraft. A single ADS-B target (a filled
 * square, upper left) trails three slash marks (lower right) along the path it has flown,
 * midway through a left turn. The rules of the scope's own symbology carry over: one ink
 * colour, the level-flight green on the scope background; slashes keep a fixed 45° tilt
 * whatever the heading; marks sit at equal path length (constant groundspeed); uniform
 * brightness, no fade or glow; and the trail never touches the target.
 *
 * Geometry, in a 64 × 64 space with φ = (1 + √5) / 2:
 * - The path is a golden spiral, radius shrinking by φ per quarter turn, so the turn
 *   tightens as it goes.
 * - The turn is 72° (a pentagon's central angle), placed evenly inside the quarter from
 *   heading 360 to 270 with 9° to spare at each end: the oldest mark is on heading 351
 *   and the target on 279.
 * - Mark spacing is (64/φ)(1 − 1/φ)K/(2 + φ) ≈ 14.26, where K is the path length per unit
 *   of radius; the gap from the newest mark to the target is √φ spacings.
 * - Ink proportions are 1 : φ² : φ³ for stroke : slash box : target, with a 14-unit target.
 * - The ink's bounding box, stroke included, is centred in the tile.
 *
 * The 16 px artwork keeps the path and the centring rule but thickens the ink and widens
 * the gap so three separate marks survive at about four units per pixel.
 */
import { PALETTE } from '../src/design/palette';

/** The 64 × 64 space the artwork is drawn in. */
export const TILE = 64;

const PHI = (1 + Math.sqrt(5)) / 2;
/** Spiral growth: the radius shrinks by φ per quarter turn. */
const B = Math.log(PHI) / (Math.PI / 2);
/** Path length per unit of radius along the spiral. */
const K = Math.sqrt(1 + B * B) / B;
const TURN = (72 * Math.PI) / 180;
/** Heading to spare at each end of the turn inside the quarter from 360 to 270. */
const LEAD_IN = (9 * Math.PI) / 180;
/** Path length between marks. */
const SPACING = ((TILE / PHI) * (1 - 1 / PHI) * K) / (2 + PHI);

/** Ink sizes of one artwork, in tile units. */
export interface IconArt {
  /** Side of the target square. */
  readonly target: number;
  /** Extent of a slash in x and in y. */
  readonly slash: number;
  /** Stroke width of a slash. */
  readonly stroke: number;
  /** Path length from the newest mark to the target, as a multiple of the mark spacing. */
  readonly gap: number;
}

/** The artwork for 32 px and up. */
export const ICON_MASTER: IconArt = {
  target: 14,
  slash: 14 / PHI,
  stroke: 14 / PHI ** 3,
  gap: Math.sqrt(PHI),
};

/** The separate 16 px artwork. */
export const ICON_16: IconArt = { target: 15, slash: 7.2, stroke: 4.8, gap: 1.45 };

/** A point on the path with the direction of travel, clockwise from screen-up, in degrees. */
export interface PathPoint {
  readonly x: number;
  readonly y: number;
  readonly heading: number;
}

export interface Box {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface IconGeometry {
  /** Oldest first. */
  readonly marks: readonly PathPoint[];
  readonly target: PathPoint;
  /** Bounding box of the ink, including stroke width. */
  readonly inkBox: Box;
}

/** Places the marks and the target for one artwork, ink centred in the tile. */
export function iconGeometry(art: IconArt): IconGeometry {
  const total = (2 + art.gap) * SPACING;
  const r0 = total / ((1 - Math.exp(-B * TURN)) * K);
  const t0 = -Math.atan(B) + LEAD_IN;
  const at = (s: number): PathPoint => {
    const r = r0 - s / K;
    const t = t0 + Math.log(r0 / r) / B;
    const dx = -Math.cos(t) / K - Math.sin(t) / (B * K);
    const dy = Math.sin(t) / K - Math.cos(t) / (B * K);
    const heading = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
    return { x: r * Math.cos(t), y: -r * Math.sin(t), heading };
  };
  const marks = [0, SPACING, 2 * SPACING].map(at);
  const target = at(total);
  const box = inkBox(art, marks, target);
  const shiftX = TILE / 2 - (box.minX + box.maxX) / 2;
  const shiftY = TILE / 2 - (box.minY + box.maxY) / 2;
  const shift = (p: PathPoint): PathPoint => ({ ...p, x: p.x + shiftX, y: p.y + shiftY });
  return {
    marks: marks.map(shift),
    target: shift(target),
    inkBox: {
      minX: box.minX + shiftX,
      minY: box.minY + shiftY,
      maxX: box.maxX + shiftX,
      maxY: box.maxY + shiftY,
    },
  };
}

/** Half-extent of a slash in x and in y, with the butt caps of its stroke. */
function slashReach(art: IconArt): number {
  return art.slash / 2 + art.stroke / 2 / Math.SQRT2;
}

function inkBox(art: IconArt, marks: readonly PathPoint[], target: PathPoint): Box {
  const reach = slashReach(art);
  const half = art.target / 2;
  const xs = [
    ...marks.flatMap((m) => [m.x - reach, m.x + reach]),
    target.x - half,
    target.x + half,
  ];
  const ys = [
    ...marks.flatMap((m) => [m.y - reach, m.y + reach]),
    target.y - half,
    target.y + half,
  ];
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

const num = (v: number) => String(Number(v.toFixed(2)));

/** Renders one artwork as SVG; `radius` is the tile's corner radius, 0 for the square tile. */
export function iconSvg(art: IconArt, radius: number): string {
  const { marks, target } = iconGeometry(art);
  const half = art.slash / 2;
  const slashes = marks.map(
    (m) =>
      `<line x1="${num(m.x - half)}" y1="${num(m.y + half)}" x2="${num(m.x + half)}" y2="${num(m.y - half)}" ` +
      `stroke="${PALETTE.level}" stroke-width="${num(art.stroke)}" stroke-linecap="butt"/>`,
  );
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE} ${TILE}">` +
    `<rect width="${TILE}" height="${TILE}" rx="${num(radius)}" fill="${PALETTE.bg}"/>` +
    `<rect x="${num(target.x - art.target / 2)}" y="${num(target.y - art.target / 2)}" ` +
    `width="${num(art.target)}" height="${num(art.target)}" fill="${PALETTE.level}"/>` +
    slashes.join('') +
    '</svg>'
  );
}
