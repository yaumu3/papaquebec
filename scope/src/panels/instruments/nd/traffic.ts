import { type GeoPoint, turn } from '../../../lib/geo';
import { inverse } from '../../../lib/geodesic';
import { magneticBearing } from '../../../state/magnetic';
import type { Position, Track } from '../../../state/track';
import { holdsAll } from '../freshness';
import { type NdGeometry, ndPoint, onArc, pxOf } from './geometry';
import { type NdFrame } from './readout';

/** The vertical speed in fpm from which TCAS shows a vertical arrow beside traffic (RTCA DO-185B). */
const ARROW_FPM = 500;

/**
 * The altitude of traffic relative to own ship in hundreds of feet, signed by the rounded value
 * so that level reads `+00`, at least two digits and never clipped. Halves round away from zero.
 */
export function relativeAltitudeLabel(deltaFt: number): string {
  const hundreds = Math.round(Math.abs(deltaFt) / 100);
  const sign = deltaFt < 0 && hundreds > 0 ? '-' : '+';
  return `${sign}${String(hundreds).padStart(2, '0')}`;
}

/** The arrow for traffic climbing or descending at 500 fpm or more by its own held rate. */
export function verticalArrow(t: Track, now: number): '↑' | '↓' | undefined {
  const rate = t.verticalRate;
  if (rate === undefined || Math.abs(rate) < ARROW_FPM || !holdsAll(t, ['verticalRate'], now)) {
    return undefined;
  }
  return rate > 0 ? '↑' : '↓';
}

/** Traffic within this range (NM) and relative altitude (ft) is proximate (RTCA DO-185B). */
const PROXIMATE_NM = 6;
const PROXIMATE_FT = 1200;

/** Whether traffic is proximate or other, the edges included. */
export function trafficKind(distanceNm: number, deltaFt: number): 'other' | 'proximate' {
  return distanceNm <= PROXIMATE_NM && Math.abs(deltaFt) <= PROXIMATE_FT ? 'proximate' : 'other';
}

/** TCAS II's normal display band either side of own ship, in feet of pressure altitude (RTCA DO-185B). */
const TCAS_BAND_FT = 2700;
/** Traffic is drawn no nearer the arc than this, in pixels. */
const EDGE_PX = 4;
/** The slack of the plane's distances over the geodesic's, far over their real difference near the site. */
const PLANE_MARGIN = 1.1;

/** What the ND is showing: its mode and orientation, its range and its geometry. */
export interface NdView {
  frame: Pick<NdFrame, 'mode' | 'orient'>;
  rangeNm: number;
  g: NdGeometry;
}

/** Traffic placed on the display: its centre in pixels, and how far and how high it is from own ship. */
export interface Placed {
  track: Track;
  x: number;
  y: number;
  distanceNm: number;
  deltaFt: number;
}

type LivePosition = Extract<Position, { kind: 'live' }>;

/** Own ship as the traffic is measured from: where it is held, how high, and where its readings place it. */
interface Origin {
  position: LivePosition;
  alt: number;
  at: GeoPoint | undefined;
}

const heldPosition = (t: Track, now: number): LivePosition | undefined =>
  t.position.kind === 'live' && holdsAll(t, ['position'], now) ? t.position : undefined;

const heldAltitude = (t: Track, now: number): number | undefined =>
  typeof t.alt === 'number' && holdsAll(t, ['alt'], now) ? t.alt : undefined;

/** Whether two points of the plane lie within `limitNm` of each other, with the margin: the cheap test before a geodesic. */
export function nearOnPlane(
  a: { x: number; y: number },
  b: { x: number; y: number },
  limitNm: number,
): boolean {
  return Math.hypot(b.x - a.x, b.y - a.y) <= limitNm * PLANE_MARGIN;
}

/** The track's place on the display, or nothing when it lies outside the arc or beyond the range. */
function placeOnDisplay(
  own: Origin,
  t: Track,
  alt: number,
  at: LivePosition,
  view: NdView,
): Placed | undefined {
  const { g, rangeNm, frame } = view;
  const { distanceNm, bearingTrue } = inverse(own.position, at);
  const coincident = distanceNm === 0 || Number.isNaN(bearingTrue);
  const rel = coincident ? 0 : turn(frame.orient, magneticBearing(bearingTrue, own.at));
  const radius = pxOf(g, distanceNm, rangeNm);
  if (!onArc(rel) || radius > g.r - EDGE_PX) return undefined;
  const [x, y] = ndPoint(g, rel, radius);
  return { track: t, x, y, distanceNm, deltaFt: alt - own.alt };
}

/**
 * The traffic around own ship that the display draws: other tracks with a held position and
 * altitude within the band, inside the arc and the range. Nothing while own ship lacks a held
 * position or a held altitude.
 */
export function trafficAround(
  own: Track,
  others: Iterable<Track>,
  now: number,
  view: NdView,
): Placed[] {
  const position = heldPosition(own, now);
  const alt = heldAltitude(own, now);
  if (!position || alt === undefined) return [];
  const origin: Origin = { position, alt, at: own.at };
  const limitNm = (view.rangeNm * (view.g.r - EDGE_PX)) / view.g.r;
  const placed: Placed[] = [];
  for (const t of others) {
    const at = heldPosition(t, now);
    const tAlt = heldAltitude(t, now);
    if (t.hex === own.hex || !at || tAlt === undefined) continue;
    if (Math.abs(tAlt - alt) > TCAS_BAND_FT || !nearOnPlane(position, at, limitNm)) continue;
    const one = placeOnDisplay(origin, t, tAlt, at, view);
    if (one) placed.push(one);
  }
  return placed;
}
