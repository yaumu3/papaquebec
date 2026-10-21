import { clamp } from '../../../lib/math';
import { RAD } from '../../../lib/units';
import { fixed, type Point, polygonPath, tenth, type TextLabel, toward } from '../../svg';
import type { PfdGeometry } from './geometry';

const PITCH_PX_PER_DEG = 3.6;
const LADDER_STEP_DEG = 2.5;
const LADDER_SPAN_DEG = 20;
const LADDER_TOP_MARGIN_PX = 16;
const LADDER_BOTTOM_MARGIN_PX = 4;
const LADDER_LABEL_GAP_PX = 9;

/** The half-length of a rung of the ladder: longer at each 5° and each 10°. */
const rungHalfLength = (deg: number): number => (deg % 10 === 0 ? 28 : deg % 5 === 0 ? 14 : 7);

export interface Attitude {
  /** The two parts of the window the horizon divides, as closed paths. */
  sky: string;
  ground: string;
  horizon: string;
  ladder: string;
  labels: TextLabel[];
  /** The roll pointer, a triangle on the bank scale. */
  pointer: string;
}

/** The parts of a polygon on one side of a line, with the points where the line cuts it. */
function clipSide(
  polygon: readonly Point[],
  distance: (p: Point) => number,
  keepSky: boolean,
): { path: string; cuts: Point[] } {
  const inside = (d: number) => (keepSky ? d >= 0 : d < 0);
  const points: Point[] = [];
  const cuts: Point[] = [];
  polygon.forEach((a, i) => {
    const b = polygon[(i + 1) % polygon.length];
    if (!b) return;
    const da = distance(a);
    const db = distance(b);
    if (inside(da)) points.push(a);
    if (inside(da) === inside(db)) return;
    const k = da / (da - db);
    const cut: Point = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    points.push(cut);
    if (keepSky) cuts.push(cut);
  });
  return { path: points.length ? polygonPath(points) : '', cuts };
}

/** The directions along the horizon and up from it, in window coordinates, at `rollDeg` of roll. */
function rolledFrame(rollDeg: number): { along: Point; up: Point } {
  const r = rollDeg * RAD;
  return { along: [Math.cos(r), -Math.sin(r)], up: [-Math.sin(r), -Math.cos(r)] };
}

/**
 * The attitude window at `rollDeg` of roll. Pitch is not broadcast, so the horizon always passes
 * through the window's centre, perpendicular to the rolled up-vector.
 */
export function attitude(g: PfdGeometry, rollDeg: number): Attitude {
  const { along, up } = rolledFrame(rollDeg);
  const corners: Point[] = [
    [g.wx, g.wy],
    [g.wxr, g.wy],
    [g.wxr, g.wyb],
    [g.wx, g.wyb],
  ];
  const height = ([x, y]: Point) => (x - g.acx) * up[0] + (y - g.yc) * up[1];
  const sky = clipSide(corners, height, true);
  const ground = clipSide(corners, height, false);
  const [from, to] = sky.cuts;
  let ladder = '';
  const labels: TextLabel[] = [];
  for (let deg = -LADDER_SPAN_DEG; deg <= LADDER_SPAN_DEG; deg += LADDER_STEP_DEG) {
    const off = deg * PITCH_PX_PER_DEG;
    if (deg === 0 || off > g.rr - LADDER_TOP_MARGIN_PX) continue;
    if (-off > g.wyb - g.yc - LADDER_BOTTOM_MARGIN_PX) continue;
    const half = rungHalfLength(deg);
    const cx = g.acx + off * up[0];
    const cy = g.yc + off * up[1];
    ladder += `M${fixed(cx - half * along[0])} ${fixed(cy - half * along[1])}L${fixed(cx + half * along[0])} ${fixed(cy + half * along[1])}`;
    if (deg % 10 !== 0) continue;
    for (const side of [-1, 1]) {
      const reach = side * (half + LADDER_LABEL_GAP_PX);
      labels.push({
        text: String(Math.abs(deg)),
        x: tenth(cx + reach * along[0]),
        y: tenth(cy + reach * along[1]),
      });
    }
  }
  return {
    sky: sky.path,
    ground: ground.path,
    horizon:
      from && to ? `M${fixed(from[0])} ${fixed(from[1])}L${fixed(to[0])} ${fixed(to[1])}` : '',
    ladder,
    labels,
    pointer: pointerPath(g, -rollDeg),
  };
}

