import { RAD } from '../../../lib/units';
import { fixed, offset, toward } from '../../svg';
import { instrumentHeight } from '../height';

/** The compass arc spans this far either side of the top. */
const SPAN_DEG = 55;
/** The labels of the compass run this far either side of the top. */
const LABEL_SPAN_DEG = 50;
const TICK_STEP_DEG = 5;
const MINOR_TICK_PX = 5;
const MAJOR_TICK_PX = 9;
const BIG_LABEL_INSET_PX = 22;
const SMALL_LABEL_INSET_PX = 19;
const LUBBER_OUT_PX = 13;
const LUBBER_IN_PX = 3;
/** How far a range label stands left of the arc end it names. */
const RANGE_LABEL_GAP_PX = 4;
/** How far above the half-range ring LAST HEARD is centred. */
const LAST_HEARD_RISE_PX = 8;
const AIRCRAFT_HALF_WIDTH_PX = 6;
const AIRCRAFT_NOSE_PX = 10;
const AIRCRAFT_TAIL_PX = 8;
const TRACK_FROM_PX = 14;
const TRACK_SHORT_PX = 12;
/** Half the length of the tick that crosses the track line at the ring. */
const CROSS_PX = 4;
const DIAMOND_HALF_HEIGHT_PX = 6;
const DIAMOND_HALF_WIDTH_PX = 4;

/** Where the display stands in its box: the centre of the compass and the radii of its arc and ring. */
export interface NdGeometry {
  w: number;
  h: number;
  cx: number;
  cy: number;
  r: number;
  r2: number;
}

/** The whole geometry of a display `w` wide: two thirds as high, the arc as large as that and the width let it be. */
export function ndGeometry(w: number): NdGeometry {
  const h = instrumentHeight(w);
  const r = Math.min(h - 60, w / 2 - 24);
  return { w, h, cx: w / 2, cy: Math.min(h - 20, 40 + r), r, r2: r / 2 };
}

/** A number to a tenth of a pixel, as the drawing is. */
const tenth = (n: number): number => Number(fixed(n));

/** The radius in pixels that `nm` nautical miles reach at a range of `rangeNm`. */
export const pxOf = (g: NdGeometry, nm: number, rangeNm: number): number => (nm * g.r) / rangeNm;

/** The point `a` degrees clockwise of the top at radius `r`. */
export const ndPoint = (g: NdGeometry, a: number, r: number): [number, number] =>
  offset(g.cx, g.cy, a)(r);

/** An arc across the compass's span at radius `r`. */
export function arcPath(g: NdGeometry, r: number): string {
  const at = (a: number) => toward(g.cx, g.cy, a)(r);
  return `M${at(-SPAN_DEG)}A${fixed(r)} ${fixed(r)} 0 0 1 ${at(SPAN_DEG)}`;
}

/** The ring at half the range. */
export const ringPath = (g: NdGeometry): string => arcPath(g, g.r2);

/** A label of the compass, centred at (x, y). */
export interface CompassLabel {
  text: string;
  x: number;
  y: number;
  /** The multiples of 30°, set larger. */
  big: boolean;
}

export interface Compass {
  /** The ticks of every 5°, one path, and of every 10°, another. */
  minor: string;
  major: string;
  labels: CompassLabel[];
}

const norm = (deg: number): number => ((deg % 360) + 360) % 360;

/** The ticks and labels of the arc, with `orient` degrees magnetic at the top. */
export function compass(g: NdGeometry, orient: number): Compass {
  const out: Compass = { minor: '', major: '', labels: [] };
  const first = Math.ceil((orient - SPAN_DEG) / TICK_STEP_DEG) * TICK_STEP_DEG;
  for (let b = first; b <= orient + SPAN_DEG; b += TICK_STEP_DEG) {
    const a = b - orient;
    const major = norm(b) % 10 === 0;
    const at = toward(g.cx, g.cy, a);
    const segment = `M${at(g.r)}L${at(g.r - (major ? MAJOR_TICK_PX : MINOR_TICK_PX))}`;
    if (!major) {
      out.minor += segment;
      continue;
    }
    out.major += segment;
    if (Math.abs(a) > LABEL_SPAN_DEG) continue;
    const tens = norm(b) / 10;
    const big = tens % 3 === 0;
    const [x, y] = ndPoint(g, a, g.r - (big ? BIG_LABEL_INSET_PX : SMALL_LABEL_INSET_PX));
    out.labels.push({ text: String(tens), x: tenth(x), y: tenth(y), big });
  }
  return out;
}

