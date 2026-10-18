import { type GeoPoint, turn } from '../../../lib/geo';
import { inverse } from '../../../lib/geodesic';
import { magneticBearing } from '../../../state/magnetic';
import type { Position, Track } from '../../../state/track';
import { holdsAll } from '../freshness';
import { type NdGeometry, ndPoint, onArc, pxOf } from './geometry';
import { type NdFrame } from './readout';

/** The vertical speed in fpm from which TCAS shows a vertical arrow beside traffic (RTCA DO-185B). */
const ARROW_FPM = 500;

/** A relative altitude in whole hundreds of feet, halves rounded away from zero. */
const hundredsOf = (deltaFt: number): number =>
  Math.sign(deltaFt) * Math.round(Math.abs(deltaFt) / 100);

/**
 * The altitude of traffic relative to own ship in hundreds of feet, signed by the rounded value
 * so that level reads `+00`, at least two digits and never clipped. Halves round away from zero.
 */
export function relativeAltitudeLabel(deltaFt: number): string {
  const hundreds = hundredsOf(deltaFt);
  return `${hundreds < 0 ? '-' : '+'}${String(Math.abs(hundreds)).padStart(2, '0')}`;
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

/** Own ship as the traffic is measured from, when it holds a position and an altitude. */
function originOf(own: Track, now: number): Origin | undefined {
  const position = heldPosition(own, now);
  const alt = heldAltitude(own, now);
  return position && alt !== undefined ? { position, alt, at: own.at } : undefined;
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
  const origin = originOf(own, now);
  if (!origin) return [];
  const { position, alt } = origin;
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

/** How far the label stands above or below the symbol's centre, and the arrow right of it, in pixels. */
const LABEL_OFFSET_PX = 12;
const ARROW_GAP_PX = 9;

export type TrafficKind = 'other' | 'proximate' | 'threat';

/** A symbol to draw: its kind and centre, the label centred on its own point and the arrow from its left edge. */
export interface TrafficSymbol {
  kind: TrafficKind;
  x: number;
  y: number;
  label?: { text: string; x: number; y: number } | undefined;
  arrow?: { glyph: '↑' | '↓'; x: number; y: number } | undefined;
}

/** What the ND draws of the traffic: the symbols in paint order, and the annunciations. */
export interface NdTraffic {
  symbols: TrafficSymbol[];
  traffic: boolean;
  offscale: boolean;
}

const NONE: NdTraffic = { symbols: [], traffic: false, offscale: false };

/** The symbol of placed traffic of a kind, with the label of its altitude and the arrow of its rate. */
function symbolOf(kind: TrafficKind, p: Placed, now: number): TrafficSymbol {
  const below = hundredsOf(p.deltaFt) < 0;
  const arrow = verticalArrow(p.track, now);
  return {
    kind,
    x: p.x,
    y: p.y,
    label: {
      text: relativeAltitudeLabel(p.deltaFt),
      x: p.x,
      y: p.y + (below ? LABEL_OFFSET_PX : -LABEL_OFFSET_PX),
    },
    arrow: arrow && { glyph: arrow, x: p.x + ARROW_GAP_PX, y: p.y },
  };
}

/** The traffic the display draws around own ship, none on a lost or blank display. */
export function ndTraffic(
  own: Track,
  others: Iterable<Track>,
  now: number,
  view: NdView,
): NdTraffic {
  if (view.frame.mode === 'lost' || view.frame.mode === 'blank') return NONE;
  const placed = trafficAround(own, others, now, view).map((p) => ({
    kind: trafficKind(p.distanceNm, p.deltaFt),
    p,
  }));
  const symbols = (['other', 'proximate'] as const).flatMap((kind) =>
    placed.filter((t) => t.kind === kind).map((t) => symbolOf(kind, t.p, now)),
  );
  return { symbols, traffic: false, offscale: false };
}