/** The point at `radius` from the scale's centre, `deg` clockwise of the top. */
const onScale = (g: PfdGeometry, deg: number, radius: number): string =>
  toward(g.acx, g.yc, deg)(radius);

const POINTER_TIP_INSET_PX = 2;
const POINTER_BASE_INSET_PX = 12;
const POINTER_HALF_WIDTH_DEG = 5;

const pointerPath = (g: PfdGeometry, deg: number): string =>
  `M${onScale(g, deg, g.rr - POINTER_TIP_INSET_PX)}` +
  `L${onScale(g, deg - POINTER_HALF_WIDTH_DEG, g.rr - POINTER_BASE_INSET_PX)}` +
  `L${onScale(g, deg + POINTER_HALF_WIDTH_DEG, g.rr - POINTER_BASE_INSET_PX)}Z`;

const BANK_MARKS_DEG: readonly number[] = [-60, -45, -30, -20, -10, 10, 20, 30, 45, 60];
const BANK_LONG_TICK_PX = 11;
const BANK_SHORT_TICK_PX = 6;

/** The ticks of the bank scale, longer at 30° and 60°. */
export const bankScalePath = (g: PfdGeometry): string =>
  BANK_MARKS_DEG.map((deg) => {
    const long = Math.abs(deg) % 30 === 0;
    return `M${onScale(g, deg, g.rr)}L${onScale(g, deg, g.rr + (long ? BANK_LONG_TICK_PX : BANK_SHORT_TICK_PX))}`;
  }).join('');

const INDEX_HALF_WIDTH_PX = 6;
const INDEX_HEIGHT_PX = 9;

/** The fixed index at the top of the bank scale, a filled triangle. */
export const bankIndexPath = (g: PfdGeometry): string =>
  `M${fixed(g.acx)} ${fixed(g.yc - g.rr)}l${-INDEX_HALF_WIDTH_PX} ${-INDEX_HEIGHT_PX}h${2 * INDEX_HALF_WIDTH_PX}Z`;

const WINDOW_RADIUS_PX = 12;

/** The attitude window as the attributes of an SVG rectangle. */
export const windowRect = (g: PfdGeometry) => ({
  x: g.wx,
  y: g.wy,
  width: g.wxr - g.wx,
  height: g.wyb - g.wy,
  rx: WINDOW_RADIUS_PX,
});

/** The flight path vector's angles: its climb, and the drift of the track off the heading. */
export interface Fpv {
  fpaDeg: number;
  driftDeg: number;
}

const FPV_LEFT_PX = 18;
const FPV_UP_PX = 12;
const FPV_DOWN_PX = 5;

/**
 * Where the flight path vector stands, in the rolled frame at the ladder's scale, kept whole
 * inside the window.
 */
export function fpvAt(g: PfdGeometry, rollDeg: number, fpv: Fpv): [number, number] {
  const { along, up } = rolledFrame(rollDeg);
  const climb = fpv.fpaDeg * PITCH_PX_PER_DEG;
  const drift = fpv.driftDeg * PITCH_PX_PER_DEG;
  const x = g.acx + climb * up[0] + drift * along[0];
  const y = g.yc + climb * up[1] + drift * along[1];
  return [
    clamp(x, g.wx + FPV_LEFT_PX, g.wxr - FPV_LEFT_PX),
    clamp(y, g.wy + FPV_UP_PX, g.wyb - FPV_DOWN_PX),
  ];
}

const FPV_RADIUS_PX = 5;
const FPV_WING_PX = 13;
const FPV_FIN_PX = 7;

/** The circle with two wings and a fin, upright, at (x, y). */
export function fpvPath([x, y]: readonly [number, number]): string {
  const left = `${fixed(x - FPV_RADIUS_PX)} ${fixed(y)}`;
  const right = `${fixed(x + FPV_RADIUS_PX)} ${fixed(y)}`;
  const arc = `A${fixed(FPV_RADIUS_PX)} ${fixed(FPV_RADIUS_PX)} 0 1 0`;
  return (
    `M${left}${arc} ${right}${arc} ${left}` +
    `M${left}h${-FPV_WING_PX}M${right}h${FPV_WING_PX}` +
    `M${fixed(x)} ${fixed(y - FPV_RADIUS_PX)}v${-FPV_FIN_PX}`
  );
}