/** The fixed line at the top of the arc. */
export function lubberPath(g: NdGeometry): string {
  return `M${fixed(g.cx)} ${fixed(g.cy - g.r - LUBBER_OUT_PX)}L${fixed(g.cx)} ${fixed(g.cy - g.r + LUBBER_IN_PX)}`;
}

/** The open triangle at the centre, apex up. */
export function aircraftPath(g: NdGeometry): string {
  const { cx, cy } = g;
  const nose = `${fixed(cx)} ${fixed(cy - AIRCRAFT_NOSE_PX)}`;
  const right = `${fixed(cx + AIRCRAFT_HALF_WIDTH_PX)} ${fixed(cy + AIRCRAFT_TAIL_PX)}`;
  const left = `${fixed(cx - AIRCRAFT_HALF_WIDTH_PX)} ${fixed(cy + AIRCRAFT_TAIL_PX)}`;
  return `M${nose}L${right}L${left}Z`;
}

/** Where the right edges of the outer range's label and of half of it stand: left of the arc and ring ends. */
export function rangeAnchors(g: NdGeometry): {
  outer: { x: number; y: number };
  half: { x: number; y: number };
} {
  const at = (r: number) => {
    const [x, y] = ndPoint(g, -SPAN_DEG, r);
    return { x: tenth(x - RANGE_LABEL_GAP_PX), y: tenth(y) };
  };
  return { outer: at(g.r), half: at(g.r2) };
}

/** The line LAST HEARD is centred on, just above the half-range ring. */
export const lastHeardY = (g: NdGeometry): number => g.cy - g.r2 - LAST_HEARD_RISE_PX;

/** Whether a bearing, relative to the top, falls on the compass's arc. */
export const onArc = (rel: number): boolean => Math.abs(rel) <= SPAN_DEG;

/** The track line, from near the aircraft to short of the arc, crossed at the half-range ring; empty off the arc. */
export function trackPath(g: NdGeometry, at: number): string {
  if (!onArc(at)) return '';
  const p = toward(g.cx, g.cy, at);
  return `M${p(TRACK_FROM_PX)}L${p(g.r - TRACK_SHORT_PX)}M${p(g.r2, -CROSS_PX)}L${p(g.r2, CROSS_PX)}`;
}

/** The diamond on the arc at the track, open; empty off the arc. */
export function diamondPath(g: NdGeometry, at: number): string {
  if (!onArc(at)) return '';
  const p = toward(g.cx, g.cy, at);
  return `M${p(g.r + DIAMOND_HALF_HEIGHT_PX)}L${p(g.r, DIAMOND_HALF_WIDTH_PX)}L${p(g.r - DIAMOND_HALF_HEIGHT_PX)}L${p(g.r, -DIAMOND_HALF_WIDTH_PX)}Z`;
}

/** The bug outline as (outward from the arc's radius, across): a notch in the foot, towards the arc. */
const BUG_OUTLINE: readonly (readonly [number, number])[] = [
  [9, -7],
  [9, 7],
  [1, 7],
  [1, 3],
  [5, 0],
  [1, -3],
  [1, -7],
];

/**
 * The half of the outline inside the arc's span, for a bug at its right end. The radial line
 * through the bug (across 0) is the line the arc ends at, so the cut falls there: the half left
 * of it is inside. The notch's half still points at the arc.
 */
const BUG_INBOARD_HALF: readonly (readonly [number, number])[] = [
  [9, 0],
  [9, -7],
  [1, -7],
  [1, -3],
  [5, 0],
];

/** The path through `outline` about the bug's own bearing `a`, its across offsets turned to `side`. */
function bugOutline(
  g: NdGeometry,
  a: number,
  outline: readonly (readonly [number, number])[],
  side = 1,
): string {
  const p = toward(g.cx, g.cy, a);
  return outline
    .map(([out, across], i) => `${i ? 'L' : 'M'}${p(g.r + out, across * side)}`)
    .join('');
}

/**
 * The selected-heading bug at `rel` degrees off the top. A bearing off the arc parks the bug at
 * the nearer end, half of it, as an instrument shows it: the part inside the span, cut at the end,
 * which draws as an open path so that no stroke runs along the cut.
 */
export function bugPath(g: NdGeometry, rel: number): string {
  if (onArc(rel)) return `${bugOutline(g, rel, BUG_OUTLINE)}Z`;
  const side = Math.sign(rel);
  return bugOutline(g, side * SPAN_DEG, BUG_INBOARD_HALF, side);
}

/** How the track turns and how fast the aircraft goes: what the trend vector extends. */
export interface Trend {
  rateDegS: number;
  gsKt: number;
}

const TREND_SEC = 90;
const TREND_FROM_PX = 9;
/** The seconds of the trend, from and to, that each of its three dashes covers. */
const TREND_DASHES: readonly (readonly [number, number])[] = [
  [1, 28],
  [32, 58],
  [62, 88],
];

/** Where the aircraft will be each second of the next 90, turning at the rate, on the scale of the range. */
export function trendPoints(
  g: NdGeometry,
  at: number,
  trend: Trend,
  rangeNm: number,
): [number, number][] {
  const pxPerSec = pxOf(g, trend.gsKt / 3600, rangeNm);
  let x = g.cx;
  let y = g.cy - TREND_FROM_PX;
  const points: [number, number][] = [];
  for (let t = 0; t <= TREND_SEC; t++) {
    points.push([x, y]);
    const rad = (at + trend.rateDegS * (t + 0.5)) * RAD;
    x += pxPerSec * Math.sin(rad);
    y -= pxPerSec * Math.cos(rad);
  }
  return points;
}

/** The trend as three dashes, one for each 30 s. */
export function trendPath(points: readonly (readonly [number, number])[]): string {
  return TREND_DASHES.map(([from, to]) =>
    points
      .slice(from, to + 1)
      .map(([x, y], i) => `${i ? 'L' : 'M'}${fixed(x)} ${fixed(y)}`)
      .join(''),
  ).join('');
}

/** The level-off arc is drawn only this far from the aircraft symbol, and short of the compass arc. */
const LEVEL_OFF_MIN_PX = 14;
/** How far either side of the track the level-off arc reaches. */
const LEVEL_OFF_HALF_SPAN_DEG = 11;

/** The arc across the track at the distance a climb or descent will level off at; empty when it falls outside the compass. */
export function levelOffPath(g: NdGeometry, at: number, nm: number, rangeNm: number): string {
  const rpx = pxOf(g, nm, rangeNm);
  if (rpx <= LEVEL_OFF_MIN_PX || rpx >= g.r) return '';
  const from = toward(g.cx, g.cy, at - LEVEL_OFF_HALF_SPAN_DEG)(rpx);
  const to = toward(g.cx, g.cy, at + LEVEL_OFF_HALF_SPAN_DEG)(rpx);
  return `M${from}A${fixed(rpx)} ${fixed(rpx)} 0 0 1 ${to}`;
}

/** Where the wind arrow stands, from the top left of the display; it does not scale with it. */
const WIND_ARROW_CENTRE: readonly [number, number] = [16, 60];
const WIND_ARROW_HALF_LENGTH_PX = 10;
const WIND_HEAD_BACK_PX = 5;
const WIND_HEAD_HALF_WIDTH_PX = 3.5;

/** The arrow of the wind, for a wind from `relFromDeg` off the top of the display: it points downwind. */
export function windArrowPath(relFromDeg: number): string {
  const [x, y] = WIND_ARROW_CENTRE;
  const at = toward(x, y, relFromDeg + 180);
  const tip = at(WIND_ARROW_HALF_LENGTH_PX);
  const back = WIND_ARROW_HALF_LENGTH_PX - WIND_HEAD_BACK_PX;
  return (
    `M${at(-WIND_ARROW_HALF_LENGTH_PX)}L${tip}` +
    `M${at(back, WIND_HEAD_HALF_WIDTH_PX)}L${tip}L${at(back, -WIND_HEAD_HALF_WIDTH_PX)}`
  );
}
